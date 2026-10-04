import { cookies } from 'next/headers';
import { api, sameOrigin } from '../../../../lib/http.js';
import { requireAdmin, authClient } from '../../../../lib/auth.js';
import { readEnv } from '../../../../lib/env.js';
export const runtime = 'nodejs';
/** @param {Request} request */
export function POST(request) {
  return api(async () => {
    sameOrigin(request);
    await requireAdmin();
    if (readEnv().APP_MODE === 'demo')
      (await cookies()).delete('demo_admin_session');
    else await (await authClient()).auth.signOut({ scope: 'local' });
    return Response.json({ signedOut: true });
  });
}
