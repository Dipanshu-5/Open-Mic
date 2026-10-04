import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  createToken,
  encryptToken,
  decryptToken,
  hashToken,
  equalSignature,
} from '../lib/tokens.js';
import { canJoin } from '../lib/bookings.js';
import { bookingStartSchema } from '../lib/validation.js';
import { GET as adminData } from '../app/api/admin/data/route.js';
import { POST as webhook } from '../app/api/webhooks/razorpay/route.js';
import { GET as guest } from '../app/api/b/[token]/route.js';
import { calendarEvent } from '../lib/calendar.js';
afterEach(() => vi.unstubAllEnvs());
describe('server trust boundaries', () => {
  it('encrypts guest links and rejects tampering', () => {
    vi.stubEnv('APP_MODE', 'demo');
    const token = createToken();
    expect(token).toHaveLength(43);
    const encrypted = encryptToken(token);
    expect(encrypted).not.toContain(token);
    expect(decryptToken(encrypted)).toBe(token);
    const bytes = Buffer.from(encrypted, 'base64url');
    bytes[30] ^= 1;
    expect(() => decryptToken(bytes.toString('base64url'))).toThrow();
    expect(hashToken(token)).toHaveLength(64);
  });
  it('compares only valid fixed-length signatures without throwing', () => {
    expect(equalSignature('a'.repeat(64), 'a'.repeat(64))).toBe(true);
    expect(equalSignature('a'.repeat(64), 'b'.repeat(64))).toBe(false);
    expect(equalSignature('a'.repeat(64), 'not-hex')).toBe(false);
  });
  it('enforces both join-window endpoints and confirmed status', () => {
    const start = Date.parse('2026-10-04T10:00:00Z');
    const booking = /** @type {import('../lib/db.js').Booking} */ ({
      status: 'confirmed',
      start_time: new Date(start).toISOString(),
      end_time: new Date(start + 1800000).toISOString(),
    });
    expect(canJoin(booking, start - 600001)).toBe(false);
    expect(canJoin(booking, start - 600000)).toBe(true);
    expect(canJoin(booking, start + 2700000)).toBe(true);
    expect(canJoin(booking, start + 2700001)).toBe(false);
    expect(canJoin({ ...booking, status: 'pending' }, start)).toBe(false);
  });
  it('rejects a client-controlled amount and missing age consent', () => {
    const body = {
      planId: 'video_30',
      startTime: '2026-10-10T04:30:00Z',
      name: 'Guest',
      email: 'guest@example.com',
      whatsappOptIn: false,
      consent: { adult: true, terms: true, privacy: true },
      turnstileToken: '',
      requestKey: crypto.randomUUID(),
    };
    expect(bookingStartSchema.safeParse(body).success).toBe(true);
    expect(bookingStartSchema.safeParse({ ...body, amount: 1 }).success).toBe(
      false,
    );
    expect(
      bookingStartSchema.safeParse({
        ...body,
        consent: { ...body.consent, adult: false },
      }).success,
    ).toBe(false);
  });
  it('rejects admin API access when no host session exists', async () => {
    vi.stubEnv('APP_MODE', 'demo');
    vi.stubEnv('DEMO_ADMIN_SECRET', '');
    expect((await adminData()).status).toBe(401);
  });
  it('rejects a tampered webhook before reading or writing the database', async () => {
    vi.stubEnv('APP_MODE', 'demo');
    vi.stubEnv('RAZORPAY_WEBHOOK_SECRET', 'test-webhook-secret');
    const response = await webhook(
      new Request('http://localhost:3000/api/webhooks/razorpay', {
        method: 'POST',
        body: '{"event":"payment.captured"}',
        headers: { 'x-razorpay-signature': '0'.repeat(64) },
      }),
    );
    expect(response.status).toBe(401);
  });
  it('returns the same generic error for malformed guest tokens', async () => {
    const response = await guest(
      new Request('http://localhost:3000/api/b/invalid'),
      { params: Promise.resolve({ token: 'invalid' }) },
    );
    expect(response.status).toBe(404);
    expect(await response.json()).toEqual({ error: 'booking_unavailable' });
  });
  it('exports UTC calendar timestamps without embedding private access tokens', () => {
    const content = calendarEvent({
      id: 'test-booking',
      call_mode: 'audio',
      start_time: '2026-10-04T04:30:00Z',
      end_time: '2026-10-04T05:00:00Z',
    });
    expect(content).toContain('DTSTART:20261004T043000Z');
    expect(content).toContain('DTEND:20261004T050000Z');
    expect(content).toContain('Browser audio conversation');
    expect(content).not.toContain('/b/');
  });
});
