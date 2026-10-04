import 'server-only';
import { randomUUID, createHmac } from 'node:crypto';
import { bookingStartSchema, verifyPaymentSchema } from './validation.js';
import { getRepository, findBooking } from './db.js';
import {
  createToken,
  encryptToken,
  decryptToken,
  hashToken,
  equalSignature,
} from './tokens.js';
import { getProviders } from './providers/index.js';
import { rateLimit, requestIdentity, verifyChallenge } from './security.js';
import { HttpError } from './http.js';
import { readEnv } from './env.js';
import { BOOKING_RULES } from './config.js';

/** @param {string} token @returns {Promise<import('./db.js').Booking>} */
export async function authorizedBooking(token) {
  if (!/^[A-Za-z0-9_-]{43}$/.test(token))
    throw new HttpError(404, 'booking_unavailable');
  await rateLimit(`guest:${hashToken(token)}`, 100);
  const booking = await findBooking(hashToken(token));
  if (!booking) throw new HttpError(404, 'booking_unavailable');
  return booking;
}
/** @param {Request} request @param {unknown} body */
export async function startBooking(request, body) {
  const input = bookingStartSchema.parse(body);
  if (
    input.whatsappOptIn &&
    readEnv().APP_MODE === 'live' &&
    !readEnv().WHATSAPP_ENABLED
  )
    throw new HttpError(400, 'whatsapp_unavailable');
  await rateLimit(`start:ip:${requestIdentity(request)}`, 5);
  await rateLimit(`start:email:${input.email}`, 3);
  if (input.phone) await rateLimit(`start:phone:${input.phone}`, 3);
  await verifyChallenge(input.turnstileToken);
  const token = input.retryToken || createToken();
  const repo = await getRepository();
  const row = /** @type {import('./db.js').Booking & {error?:string}} */ (
    await repo.rpc('reserve_booking', {
      p_input: {
        id: randomUUID(),
        request_key: input.requestKey,
        plan_id: input.planId,
        start_time: input.startTime,
        caller_name: input.name,
        caller_email: input.email,
        caller_phone: input.phone || null,
        whatsapp_opt_in: input.whatsappOptIn,
        consent: input.consent,
        access_token_hash: hashToken(token),
        encrypted_token: encryptToken(token),
      },
    })
  );
  if (row.error) throw new HttpError(409, row.error);
  if (
    row.status !== 'pending' ||
    new Date(row.held_until).getTime() <= Date.now()
  )
    throw new HttpError(409, 'slot_unavailable');
  let orderId = row.razorpay_order_id;
  if (!orderId) {
    if (!(await repo.rpc('claim_order_creation', { p_booking_id: row.id })))
      throw new HttpError(409, 'order_processing');
    try {
      const order = await getProviders().payments.createOrder({
        amountInPaise: row.amount_in_paise,
        currency: 'INR',
        receipt: row.id,
      });
      if (
        order.amountInPaise !== row.amount_in_paise ||
        order.currency !== 'INR' ||
        order.receipt !== row.id
      )
        throw new Error('Provider order mismatch.');
      await repo.rpc('attach_order', {
        p_booking_id: row.id,
        p_order_id: order.id,
      });
      orderId = order.id;
    } catch (error) {
      await repo.rpc('release_booking', { p_booking_id: row.id });
      throw error;
    }
  }
  return {
    bookingId: row.id,
    orderId,
    amount: row.amount_in_paise,
    keyId: readEnv().RAZORPAY_KEY_ID || 'demo',
    holdExpiresAt: row.held_until,
    token: decryptToken(row.encrypted_token),
    simulated: readEnv().APP_MODE === 'demo',
  };
}
/** @param {unknown} body */
export async function verifyPayment(body) {
  const input = verifyPaymentSchema.parse(body);
  await rateLimit(`verify:${hashToken(input.token)}`, 20);
  const booking = await authorizedBooking(input.token);
  if (booking.razorpay_order_id !== input.orderId)
    throw new HttpError(400, 'payment_mismatch');
  const env = readEnv();
  let payment;
  if (env.APP_MODE === 'demo') {
    payment = {
      id: `demo_payment_${input.orderId}`,
      orderId: input.orderId,
      amountInPaise: booking.amount_in_paise,
      currency: 'INR',
      status: 'captured',
    };
  } else {
    const expected = createHmac('sha256', env.RAZORPAY_KEY_SECRET || '')
      .update(`${booking.razorpay_order_id}|${input.paymentId}`)
      .digest('hex');
    if (!equalSignature(expected, input.signature))
      throw new HttpError(400, 'invalid_signature');
    try {
      payment = await getProviders().payments.fetchPayment(input.paymentId);
    } catch {
      return { status: 'processing' };
    }
  }
  if (payment.orderId !== booking.razorpay_order_id)
    throw new HttpError(400, 'payment_mismatch');
  const result = await (
    await getRepository()
  ).rpc('confirm_booking', {
    p_order_id: payment.orderId,
    p_payment_id: payment.id,
    p_amount: payment.amountInPaise,
    p_currency: payment.currency,
  });
  if (result === 'payment_mismatch' || result === 'booking_not_found')
    throw new HttpError(400, 'payment_mismatch');
  return { status: result === 'already_confirmed' ? 'confirmed' : result };
}
/** @param {import('./db.js').Booking} booking @param {number} [now] */
export function canJoin(booking, now = Date.now()) {
  return (
    booking.status === 'confirmed' &&
    now >=
      new Date(booking.start_time).getTime() -
        BOOKING_RULES.joinBeforeMinutes * 60000 &&
    now <=
      new Date(booking.end_time).getTime() +
        BOOKING_RULES.joinAfterMinutes * 60000
  );
}
/** @param {import('./db.js').Booking} booking @param {'host'|'guest'} role */
export async function joinBooking(booking, role) {
  if (!canJoin(booking)) throw new HttpError(403, 'outside_join_window');
  const providers = getProviders();
  let roomId = booking.hms_room_id;
  if (!roomId) {
    const room = await providers.calls.createRoom({
      name: `booking-${booking.id}`,
      mode: booking.call_mode,
    });
    roomId = room.id;
    await (
      await getRepository()
    ).update('bookings', { id: booking.id }, { hms_room_id: roomId });
  }
  return {
    ...(await providers.calls.createJoinToken({
      roomId,
      userId: `${role}-${booking.id}`,
      role,
      mode: booking.call_mode,
      expiresAt: Math.floor(
        Math.min(
          Date.now() + 600000,
          new Date(booking.end_time).getTime() +
            BOOKING_RULES.joinAfterMinutes * 60000,
        ) / 1000,
      ),
    })),
    name: role === 'guest' ? booking.caller_name : readEnv().HOST_NAME,
    mode: booking.call_mode,
  };
}
/** @param {import('./db.js').Booking} booking */
export function guestView(booking) {
  return {
    id: booking.id,
    status: booking.status,
    mode: booking.call_mode,
    name: booking.caller_name,
    durationMinutes: booking.duration_minutes,
    amountInPaise: booking.amount_in_paise,
    startTime: booking.start_time,
    endTime: booking.end_time,
    heldUntil: booking.held_until,
    canJoin: canJoin(booking),
    canCancel:
      booking.status === 'confirmed' &&
      new Date(booking.start_time).getTime() >= Date.now() + 24 * 3600000,
    refundId: booking.razorpay_refund_id,
  };
}
