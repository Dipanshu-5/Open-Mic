import 'server-only';
import { randomUUID } from 'node:crypto';
import { z } from 'zod';
import { callModeSchema } from '../validation.js';

const orderSchema = z
  .object({
    amountInPaise: z.number().int().positive().max(Number.MAX_SAFE_INTEGER),
    currency: z.literal('INR'),
    receipt: z.string().min(1),
  })
  .strict();

/** In-memory simulation only. Nothing here contacts a provider or persists bookings. */
/** @returns {import('./contracts.js').Providers} */
export function createDemoProviders() {
  /** @type {Map<string, import('./contracts.js').Order>} */
  const orders = new Map();
  /** @type {Map<string, import('./contracts.js').Refund>} */
  const refunds = new Map();
  /** @type {Map<string, { amount: number, paymentId: string }>} */
  const refundInputs = new Map();
  /** @type {Map<string, import('./contracts.js').Room>} */
  const rooms = new Map();

  /** @param {import('./contracts.js').MessageInput} input */
  async function sendMessage(input) {
    z.object({
      to: z.string().min(1),
      template: z.string().min(1),
      variables: z.record(z.string(), z.string()),
    })
      .strict()
      .parse(input);
    return { id: `demo_message_${randomUUID()}`, simulated: true };
  }

  return {
    mode: 'demo',
    payments: {
      async createOrder(input) {
        const valid = orderSchema.parse(input);
        const order = {
          id: `demo_order_${randomUUID()}`,
          ...valid,
          simulated: true,
        };
        orders.set(order.id, order);
        return order;
      },
      async fetchPayment(id) {
        // Explicit convention for tests: a simulated payment references its order ID.
        const order = orders.get(id);
        if (!order) throw new Error('Demo order not found.');
        return {
          id: `demo_payment_${id}`,
          orderId: id,
          amountInPaise: order.amountInPaise,
          currency: 'INR',
          status: 'captured',
          simulated: true,
        };
      },
      async refundPayment(input) {
        const valid = z
          .object({
            paymentId: z.string().min(1),
            amountInPaise: z.number().int().positive(),
            idempotencyKey: z.string().min(10),
          })
          .strict()
          .parse(input);
        const previous = refundInputs.get(valid.idempotencyKey);
        if (
          previous &&
          (previous.amount !== valid.amountInPaise ||
            previous.paymentId !== valid.paymentId)
        ) {
          throw new Error(
            'Demo refund idempotency key was reused with different values.',
          );
        }
        const existing = refunds.get(valid.idempotencyKey);
        if (existing) return existing;
        const refund = {
          id: `demo_refund_${randomUUID()}`,
          paymentId: valid.paymentId,
          status: /** @type {const} */ ('processed'),
          simulated: true,
        };
        refunds.set(valid.idempotencyKey, refund);
        refundInputs.set(valid.idempotencyKey, {
          amount: valid.amountInPaise,
          paymentId: valid.paymentId,
        });
        return refund;
      },
    },
    calls: {
      async createRoom(input) {
        const valid = z
          .object({ name: z.string().min(1), mode: callModeSchema })
          .strict()
          .parse(input);
        const existing = rooms.get(valid.name);
        if (existing && existing.mode !== valid.mode)
          throw new Error('Demo room mode cannot change.');
        if (existing) return existing;
        const room = {
          id: `demo_room_${randomUUID()}`,
          mode: valid.mode,
          simulated: true,
        };
        rooms.set(valid.name, room);
        return room;
      },
      async createJoinToken(input) {
        z.object({
          roomId: z.string().min(1),
          userId: z.string().min(1),
          role: z.enum(['host', 'guest']),
          mode: callModeSchema,
          expiresAt: z.number().int().positive(),
        })
          .strict()
          .parse(input);
        return { token: 'DEMO_ONLY_NOT_A_VALID_CALL_TOKEN', simulated: true };
      },
    },
    notifications: { sendEmail: sendMessage, sendWhatsApp: sendMessage },
  };
}
