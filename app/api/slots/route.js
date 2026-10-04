import { api } from '../../../lib/http.js';
import { availabilitySchema } from '../../../lib/validation.js';
import { getRepository } from '../../../lib/db.js';
import { rateLimit, requestIdentity } from '../../../lib/security.js';
export const runtime = 'nodejs';
/** @param {Request} request */
export function GET(request) {
  return api(async () => {
    await rateLimit(`slots:${requestIdentity(request)}`, 100);
    const query = availabilitySchema.parse(
      Object.fromEntries(new URL(request.url).searchParams),
    );
    const slots = await (
      await getRepository()
    ).rpc('available_starts', { p_plan_id: query.planId, p_date: query.date });
    return Response.json({ slots });
  });
}
