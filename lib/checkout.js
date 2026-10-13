import { BOOKING_RULES } from './config.js';

/**
 * Client-safe options for Razorpay's on-page checkout. Only the UPI block is
 * displayed; provider defaults must stay disabled to avoid exposing other methods.
 * @param {{keyId:string,orderId:string,amount:number,holdExpiresAt:string}} checkout
 * @param {{name:string,email:string}} details
 * @param {number} [now]
 */
export function upiCheckoutOptions(checkout, details, now = Date.now()) {
  return {
    key: checkout.keyId,
    order_id: checkout.orderId,
    amount: checkout.amount,
    currency: 'INR',
    name: 'Conversation session',
    timeout: Math.min(
      BOOKING_RULES.checkoutTimeoutSeconds,
      Math.max(
        1,
        Math.floor((new Date(checkout.holdExpiresAt).getTime() - now) / 1000) -
          5,
      ),
    ),
    prefill: { name: details.name, email: details.email },
    config: {
      display: {
        blocks: {
          upi: { name: 'Pay with UPI', instruments: [{ method: 'upi' }] },
        },
        sequence: ['block.upi'],
        preferences: { show_default_blocks: false },
      },
    },
  };
}
