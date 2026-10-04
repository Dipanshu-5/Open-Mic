import { createHash } from 'node:crypto';
import { api, HttpError } from '../../../../lib/http.js';
import { readEnv } from '../../../../lib/env.js';
import { equalSignature } from '../../../../lib/tokens.js';
import { maintenance } from '../../../../lib/workers.js';
export const runtime = 'nodejs';
export const maxDuration = 60;
/** @param {Request} request */
export function GET(request) {
  return api(async () => {
    const secret = readEnv().CRON_SECRET;
    const header = request.headers.get('authorization') || '';
    const hash = (/** @type {string} */ value) =>
      createHash('sha256').update(value).digest('hex');
    if (!secret || !equalSignature(hash(header), hash(`Bearer ${secret}`)))
      throw new HttpError(401, 'unauthorized');
    return Response.json(await maintenance());
  });
}
export const POST = GET;
