import { BOOKING_RULES } from './config.js';

/** @param {string | Date} value */
function validDate(value) {
  // Reject unzoned strings so dates cannot depend on the host machine timezone.
  if (typeof value === 'string' && !/(?:Z|[+-]\d{2}:\d{2})$/i.test(value)) {
    throw new RangeError('Timestamps must include a timezone.');
  }
  const date = new Date(value);
  if (!Number.isFinite(date.getTime()))
    throw new RangeError('Invalid timestamp.');
  return date;
}

/** @param {string | Date} value */
export function formatSessionTime(value) {
  return `${new Intl.DateTimeFormat('en-IN', {
    timeZone: BOOKING_RULES.timeZone,
    weekday: 'short',
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
  }).format(validDate(value))} IST`;
}

/** @param {string | Date} value @param {number} minutes */
export function addMinutes(value, minutes) {
  if (!Number.isFinite(minutes)) throw new RangeError('Invalid duration.');
  return new Date(validDate(value).getTime() + minutes * 60_000).toISOString();
}
