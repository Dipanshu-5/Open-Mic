import 'server-only';
import { z } from 'zod';

const optionalText = z.preprocess(
  (value) =>
    typeof value === 'string' && value.trim() === '' ? undefined : value,
  z.string().trim().min(1).optional(),
);
const optionalUrl = z.preprocess(
  (value) =>
    typeof value === 'string' && value.trim() === '' ? undefined : value,
  z.url().optional(),
);
const schema = z
  .object({
    APP_MODE: z.enum(['demo', 'live']).default('demo'),
    NEXT_PUBLIC_SITE_URL: z.url().default('http://localhost:3000'),
    BRAND_NAME: z.string().trim().min(1).default('Conversation Studio'),
    HOST_NAME: z.string().trim().min(1).default('Your host'),
    SUPPORT_EMAIL: optionalText,
    GST_STATUS: z
      .enum(['unconfirmed', 'not_registered', 'registered'])
      .default('unconfirmed'),
    GSTIN: optionalText,
    ADMIN_EMAILS: z.string().default(''),
    DEMO_ADMIN_SECRET: optionalText,
    NEXT_PUBLIC_SUPABASE_URL: optionalUrl,
    NEXT_PUBLIC_SUPABASE_ANON_KEY: optionalText,
    SUPABASE_SERVICE_ROLE_KEY: optionalText,
    RAZORPAY_KEY_ID: optionalText,
    NEXT_PUBLIC_RAZORPAY_KEY_ID: optionalText,
    RAZORPAY_KEY_SECRET: optionalText,
    RAZORPAY_WEBHOOK_SECRET: optionalText,
    HMS_ACCESS_KEY: optionalText,
    HMS_APP_SECRET: optionalText,
    HMS_TEMPLATE_ID_VIDEO: optionalText,
    HMS_TEMPLATE_ID_AUDIO: optionalText,
    RESEND_API_KEY: optionalText,
    EMAIL_FROM: optionalText,
    NEXT_PUBLIC_TURNSTILE_SITE_KEY: optionalText,
    TURNSTILE_SECRET_KEY: optionalText,
    UPSTASH_REDIS_REST_URL: optionalUrl,
    UPSTASH_REDIS_REST_TOKEN: optionalText,
    CRON_SECRET: optionalText,
    BOOKING_LINK_ENCRYPTION_KEY: optionalText,
    WHATSAPP_ENABLED: z
      .enum(['true', 'false'])
      .default('false')
      .transform((value) => value === 'true'),
    WHATSAPP_TOKEN: optionalText,
    WHATSAPP_PHONE_NUMBER_ID: optionalText,
    WHATSAPP_GRAPH_VERSION: optionalText,
  })
  .superRefine((value, context) => {
    /** @param {string} key @param {string} message */
    const issue = (key, message) =>
      context.addIssue({ code: 'custom', path: [key], message });
    if (value.APP_MODE !== 'live') return;

    const required = [
      'NEXT_PUBLIC_SUPABASE_URL',
      'NEXT_PUBLIC_SUPABASE_ANON_KEY',
      'SUPABASE_SERVICE_ROLE_KEY',
      'RAZORPAY_KEY_ID',
      'NEXT_PUBLIC_RAZORPAY_KEY_ID',
      'RAZORPAY_KEY_SECRET',
      'RAZORPAY_WEBHOOK_SECRET',
      'HMS_ACCESS_KEY',
      'HMS_APP_SECRET',
      'HMS_TEMPLATE_ID_VIDEO',
      'HMS_TEMPLATE_ID_AUDIO',
      'RESEND_API_KEY',
      'EMAIL_FROM',
      'NEXT_PUBLIC_TURNSTILE_SITE_KEY',
      'TURNSTILE_SECRET_KEY',
      'UPSTASH_REDIS_REST_URL',
      'UPSTASH_REDIS_REST_TOKEN',
      'CRON_SECRET',
      'BOOKING_LINK_ENCRYPTION_KEY',
    ];
    for (const key of required) {
      if (!Reflect.get(value, key)) issue(key, 'Required in live mode.');
    }
    if (!value.ADMIN_EMAILS.trim())
      issue('ADMIN_EMAILS', 'At least one admin email is required.');
    if (value.RAZORPAY_KEY_ID !== value.NEXT_PUBLIC_RAZORPAY_KEY_ID) {
      issue(
        'NEXT_PUBLIC_RAZORPAY_KEY_ID',
        'Must match the server Razorpay key ID.',
      );
    }
    if (new URL(value.NEXT_PUBLIC_SITE_URL).protocol !== 'https:') {
      issue('NEXT_PUBLIC_SITE_URL', 'Live mode requires an HTTPS site URL.');
    }
    for (const key of ['CRON_SECRET']) {
      const secret = Reflect.get(value, key);
      if (secret && secret.length < 32)
        issue(key, 'Use at least 32 characters.');
    }
    if (
      value.BOOKING_LINK_ENCRYPTION_KEY &&
      !/^[a-f0-9]{64}$/i.test(value.BOOKING_LINK_ENCRYPTION_KEY)
    ) {
      issue(
        'BOOKING_LINK_ENCRYPTION_KEY',
        'Use 32 random bytes encoded as 64 hexadecimal characters.',
      );
    }
    if (value.WHATSAPP_ENABLED) {
      for (const key of [
        'WHATSAPP_TOKEN',
        'WHATSAPP_PHONE_NUMBER_ID',
        'WHATSAPP_GRAPH_VERSION',
      ]) {
        if (!Reflect.get(value, key))
          issue(key, 'Required when WhatsApp is enabled.');
      }
    }
  });

/** @typedef {z.infer<typeof schema>} AppEnvironment */

/** @param {Record<string, string | undefined>} [source] @returns {AppEnvironment} */
export function readEnv(source = process.env) {
  if (source.VERCEL === '1' && source.APP_MODE !== 'live')
    throw new Error(
      'Vercel deployments require live mode with Supabase; the embedded demo is local-only.',
    );
  const result = schema.safeParse(source);
  if (!result.success) {
    // Only field names are reported; validation details may contain sensitive values.
    const names = [
      ...new Set(result.error.issues.map((issue) => issue.path.join('.'))),
    ];
    throw new Error(`Invalid environment configuration: ${names.join(', ')}`);
  }
  const adminEmails = result.data.ADMIN_EMAILS.split(',')
    .map((email) => email.trim())
    .filter(Boolean);
  if (adminEmails.some((email) => !z.email().safeParse(email).success)) {
    throw new Error('Invalid environment configuration: ADMIN_EMAILS');
  }
  if (
    result.data.SUPPORT_EMAIL &&
    !z.email().safeParse(result.data.SUPPORT_EMAIL).success
  ) {
    throw new Error('Invalid environment configuration: SUPPORT_EMAIL');
  }
  return Object.freeze(result.data);
}

/** Explicit allowlist: this is the only configuration passed from server to UI. */
export function publicSiteConfig() {
  const env = readEnv();
  return {
    mode: env.APP_MODE,
    brandName: env.BRAND_NAME,
    hostName: env.HOST_NAME,
  };
}
