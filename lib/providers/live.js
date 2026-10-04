import 'server-only';
import { randomUUID } from 'node:crypto';
import { SignJWT } from 'jose';
import { Resend } from 'resend';
import { readEnv } from '../env.js';
import { z } from 'zod';
import { assertSafeCallTemplate } from './call-safety.js';

/** @param {string} url @param {RequestInit} init */
async function externalJson(url, init) {
  const response = await fetch(url, {
    ...init,
    signal: AbortSignal.timeout(15000),
  });
  if (!response.ok) throw new Error('Provider request failed.');
  return response.json();
}
/** @returns {import('./contracts.js').Providers} */
export function createLiveProviders() {
  const env = readEnv();
  const authorization = `Basic ${Buffer.from(`${env.RAZORPAY_KEY_ID}:${env.RAZORPAY_KEY_SECRET}`).toString('base64')}`;
  /** @param {string} path @param {RequestInit} [init] */
  const razorpay = (path, init = {}) =>
    externalJson(`https://api.razorpay.com/v1/${path}`, {
      ...init,
      headers: {
        Authorization: authorization,
        'Content-Type': 'application/json',
        ...init.headers,
      },
    });
  /** @param {Record<string,unknown>} payload */
  const jwt = (payload, expiresAt = Math.floor(Date.now() / 1000) + 600) =>
    new SignJWT(payload)
      .setProtectedHeader({ alg: 'HS256' })
      .setIssuedAt()
      .setNotBefore(0)
      .setExpirationTime(expiresAt)
      .setJti(randomUUID())
      .sign(new TextEncoder().encode(env.HMS_APP_SECRET));
  /** @param {'audio'|'video'} mode */
  const safeTemplate = async (mode) => {
    const token = await jwt({
      access_key: env.HMS_ACCESS_KEY,
      type: 'management',
      version: 2,
    });
    const id =
      mode === 'video' ? env.HMS_TEMPLATE_ID_VIDEO : env.HMS_TEMPLATE_ID_AUDIO;
    assertSafeCallTemplate(
      await externalJson(
        `https://api.100ms.live/v2/templates/${encodeURIComponent(id || '')}`,
        { headers: { Authorization: `Bearer ${token}` } },
      ),
      mode,
    );
    return token;
  };
  return {
    mode: 'live',
    payments: {
      async createOrder(input) {
        const order = await razorpay('orders', {
          method: 'POST',
          body: JSON.stringify({
            amount: input.amountInPaise,
            currency: input.currency,
            receipt: input.receipt,
            notes: { booking_id: input.receipt },
          }),
        });
        const result = z
          .object({
            id: z.string(),
            amount: z.number(),
            currency: z.literal('INR'),
            receipt: z.string(),
          })
          .parse(order);
        return {
          id: result.id,
          amountInPaise: result.amount,
          currency: result.currency,
          receipt: result.receipt,
          simulated: false,
        };
      },
      async fetchPayment(id) {
        const payment = z
          .object({
            id: z.string(),
            order_id: z.string(),
            amount: z.number(),
            currency: z.literal('INR'),
            status: z.string(),
          })
          .parse(await razorpay(`payments/${encodeURIComponent(id)}`));
        if (payment.status !== 'captured')
          throw new Error('Payment is not captured.');
        return {
          id: payment.id,
          orderId: payment.order_id,
          amountInPaise: payment.amount,
          currency: payment.currency,
          status: 'captured',
          simulated: false,
        };
      },
      async refundPayment(input) {
        const refund = z
          .object({
            id: z.string(),
            payment_id: z.string(),
            status: z.enum(['pending', 'processed', 'failed']),
          })
          .parse(
            await razorpay(
              `payments/${encodeURIComponent(input.paymentId)}/refund`,
              {
                method: 'POST',
                headers: { 'X-Refund-Idempotency': input.idempotencyKey },
                body: JSON.stringify({
                  amount: input.amountInPaise,
                  speed: 'normal',
                }),
              },
            ),
          );
        if (refund.status === 'failed') throw new Error('Refund failed.');
        return {
          id: refund.id,
          paymentId: refund.payment_id,
          status: refund.status,
          simulated: false,
        };
      },
    },
    calls: {
      async createRoom(input) {
        const token = await safeTemplate(input.mode);
        const room = z
          .object({ id: z.string() })
          .parse(
            await externalJson('https://api.100ms.live/v2/rooms', {
              method: 'POST',
              headers: {
                Authorization: `Bearer ${token}`,
                'Content-Type': 'application/json',
              },
              body: JSON.stringify({
                name: input.name,
                template_id:
                  input.mode === 'video'
                    ? env.HMS_TEMPLATE_ID_VIDEO
                    : env.HMS_TEMPLATE_ID_AUDIO,
                region: 'in',
                recording_info: { enabled: false },
              }),
            }),
          );
        return { id: room.id, mode: input.mode, simulated: false };
      },
      async createJoinToken(input) {
        await safeTemplate(input.mode);
        return {
          token: await jwt(
            {
              access_key: env.HMS_ACCESS_KEY,
              room_id: input.roomId,
              user_id: input.userId,
              role: input.role,
              type: 'app',
              version: 2,
            },
            input.expiresAt,
          ),
          simulated: false,
        };
      },
    },
    notifications: {
      async sendEmail(input) {
        const resend = new Resend(env.RESEND_API_KEY);
        const result = await resend.emails.send(
          {
            from: env.EMAIL_FROM || '',
            to: input.to,
            subject: input.variables.subject || 'Your conversation session',
            text: input.variables.body || '',
          },
          {
            idempotencyKey: input.variables.messageId,
            signal: AbortSignal.timeout(15000),
          },
        );
        if (result.error || !result.data)
          throw new Error('Email provider failed.');
        return { id: result.data.id, simulated: false };
      },
      async sendWhatsApp(input) {
        const version = env.WHATSAPP_GRAPH_VERSION;
        const data = await externalJson(
          `https://graph.facebook.com/${version}/${env.WHATSAPP_PHONE_NUMBER_ID}/messages`,
          {
            method: 'POST',
            headers: {
              Authorization: `Bearer ${env.WHATSAPP_TOKEN}`,
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({
              messaging_product: 'whatsapp',
              to: input.to.replace('+', ''),
              type: 'template',
              template: {
                name: input.template,
                language: { code: 'en' },
                components: [
                  {
                    type: 'body',
                    parameters: [
                      input.variables.name,
                      input.variables.time,
                      input.variables.mode,
                      input.variables.link,
                    ].map((text) => ({ type: 'text', text })),
                  },
                ],
              },
            }),
          },
        );
        return { id: data.messages[0].id, simulated: false };
      },
    },
  };
}
