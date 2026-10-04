import { api, sameOrigin } from '../../../../../lib/http.js';
import { authorizedBooking } from '../../../../../lib/bookings.js';
import { getRepository } from '../../../../../lib/db.js';
export const runtime = 'nodejs';
/** @param {Request} request @param {{params:Promise<{token:string}>}} context */
export function POST(request, { params }) {
  return api(async () => {
    sameOrigin(request);
    const booking = await authorizedBooking((await params).token);
    await (
      await getRepository()
    ).rpc('release_booking', { p_booking_id: booking.id });
    return Response.json({ released: true });
  });
}
