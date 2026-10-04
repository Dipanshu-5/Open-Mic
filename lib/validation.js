import { z } from 'zod';
import { getPlan } from './config.js';

export const planIdSchema = z
  .enum(['video_30', 'video_60', 'audio_30', 'audio_60'])
  .refine((id) => Boolean(getPlan(id)), 'This plan is not available.');
export const callModeSchema = z.enum(['video', 'audio']);
export const timestampSchema = z.iso.datetime({ offset: true });

/** Validate a plan before using it in server-owned price and duration calculations. */
export const planSelectionSchema = z.object({ planId: planIdSchema }).strict();

export const bookingStartSchema = z
  .object({
    planId: planIdSchema,
    startTime: timestampSchema,
    name: z.string().trim().min(1).max(100),
    email: z
      .email()
      .max(254)
      .transform((value) => value.toLowerCase()),
    phone: z
      .string()
      .regex(/^\+[1-9][0-9]{7,14}$/)
      .optional()
      .or(z.literal('')),
    whatsappOptIn: z.boolean(),
    consent: z
      .object({
        adult: z.literal(true),
        terms: z.literal(true),
        privacy: z.literal(true),
      })
      .strict(),
    turnstileToken: z.string().max(2048),
    requestKey: z.uuid(),
    retryToken: z
      .string()
      .regex(/^[A-Za-z0-9_-]{43}$/)
      .optional(),
  })
  .strict()
  .refine(
    (value) => !value.whatsappOptIn || Boolean(value.phone),
    'A WhatsApp number is required when opting in.',
  );
export const verifyPaymentSchema = z
  .object({
    token: z.string().regex(/^[A-Za-z0-9_-]{43}$/),
    orderId: z.string().min(1).max(100),
    paymentId: z.string().max(100),
    signature: z.string().max(256),
  })
  .strict();
export const availabilitySchema = z
  .object({ planId: planIdSchema, date: z.iso.date() })
  .strict();
