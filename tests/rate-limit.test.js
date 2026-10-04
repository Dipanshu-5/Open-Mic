import { afterEach, describe, it, expect, vi } from 'vitest';
const mocks = vi.hoisted(() => ({ limit: vi.fn() }));
vi.mock('@upstash/redis', () => ({ Redis: class {} }));
vi.mock('@upstash/ratelimit', () => ({
  Ratelimit: class {
    static slidingWindow() {
      return {};
    }
    limit = mocks.limit;
  },
}));
vi.mock('../lib/env.js', () => ({
  readEnv: () => ({
    APP_MODE: 'live',
    UPSTASH_REDIS_REST_URL: 'https://example.invalid',
    UPSTASH_REDIS_REST_TOKEN: 'test',
  }),
}));
import { rateLimit } from '../lib/security.js';
afterEach(() => vi.clearAllMocks());
describe('live rate limiter failures', () => {
  it('rejects a provider timeout even when the SDK permits the request', async () => {
    mocks.limit.mockResolvedValue({ success: true, reason: 'timeout' });
    await expect(rateLimit('private-identity')).rejects.toMatchObject({
      status: 503,
    });
  });
  it('returns a rate-limit response for a denied request', async () => {
    mocks.limit.mockResolvedValue({ success: false });
    await expect(rateLimit('private-identity')).rejects.toMatchObject({
      status: 429,
    });
  });
  it('sends a hash instead of guest contact details to the limiter', async () => {
    mocks.limit.mockResolvedValue({ success: true });
    await rateLimit('guest@example.com');
    expect(mocks.limit).toHaveBeenCalledWith(
      expect.stringMatching(/^[a-f0-9]{64}$/),
    );
  });
});
