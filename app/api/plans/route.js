import { PLANS } from '../../../lib/config.js';

export const runtime = 'nodejs';

export function GET() {
  return Response.json({ plans: PLANS.filter((plan) => plan.enabled) });
}
