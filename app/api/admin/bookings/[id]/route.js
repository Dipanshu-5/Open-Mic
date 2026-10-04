import { z } from 'zod';
import {
  api,
  sameOrigin,
  requestJson,
  HttpError,
} from '../../../../../lib/http.js';
import { requireAdmin } from '../../../../../lib/auth.js';
import { getRepository } from '../../../../../lib/db.js';
import { joinBooking } from '../../../../../lib/bookings.js';
export const runtime = 'nodejs';
/** @param {Request} request @param {{params:Promise<{id:string}>}} context */
export function POST(request, { params }) {
  return api(async () => {
    sameOrigin(request);
    const admin = await requireAdmin();
    const id = z.uuid().parse((await params).id);
    const data = z
      .object({
        action: z.enum([
          'cancel',
          'resend',
          'join',
          'completed',
          'guest_no_show',
          'host_missed',
        ]),
      })
      .strict()
      .parse(await requestJson(request));
    const repo = await getRepository();
    const booking = /** @type {import('../../../../../lib/db.js').Booking} */ (
      (await repo.rows('bookings', { id }))[0]
    );
    if (!booking) throw new HttpError(404, 'booking_unavailable');
    let result;
    if (data.action === 'cancel')
      result = await repo.rpc('cancel_booking', {
        p_booking_id: id,
        p_host: true,
      });
    else if (data.action === 'join')
      return Response.json(await joinBooking(booking, 'host'));
    else if (data.action === 'resend') {
      if (
        booking.status !== 'confirmed' ||
        booking.encrypted_token === 'retired'
      )
        throw new HttpError(409, 'not_confirmed');
      await repo.rpc('resend_confirmation', { p_booking_id: id });
      result = 'queued';
    } else
      result = await repo.rpc('set_outcome', {
        p_booking_id: id,
        p_outcome: data.action,
        p_actor: admin.email,
      });
    await repo.insert('audit_log', {
      action: data.action,
      actor: admin.email,
      booking_id: id,
    });
    return Response.json({ status: result });
  });
}
