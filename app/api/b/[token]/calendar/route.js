import { api } from '../../../../../lib/http.js';
import { authorizedBooking } from '../../../../../lib/bookings.js';
import { calendarEvent } from '../../../../../lib/calendar.js';
export const runtime = 'nodejs';
/** @param {Request} request @param {{params:Promise<{token:string}>}} context */
export function GET(request, { params }) {
  return api(async () => {
    const booking = await authorizedBooking((await params).token);
    return new Response(calendarEvent(booking), {
      headers: {
        'Content-Type': 'text/calendar; charset=utf-8',
        'Content-Disposition': 'attachment; filename=session.ics',
      },
    });
  });
}
