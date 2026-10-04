/** @typedef {'video' | 'audio'} CallMode */
/** @typedef {'video_30' | 'video_60' | 'audio_30' | 'audio_60'} PlanId */
/** @typedef {{ id: PlanId, mode: CallMode, durationMinutes: 30 | 60, amountInPaise: number, currency: 'INR', enabled: boolean }} Plan */

/** @type {ReadonlyArray<Readonly<Plan>>} */
export const PLANS = Object.freeze([
  Object.freeze({
    id: 'video_30',
    mode: 'video',
    durationMinutes: 30,
    amountInPaise: 29900,
    currency: 'INR',
    enabled: true,
  }),
  Object.freeze({
    id: 'video_60',
    mode: 'video',
    durationMinutes: 60,
    amountInPaise: 50000,
    currency: 'INR',
    enabled: true,
  }),
  Object.freeze({
    id: 'audio_30',
    mode: 'audio',
    durationMinutes: 30,
    amountInPaise: 29900,
    currency: 'INR',
    enabled: true,
  }),
  Object.freeze({
    id: 'audio_60',
    mode: 'audio',
    durationMinutes: 60,
    amountInPaise: 50000,
    currency: 'INR',
    enabled: true,
  }),
]);

export const BOOKING_RULES = Object.freeze({
  timeZone: 'Asia/Kolkata',
  holdMinutes: 10,
  checkoutTimeoutSeconds: 540,
  minimumNoticeHours: 2,
  maximumAdvanceDays: 30,
  startGridMinutes: 30,
  bufferMinutes: 0,
  guestRefundNoticeHours: 24,
  joinBeforeMinutes: 10,
  joinAfterMinutes: 15,
  recordingEnabled: false,
});

/** @param {unknown} id @returns {Readonly<Plan> | undefined} */
export function getPlan(id) {
  return PLANS.find((plan) => plan.id === id && plan.enabled);
}
