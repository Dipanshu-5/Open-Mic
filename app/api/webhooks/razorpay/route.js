import { createHmac } from 'node:crypto';
import { z } from 'zod';
import { api, HttpError } from '../../../../lib/http.js';
import { readEnv } from '../../../../lib/env.js';
import { equalSignature } from '../../../../lib/tokens.js';
import { getRepository } from '../../../../lib/db.js';
import { processPaymentEvent } from '../../../../lib/workers.js';
import { paymentEventData } from '../../../../lib/payment-events.js';
export const runtime = 'nodejs';
/** @param {Request} request */
export function POST(request) {
  return api(async () => {
    const secret = readEnv().RAZORPAY_WEBHOOK_SECRET;
    if (!secret) throw new HttpError(503, 'webhook_not_configured');
    const raw = await request.text();
    if (raw.length > 262144) throw new HttpError(413, 'request_too_large');
    const expected = createHmac('sha256', secret).update(raw).digest('hex');
    if (
      !equalSignature(
        expected,
        request.headers.get('x-razorpay-signature') || '',
      )
    )
      throw new HttpError(401, 'invalid_signature');
    let payload;
    try {
      payload = JSON.parse(raw);
    } catch {
      throw new HttpError(400, 'invalid_input');
    }
    const eventId = z
      .string()
      .min(1)
      .max(200)
      .parse(request.headers.get('x-razorpay-event-id'));
    const eventType = z.string().parse(payload.event);
    if (
      !['payment.captured', 'order.paid', 'refund.processed'].includes(
        eventType,
      )
    )
      return Response.json({ received: true });
    const eventData = paymentEventData(eventType, payload);
    const repo = await getRepository();
    await repo.insert(
      'payment_events',
      { event_id: eventId, event_type: eventType, event_data: eventData },
      'event_id',
    );
    const event = (await repo.rows('payment_events', { event_id: eventId }))[0];
    if (!event.processed_at) await processPaymentEvent(event);
    return Response.json({ received: true });
  });
}
