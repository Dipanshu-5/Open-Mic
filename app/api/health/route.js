import { getRepository } from '../../../lib/db.js';
import { readEnv } from '../../../lib/env.js';
export const runtime = 'nodejs';
export async function GET() {
  try {
    await (await getRepository()).rows('plans');
    return Response.json(
      { status: 'ok', mode: readEnv().APP_MODE, database: 'connected' },
      { headers: { 'Cache-Control': 'no-store' } },
    );
  } catch {
    return Response.json(
      { status: 'unavailable' },
      { status: 503, headers: { 'Cache-Control': 'no-store' } },
    );
  }
}
