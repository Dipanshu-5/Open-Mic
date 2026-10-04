import { describe, it, expect } from 'vitest';
import { assertSafeCallTemplate } from '../lib/providers/call-safety.js';
const template = (allowed = ['audio']) => ({
  roles: Object.fromEntries(
    ['host', 'guest'].map((role) => [
      role,
      { maxPeerCount: 1, publishParams: { allowed }, permissions: {} },
    ]),
  ),
  settings: { recording: null },
});
describe('provider-side call permissions', () => {
  it('accepts separate private audio and video templates', () => {
    expect(() => assertSafeCallTemplate(template(), 'audio')).not.toThrow();
    expect(() =>
      assertSafeCallTemplate(template(['audio', 'video']), 'video'),
    ).not.toThrow();
  });
  it('rejects audio camera publishing even if the browser hides its button', () => {
    expect(() =>
      assertSafeCallTemplate(template(['audio', 'video']), 'audio'),
    ).toThrow(/unsafe/);
  });
  it('rejects recording, streaming, role escalation and unlimited peers', () => {
    const recording = template();
    recording.roles.host.permissions = { browserRecording: true };
    expect(() => assertSafeCallTemplate(recording, 'audio')).toThrow(
      /disabled/,
    );
    const escalation = template();
    escalation.roles.guest.permissions = { changeRole: true };
    expect(() => assertSafeCallTemplate(escalation, 'audio')).toThrow();
    const unlimited = template();
    unlimited.roles.guest.maxPeerCount = 0;
    expect(() => assertSafeCallTemplate(unlimited, 'audio')).toThrow();
    expect(() =>
      assertSafeCallTemplate(
        { ...template(), destinations: { hls: {} } },
        'audio',
      ),
    ).toThrow();
  });
});
