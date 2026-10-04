import { afterEach, describe, expect, it, vi } from 'vitest';
import { publicSiteConfig, readEnv } from '../lib/env.js';
import { getProviders } from '../lib/providers/index.js';

/** @returns {Record<string, string>} */
function liveEnvironment() {
  return {
    APP_MODE: 'live',
    NEXT_PUBLIC_SITE_URL: 'https://example.com',
    ADMIN_EMAILS: 'host@example.com',
    NEXT_PUBLIC_SUPABASE_URL: 'https://example.supabase.co',
    NEXT_PUBLIC_SUPABASE_ANON_KEY: 'test-anon',
    SUPABASE_SERVICE_ROLE_KEY: 'TEST_SERVICE_ROLE_SECRET',
    RAZORPAY_KEY_ID: 'rzp_test_example',
    NEXT_PUBLIC_RAZORPAY_KEY_ID: 'rzp_test_example',
    RAZORPAY_KEY_SECRET: 'TEST_RAZORPAY_SECRET',
    RAZORPAY_WEBHOOK_SECRET: 'TEST_WEBHOOK_SECRET',
    HMS_ACCESS_KEY: 'test-hms-key',
    HMS_APP_SECRET: 'test-hms-secret',
    HMS_TEMPLATE_ID_VIDEO: 'video-template',
    HMS_TEMPLATE_ID_AUDIO: 'audio-template',
    RESEND_API_KEY: 'test-resend-key',
    EMAIL_FROM: 'bookings@example.com',
    NEXT_PUBLIC_TURNSTILE_SITE_KEY: 'test-site-key',
    TURNSTILE_SECRET_KEY: 'test-turnstile-secret',
    UPSTASH_REDIS_REST_URL: 'https://example.upstash.io',
    UPSTASH_REDIS_REST_TOKEN: 'test-upstash-token',
    CRON_SECRET: 'a'.repeat(32),
    BOOKING_LINK_ENCRYPTION_KEY: 'b'.repeat(64),
  };
}

afterEach(() => vi.unstubAllEnvs());

describe('environment validation and integration selection', () => {
  it('runs the explicit preview without provider credentials', () => {
    const env = readEnv({});
    expect(env.APP_MODE).toBe('demo');
    expect(env.WHATSAPP_ENABLED).toBe(false);
    expect(env.SUPABASE_SERVICE_ROLE_KEY).toBeUndefined();
    expect(
      readEnv({ RESEND_API_KEY: '', WHATSAPP_TOKEN: '' }).RESEND_API_KEY,
    ).toBeUndefined();
  });

  it('fails closed when live credentials are missing', () => {
    expect(() => readEnv({ APP_MODE: 'live' })).toThrow(
      /SUPABASE_SERVICE_ROLE_KEY/,
    );
    expect(readEnv(liveEnvironment()).APP_MODE).toBe('live');
  });

  it('rejects mismatched payment keys, weak encryption, and insecure site URLs', () => {
    const env = liveEnvironment();
    expect(() =>
      readEnv({ ...env, NEXT_PUBLIC_RAZORPAY_KEY_ID: 'different' }),
    ).toThrow(/NEXT_PUBLIC_RAZORPAY_KEY_ID/);
    expect(() =>
      readEnv({ ...env, BOOKING_LINK_ENCRYPTION_KEY: 'weak' }),
    ).toThrow(/BOOKING_LINK_ENCRYPTION_KEY/);
    expect(() =>
      readEnv({ ...env, NEXT_PUBLIC_SITE_URL: 'http://example.com' }),
    ).toThrow(/NEXT_PUBLIC_SITE_URL/);
    expect(() => readEnv({ ...env, CRON_SECRET: 'weak' })).toThrow(
      /CRON_SECRET/,
    );
  });

  it('requires WhatsApp configuration only when enabled in live mode', () => {
    expect(() =>
      readEnv({ ...liveEnvironment(), WHATSAPP_ENABLED: 'true' }),
    ).toThrow(/WHATSAPP_TOKEN/);
    expect(() =>
      readEnv({ ...liveEnvironment(), WHATSAPP_ENABLED: 'maybe' }),
    ).toThrow(/WHATSAPP_ENABLED/);
  });

  it('never includes credentials or supplied values in validation errors', () => {
    const secret = 'PRIVATE_VALUE_DO_NOT_PRINT';
    try {
      readEnv({ ...liveEnvironment(), BOOKING_LINK_ENCRYPTION_KEY: secret });
    } catch (error) {
      expect(String(error)).toContain('BOOKING_LINK_ENCRYPTION_KEY');
      expect(String(error)).not.toContain(secret);
    }
  });

  it('passes only an explicit public allowlist to the UI', () => {
    vi.stubEnv('APP_MODE', 'demo');
    vi.stubEnv('SUPABASE_SERVICE_ROLE_KEY', 'PRIVATE_VALUE_DO_NOT_PRINT');
    expect(Object.keys(publicSiteConfig()).sort()).toEqual([
      'brandName',
      'hostName',
      'mode',
    ]);
    expect(JSON.stringify(publicSiteConfig())).not.toContain('PRIVATE_VALUE');
  });

  it('cannot silently fall back to demo providers in live mode', () => {
    for (const [key, value] of Object.entries(liveEnvironment()))
      vi.stubEnv(key, value);
    expect(getProviders().mode).toBe('live');
  });
});
