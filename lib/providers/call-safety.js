import { z } from 'zod';

const templateSchema = z.object({
  roles: z.record(
    z.string(),
    z.object({
      publishParams: z.object({ allowed: z.array(z.string()) }),
      permissions: z.record(z.string(), z.unknown()).default({}),
      maxPeerCount: z.number(),
    }),
  ),
  settings: z.object({ recording: z.unknown().nullable().optional() }),
  destinations: z.record(z.string(), z.unknown()).optional(),
});
/** Fail closed when dashboard configuration would weaken session privacy.
 * @param {unknown} value @param {'video'|'audio'} mode
 */
export function assertSafeCallTemplate(value, mode) {
  const template = templateSchema.parse(value);
  if (
    Object.keys(template.roles).length !== 2 ||
    !template.roles.host ||
    !template.roles.guest
  )
    throw new Error('Call template requires exactly host and guest roles.');
  if (
    template.settings.recording != null ||
    Object.keys(template.destinations || {}).length
  )
    throw new Error('Call recording and streaming must be disabled.');
  for (const role of Object.values(template.roles)) {
    const allowed = role.publishParams.allowed;
    if (
      role.maxPeerCount !== 1 ||
      !allowed.includes('audio') ||
      allowed.some(
        (kind) =>
          !['audio', ...(mode === 'video' ? ['video'] : [])].includes(kind),
      )
    )
      throw new Error('Call publishing permissions are unsafe.');
    if (mode === 'video' && !allowed.includes('video'))
      throw new Error('Video template cannot publish video.');
    if (
      ['browserRecording', 'rtmpStreaming', 'hlsStreaming', 'changeRole'].some(
        (permission) => role.permissions[permission] === true,
      )
    )
      throw new Error(
        'Recording, streaming, and role changes must be disabled.',
      );
  }
}
