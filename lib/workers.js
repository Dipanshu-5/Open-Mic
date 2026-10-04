import 'server-only';
import { randomUUID } from 'node:crypto';
import { getRepository } from './db.js';
import { getProviders } from './providers/index.js';
import { decryptToken } from './tokens.js';
import { readEnv } from './env.js';
import { formatSessionTime } from './time.js';
import { logEvent } from './log.js';

/** @param {number} [deadline] */
export async function processRefunds(deadline = Infinity) {
  const repo = await getRepository();
  const worker = randomUUID();
  const rows = /** @type {Record<string,unknown>[]} */ (
    await repo.rpc('claim_refunds', { p_worker: worker })
  );
  let processed = 0;
  for (const row of rows) {
    if (Date.now() + 15000 >= deadline) break;
    try {
      const refund = await getProviders().payments.refundPayment({
        paymentId: String(row.payment_id),
        amountInPaise: Number(row.amount_in_paise),
        idempotencyKey: String(row.idempotency_key),
      });
      await repo.rpc('finish_refund', {
        p_booking_id: row.booking_id,
        p_worker: worker,
        p_refund_id: refund.id,
        p_processed: refund.status === 'processed',
      });
      processed++;
    } catch {
      await repo.rpc('finish_refund', {
        p_booking_id: row.booking_id,
        p_worker: worker,
        p_refund_id: null,
        p_processed: false,
      });
      logEvent('refund_retry', {
        bookingId: String(row.booking_id),
        code: 'provider_failed',
      });
    }
  }
  return processed;
}
/** @param {number} [deadline] */
export async function processNotifications(deadline = Infinity) {
  const repo = await getRepository();
  const worker = randomUUID();
  const rows = /** @type {Record<string,unknown>[]} */ (
    await repo.rpc('claim_notifications', { p_worker: worker })
  );
  let sent = 0;
  for (const row of rows) {
    if (Date.now() + 15000 >= deadline) break;
    let success = false;
    try {
      const booking = /** @type {import('./db.js').Booking} */ (
        (await repo.rows('bookings', { id: row.booking_id }))[0]
      );
      if (!booking) throw new Error('Missing booking.');
      if (
        (String(row.template).startsWith('reminder') ||
          row.template === 'booking_confirmed') &&
        booking.status !== 'confirmed'
      ) {
        success = true;
        continue;
      }
      const env = readEnv();
      const link = `${env.NEXT_PUBLIC_SITE_URL}/b/${decryptToken(booking.encrypted_token)}`;
      const mode =
        booking.call_mode === 'video' ? 'video call' : 'browser audio';
      const time = formatSessionTime(booking.start_time);
      const isRefund = String(row.template).includes('refund');
      const subject = isRefund
        ? 'Your session refund request'
        : String(row.template).startsWith('reminder')
          ? 'Your conversation is coming up'
          : 'Your conversation is confirmed';
      const body = `Hello ${booking.caller_name},\n\n${isRefund ? 'A full refund has been requested. Check your booking page for its status.' : 'Your one-to-one conversation session is booked.'}\n${mode} · ${booking.duration_minutes} minutes\n${time}\n\nYour private booking page: ${link}\nAdd to calendar: ${link.replace('/b/', '/api/b/')}/calendar\n\n${env.BRAND_NAME}\n${env.SUPPORT_EMAIL || 'Contact details are awaiting configuration.'}`;
      const message = {
        to:
          String(row.channel) === 'email'
            ? booking.caller_email
            : booking.caller_phone || '',
        template: String(row.template),
        variables: {
          name: booking.caller_name,
          time,
          mode,
          link,
          subject,
          body,
          messageId: `${row.id}-${row.generation}`,
        },
      };
      if (row.channel === 'whatsapp') {
        if (!booking.whatsapp_opt_in || !env.WHATSAPP_ENABLED)
          throw new Error('WhatsApp unavailable.');
        await getProviders().notifications.sendWhatsApp(message);
      } else await getProviders().notifications.sendEmail(message);
      success = true;
      sent++;
    } catch {
      logEvent('notification_retry', {
        bookingId: String(row.booking_id),
        code: 'provider_failed',
      });
    } finally {
      await repo.rpc('finish_notification', {
        p_id: row.id,
        p_worker: worker,
        p_success: success,
      });
    }
  }
  return sent;
}

/** @param {Record<string,unknown>} event @param {import('./db.js').Repository} [repository] */
export async function processPaymentEvent(event, repository) {
  const repo = repository || (await getRepository());
  const data = /** @type {Record<string,unknown>} */ (event.event_data);
  if (
    event.event_type === 'payment.captured' ||
    event.event_type === 'order.paid'
  ) {
    let matches = await repo.rows('bookings', {
      razorpay_order_id: data.orderId,
    });
    if (!matches.length && typeof data.bookingId === 'string') {
      const pending = await repo.rows('bookings', { id: data.bookingId });
      if (pending.length && pending[0].razorpay_order_id == null) {
        await repo.rpc('attach_order', {
          p_booking_id: data.bookingId,
          p_order_id: data.orderId,
        });
        matches = pending;
      }
    }
    if (!matches.length) throw new Error('Booking not yet attached.');
    const status = await repo.rpc('confirm_booking', {
      p_order_id: data.orderId,
      p_payment_id: data.paymentId,
      p_amount: data.amount,
      p_currency: data.currency,
    });
    if (status === 'payment_mismatch' || status === 'booking_not_found')
      throw new Error('Payment reconciliation required.');
  } else if (event.event_type === 'refund.processed') {
    const rows = await repo.rows('refund_operations', {
      payment_id: data.paymentId,
    });
    for (const row of rows) {
      if (Number(data.amount) !== Number(row.amount_in_paise))
        throw new Error('Refund amount mismatch.');
      if (row.provider_refund_id && row.provider_refund_id !== data.refundId)
        throw new Error('Refund identifier mismatch.');
      await repo.update(
        'refund_operations',
        { booking_id: row.booking_id },
        { provider_refund_id: data.refundId, status: 'processed' },
      );
      await repo.update(
        'bookings',
        { id: row.booking_id },
        { razorpay_refund_id: data.refundId, status: 'refunded' },
      );
    }
  }
  await repo.update(
    'payment_events',
    { event_id: event.event_id },
    {
      processed_at: new Date().toISOString(),
      attempts: Number(event.attempts || 0) + 1,
    },
  );
}

export async function maintenance() {
  const deadline = Date.now() + 40000;
  const repo = await getRepository();
  await repo.rpc('expire_stale_holds');
  await repo.rpc('purge_old_data');
  const events = /** @type {Record<string,unknown>[]} */ (
    await repo.rpc('pending_payment_events')
  );
  for (const event of events) {
    if (Date.now() + 10000 >= deadline) break;
    try {
      await processPaymentEvent(event);
    } catch {
      logEvent('payment_event_retry', { code: 'reconciliation_required' });
    }
  }
  const refunds = await processRefunds(deadline);
  const notifications = await processNotifications(deadline);
  const env = readEnv();
  if (env.APP_MODE === 'live') {
    const authorization = `Basic ${Buffer.from(`${env.RAZORPAY_KEY_ID}:${env.RAZORPAY_KEY_SECRET}`).toString('base64')}`;
    const pending = /** @type {Record<string,unknown>[]} */ (
      await repo.rpc('reconciliation_candidates')
    );
    for (const row of pending) {
      if (Date.now() + 10000 >= deadline) break;
      try {
        const response = await fetch(
          `https://api.razorpay.com/v1/orders/${encodeURIComponent(String(row.razorpay_order_id))}/payments`,
          {
            headers: { Authorization: authorization },
            signal: AbortSignal.timeout(10000),
          },
        );
        if (!response.ok) throw new Error('Provider unavailable.');
        const data = await response.json();
        for (const payment of data.items || []) {
          if (payment.status === 'captured')
            await repo.rpc('confirm_booking', {
              p_order_id: row.razorpay_order_id,
              p_payment_id: payment.id,
              p_amount: payment.amount,
              p_currency: payment.currency,
            });
        }
      } catch {
        logEvent('payment_reconcile_retry', {
          bookingId: String(row.id),
          code: 'provider_failed',
        });
      }
    }
    const submitted = /** @type {Record<string,unknown>[]} */ (
      await repo.rpc('submitted_refunds')
    );
    for (const row of submitted) {
      if (Date.now() + 10000 >= deadline) break;
      try {
        const response = await fetch(
          `https://api.razorpay.com/v1/refunds/${encodeURIComponent(String(row.provider_refund_id))}`,
          {
            headers: { Authorization: authorization },
            signal: AbortSignal.timeout(10000),
          },
        );
        if (!response.ok) throw new Error('Provider unavailable.');
        const refund = await response.json();
        if (refund.status === 'processed')
          await processPaymentEvent({
            event_id: `reconcile-${refund.id}`,
            event_type: 'refund.processed',
            event_data: {
              paymentId: refund.payment_id,
              refundId: refund.id,
              amount: refund.amount,
            },
          });
      } catch {
        logEvent('refund_reconcile_retry', {
          bookingId: String(row.booking_id),
          code: 'provider_failed',
        });
      }
    }
  }
  return { refunds, notifications, events: events.length };
}
