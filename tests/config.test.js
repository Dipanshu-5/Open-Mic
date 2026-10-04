import { describe, expect, it } from 'vitest';
import { BOOKING_RULES, getPlan, PLANS } from '../lib/config.js';
import { formatMoney } from '../lib/money.js';
import { addMinutes, formatSessionTime } from '../lib/time.js';
import {
  callModeSchema,
  planSelectionSchema,
  timestampSchema,
} from '../lib/validation.js';

describe('booking configuration', () => {
  it('offers precisely the four agreed plans with paise prices', () => {
    expect(
      PLANS.map(({ id, durationMinutes, amountInPaise }) => [
        id,
        durationMinutes,
        amountInPaise,
      ]),
    ).toEqual([
      ['video_30', 30, 29900],
      ['video_60', 60, 50000],
      ['audio_30', 30, 29900],
      ['audio_60', 60, 50000],
    ]);
    expect(Object.isFrozen(PLANS)).toBe(true);
    expect(PLANS.every(Object.isFrozen)).toBe(true);
  });

  it('rejects phone modes, unknown plans, and client price overrides', () => {
    expect(getPlan('phone_30')).toBeUndefined();
    expect(getPlan(['video_30'])).toBeUndefined();
    expect(callModeSchema.safeParse('phone').success).toBe(false);
    expect(
      planSelectionSchema.safeParse({ planId: 'video_30', amountInPaise: 1 })
        .success,
    ).toBe(false);
  });

  it('sets checkout to expire before the server hold', () => {
    expect(BOOKING_RULES.checkoutTimeoutSeconds).toBeLessThan(
      BOOKING_RULES.holdMinutes * 60,
    );
    expect(BOOKING_RULES.recordingEnabled).toBe(false);
  });
});

describe('money and timezone boundaries', () => {
  it('formats integer paise without rounding away fractions', () => {
    expect(formatMoney(29900)).toBe('₹299');
    expect(formatMoney(50000)).toBe('₹500');
    expect(formatMoney(29950)).toBe('₹299.5');
    for (const amount of [-1, 2.5, Infinity, Number.MAX_SAFE_INTEGER + 1]) {
      expect(() => formatMoney(amount)).toThrow(RangeError);
    }
  });

  it('converts a UTC session across the IST date boundary', () => {
    const formatted = formatSessionTime('2026-10-04T20:00:00Z');
    expect(formatted).toMatch(/5 Oct,? 2026/);
    expect(formatted).toMatch(/1:30\s*am IST$/i);
    expect(addMinutes('2026-10-04T23:30:00Z', 60)).toBe(
      '2026-10-05T00:30:00.000Z',
    );
  });

  it('rejects invalid or unzoned dates rather than using the system timezone', () => {
    expect(() => formatSessionTime('2026-10-04T10:00:00')).toThrow(RangeError);
    expect(() => formatSessionTime('badZ')).toThrow(RangeError);
    expect(timestampSchema.safeParse('2026-10-04T10:00:00').success).toBe(
      false,
    );
    expect(timestampSchema.safeParse('2026-10-04T10:00:00+05:30').success).toBe(
      true,
    );
  });
});
