import { describe, expect, it } from 'vitest';
import { createDemoProviders } from '../lib/providers/demo.js';

describe('explicit demo provider contracts', () => {
  it('returns simulated order and payment identifiers with matching money', async () => {
    const providers = createDemoProviders();
    const order = await providers.payments.createOrder({
      amountInPaise: 29900,
      currency: 'INR',
      receipt: 'test-booking',
    });
    const payment = await providers.payments.fetchPayment(order.id);
    expect(order.simulated).toBe(true);
    expect(order.id).toMatch(/^demo_order_/);
    expect(payment).toMatchObject({
      orderId: order.id,
      amountInPaise: 29900,
      status: 'captured',
      simulated: true,
    });
  });

  it('supports refund retries and rejects a changed request with the same key', async () => {
    const providers = createDemoProviders();
    const input = {
      paymentId: 'demo-payment',
      amountInPaise: 50000,
      idempotencyKey: 'refund-booking-123',
    };
    const first = await providers.payments.refundPayment(input);
    expect(await providers.payments.refundPayment(input)).toEqual(first);
    await expect(
      providers.payments.refundPayment({ ...input, amountInPaise: 29900 }),
    ).rejects.toThrow(/different values/);
  });

  it('reuses rooms by name and keeps audio and video modes distinct', async () => {
    const providers = createDemoProviders();
    const audio = await providers.calls.createRoom({
      name: 'booking-123',
      mode: 'audio',
    });
    expect(
      await providers.calls.createRoom({ name: 'booking-123', mode: 'audio' }),
    ).toEqual(audio);
    await expect(
      providers.calls.createRoom({ name: 'booking-123', mode: 'video' }),
    ).rejects.toThrow(/mode cannot change/);
    const token = await providers.calls.createJoinToken({
      roomId: audio.id,
      userId: 'guest-123',
      role: 'guest',
      mode: 'audio',
      expiresAt: Math.floor(Date.now() / 1000) + 600,
    });
    expect(token).toEqual({
      token: 'DEMO_ONLY_NOT_A_VALID_CALL_TOKEN',
      simulated: true,
    });
  });
});
