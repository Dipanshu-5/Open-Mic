import 'server-only';

const allowedKeys = new Set([
  'bookingId',
  'orderId',
  'paymentId',
  'refundId',
  'provider',
  'code',
  'attempt',
]);

/** @param {string} event @param {Record<string, string | number>} [fields] */
export function logEvent(event, fields = {}) {
  // Use an allowlist rather than trying to discover secrets or PII after logging.
  const safeFields = Object.fromEntries(
    Object.entries(fields).filter(([key]) => allowedKeys.has(key)),
  );
  console.info(
    JSON.stringify({
      timestamp: new Date().toISOString(),
      event,
      ...safeFields,
    }),
  );
}
