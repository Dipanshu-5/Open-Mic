import { z } from 'zod';
const notes = z.preprocess(
  (value) => (Array.isArray(value) && value.length === 0 ? undefined : value),
  z.object({ booking_id: z.uuid().optional() }).optional(),
);
const paymentSchema = z.object({
  id: z.string(),
  order_id: z.string(),
  amount: z.number().int().positive(),
  currency: z.literal('INR'),
  status: z.literal('captured'),
  notes,
});
const refundSchema = z.object({
  id: z.string(),
  payment_id: z.string(),
  amount: z.number().int().positive(),
  status: z.literal('processed'),
});
/** Extract only reconciliation data, dropping contact and payment-method fields.
 * Razorpay represents empty notes as [] in its documented webhook payloads.
 * @param {string} type @param {unknown} payload
 * @returns {Record<string,unknown>|null}
 */
export function paymentEventData(type, payload) {
  const event = z
    .object({
      payload: z.object({
        payment: z.object({ entity: z.unknown() }).optional(),
        order: z.object({ entity: z.unknown() }).optional(),
        refund: z.object({ entity: z.unknown() }).optional(),
      }),
    })
    .parse(payload);
  if (type === 'payment.captured' || type === 'order.paid') {
    const payment = paymentSchema.parse(event.payload.payment?.entity);
    const order = event.payload.order
      ? z.object({ id: z.string(), notes }).parse(event.payload.order.entity)
      : undefined;
    return {
      orderId: payment.order_id,
      paymentId: payment.id,
      amount: payment.amount,
      currency: payment.currency,
      bookingId:
        payment.notes?.booking_id ||
        (order?.id === payment.order_id ? order.notes?.booking_id : undefined),
    };
  }
  if (type === 'refund.processed') {
    const refund = refundSchema.parse(event.payload.refund?.entity);
    return {
      refundId: refund.id,
      paymentId: refund.payment_id,
      amount: refund.amount,
    };
  }
  return null;
}
