import { z } from 'zod';
import { api, sameOrigin, requestJson } from '../../../../lib/http.js';
import { requireAdmin } from '../../../../lib/auth.js';
import { getRepository } from '../../../../lib/db.js';
export const runtime = 'nodejs';
const batchSchema = z
  .object({
    windows: z
      .array(
        z
          .object({
            start_time: z.iso.datetime({ offset: true }),
            end_time: z.iso.datetime({ offset: true }),
          })
          .strict(),
      )
      .min(1)
      .max(500),
    preview: z.boolean(),
  })
  .strict();
/** @param {Request} request */
export function POST(request) {
  return api(async () => {
    sameOrigin(request);
    const admin = await requireAdmin();
    const data = batchSchema.parse(await requestJson(request));
    const repo = await getRepository();
    const result = await repo.rpc('create_windows_batch', {
      p_windows: data.windows,
      p_preview: data.preview,
    });
    if (!data.preview)
      await repo.insert('audit_log', {
        action: 'availability_created',
        actor: admin.email,
      });
    return Response.json(result);
  });
}
/** @param {Request} request */
export function DELETE(request) {
  return api(async () => {
    sameOrigin(request);
    const admin = await requireAdmin();
    const data = z
      .object({ id: z.uuid() })
      .strict()
      .parse(await requestJson(request));
    const repo = await getRepository();
    const deleted = await repo.rpc('delete_window', { p_window_id: data.id });
    if (deleted)
      await repo.insert('audit_log', {
        action: 'availability_deleted',
        actor: admin.email,
      });
    return Response.json({ deleted });
  });
}
