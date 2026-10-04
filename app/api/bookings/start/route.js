import { api, sameOrigin, requestJson } from '../../../../lib/http.js';
import { startBooking } from '../../../../lib/bookings.js';
export const runtime = 'nodejs';
/** @param {Request} request */
export function POST(request) {
  return api(async () => {
    sameOrigin(request);
    return Response.json(
      await startBooking(request, await requestJson(request)),
    );
  });
}
