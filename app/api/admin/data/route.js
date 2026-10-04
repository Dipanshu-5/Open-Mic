import { api } from '../../../../lib/http.js';
import { requireAdmin } from '../../../../lib/auth.js';
import { adminData } from '../../../../lib/admin.js';
export const runtime = 'nodejs';
export function GET() {
  return api(async () => {
    await requireAdmin();
    return Response.json(await adminData());
  });
}
