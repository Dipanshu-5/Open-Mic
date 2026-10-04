/** @param {string} url @param {unknown} [body] */
export async function jsonRequest(url, body) {
  const response = await fetch(url, {
    method: body === undefined ? 'GET' : 'POST',
    headers: body === undefined ? {} : { 'Content-Type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body),
    cache: 'no-store',
    signal: AbortSignal.timeout(25000),
  });
  const data = await response.json();
  if (!response.ok)
    throw new Error(
      typeof data.error === 'string' ? data.error : 'temporarily_unavailable',
    );
  return data;
}
/** @param {unknown} error */
export function friendlyError(error) {
  const code = error instanceof Error ? error.message : '';
  const messages = /** @type {Record<string,string>} */ ({
    slot_unavailable:
      'Someone just selected this time. Please choose another available time.',
    too_many_requests: 'Please wait a few minutes before trying again.',
    order_processing:
      'Secure checkout is being prepared. Please retry shortly.',
    challenge_failed: 'Please complete the security check again.',
    invalid_input: 'Please check your details and required consent boxes.',
    outside_join_window:
      'Your room opens 10 minutes before the session and closes 15 minutes after it ends.',
    booking_unavailable: 'This booking link is unavailable.',
    contact_host: 'Please contact the host for cancellations within 24 hours.',
    invalid_signature:
      'The payment could not be verified. Please check your booking page or contact support.',
  });
  return (
    messages[code] ||
    'Something interrupted the request. Please try again shortly.'
  );
}
