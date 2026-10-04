import { api } from '../../../../lib/http.js';
import { authorizedBooking, guestView } from '../../../../lib/bookings.js';
export const runtime = 'nodejs';
/** @param {Request} request @param {{params:Promise<{token:string}>}} context */
export function GET(request, { params }) {
  return api(async () =>
    Response.json(guestView(await authorizedBooking((await params).token))),
  );
}
