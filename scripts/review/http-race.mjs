import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { writeFile } from 'node:fs/promises';
const origin = 'http://127.0.0.1:3001';
const date = new Date(Date.now() + 9 * 86400000 + 19800000)
  .toISOString()
  .slice(0, 10);
const slots = await (
  await fetch(`${origin}/api/slots?planId=video_60&date=${date}`)
).json();
const startTime = slots.slots[0].start_time;
const results = await Promise.all(
  Array.from({ length: 50 }, async (_, i) => {
    const response = await fetch(origin + '/api/bookings/start', {
      method: 'POST',
      headers: {
        Origin: origin,
        'Content-Type': 'application/json',
        'x-vercel-forwarded-for': `198.51.100.${i + 1}`,
      },
      body: JSON.stringify({
        planId: i % 2 ? 'audio_30' : 'video_60',
        startTime,
        name: 'HTTP race test',
        email: `race-${randomUUID()}@example.com`,
        whatsappOptIn: false,
        consent: { adult: true, terms: true, privacy: true },
        turnstileToken: '',
        requestKey: randomUUID(),
        retryToken: Buffer.from(
          crypto.getRandomValues(new Uint8Array(32)),
        ).toString('base64url'),
      }),
    });
    return { status: response.status, data: await response.json() };
  }),
);
const winners = results.filter((r) => r.status === 200);
assert.equal(winners.length, 1);
assert.equal(
  results.filter((r) => r.status === 409 && r.data.error === 'slot_unavailable')
    .length,
  49,
);
const token = winners[0].data.token;
const release = await fetch(`${origin}/api/b/${token}/release`, {
  method: 'POST',
  headers: { Origin: origin, 'Content-Type': 'application/json' },
  body: '{}',
});
assert.equal(release.status, 200);
const summary = {
  requests: 50,
  winningReservations: 1,
  conflicts: 49,
  modes: ['video_60', 'audio_30'],
  released: true,
  backend:
    'single embedded PGlite instance; not hosted multi-connection PostgreSQL',
};
await writeFile(
  'scripts/review/artifacts/http-race.json',
  JSON.stringify(summary, null, 2),
);
console.log(summary);
