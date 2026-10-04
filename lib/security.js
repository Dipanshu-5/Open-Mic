import 'server-only';
import { createHash } from 'node:crypto';
import { Redis } from '@upstash/redis';
import { Ratelimit } from '@upstash/ratelimit';
import { readEnv } from './env.js';
import { HttpError } from './http.js';

/** @type {Map<string,{count:number,until:number}>} */ const demoLimits =
  new Map();
/** @param {string} identity @param {number} [limit] */
export async function rateLimit(identity, limit = 20) {
  const env = readEnv();
  const key = createHash('sha256').update(identity).digest('hex');
  if (env.APP_MODE === 'demo') {
    const now = Date.now();
    const value = demoLimits.get(key);
    if (demoLimits.size > 10000) demoLimits.clear();
    if (!value || value.until < now) {
      demoLimits.set(key, { count: 1, until: now + 600000 });
      return;
    }
    value.count++;
    if (value.count > limit) throw new HttpError(429, 'too_many_requests');
    return;
  }
  const redis = new Redis({
    url: env.UPSTASH_REDIS_REST_URL,
    token: env.UPSTASH_REDIS_REST_TOKEN,
    signal: () => AbortSignal.timeout(10000),
  });
  const limiter = new Ratelimit({
    redis,
    limiter: Ratelimit.slidingWindow(limit, '10 m'),
    prefix: 'conversation',
  });
  const result = await limiter.limit(key);
  if (result.reason === 'timeout')
    throw new HttpError(503, 'temporarily_unavailable');
  if (!result.success) throw new HttpError(429, 'too_many_requests');
}
/** @param {Request} request */
export function requestIdentity(request) {
  return (
    request.headers.get('x-vercel-forwarded-for')?.split(',')[0].trim() ||
    'shared'
  );
}
/** @param {string} token */
export async function verifyChallenge(token) {
  const env = readEnv();
  if (env.APP_MODE === 'demo') return;
  const response = await fetch(
    'https://challenges.cloudflare.com/turnstile/v0/siteverify',
    {
      method: 'POST',
      body: new URLSearchParams({
        secret: env.TURNSTILE_SECRET_KEY || '',
        response: token,
      }),
      signal: AbortSignal.timeout(10000),
    },
  );
  const result = await response.json();
  if (
    !response.ok ||
    result.success !== true ||
    result.hostname !== new URL(env.NEXT_PUBLIC_SITE_URL).hostname ||
    result.action !== 'booking'
  )
    throw new HttpError(400, 'challenge_failed');
}
