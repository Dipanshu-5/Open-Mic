import { describe, it, expect } from 'vitest';
import { paymentEventData } from '../lib/payment-events.js';
const payment = {
  id: 'pay_test',
  order_id: 'order_test',
  amount: 29900,
  currency: 'INR',
  status: 'captured',
  notes: [],
  email: 'private@example.com',
  contact: '+919876543210',
};
describe('Razorpay webhook compatibility', () => {
  it('accepts the documented empty-array notes and drops contact fields', () => {
    const data = paymentEventData('payment.captured', {
      payload: { payment: { entity: payment } },
    });
    expect(data).toMatchObject({
      orderId: 'order_test',
      paymentId: 'pay_test',
      amount: 29900,
    });
    expect(data).not.toHaveProperty('email');
    expect(data).not.toHaveProperty('contact');
  });
  it('recovers the booking from matching order notes', () => {
    const id = crypto.randomUUID();
    const payload = {
      payload: {
        payment: { entity: payment },
        order: { entity: { id: 'order_test', notes: { booking_id: id } } },
      },
    };
    expect(paymentEventData('order.paid', payload)?.bookingId).toBe(id);
    payload.payload.order.entity.id = 'another_order';
    expect(paymentEventData('order.paid', payload)?.bookingId).toBeUndefined();
  });
  it('rejects authorised-only payments and mismatched currency', () => {
    expect(() =>
      paymentEventData('payment.captured', {
        payload: { payment: { entity: { ...payment, status: 'authorized' } } },
      }),
    ).toThrow();
    expect(() =>
      paymentEventData('payment.captured', {
        payload: { payment: { entity: { ...payment, currency: 'USD' } } },
      }),
    ).toThrow();
  });
});
