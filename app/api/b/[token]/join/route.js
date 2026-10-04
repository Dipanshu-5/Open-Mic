import { api, sameOrigin } from '../../../../../lib/http.js';
import { authorizedBooking, joinBooking } from '../../../../../lib/bookings.js';
export const runtime = 'nodejs';
/** @param {Request} request @param {{params:Promise<{token:string}>}} context */
export function POST(request, { params }) {
  return api(async () => {
    sameOrigin(request);
    return Response.json(
      await joinBooking(await authorizedBooking((await params).token), 'guest'),
    );
  });
}
