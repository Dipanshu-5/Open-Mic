import 'server-only';
import { readEnv } from '../env.js';
import { createDemoProviders } from './demo.js';
import { createLiveProviders } from './live.js';

/** @returns {import('./contracts.js').Providers} */
export function getProviders() {
  const env = readEnv();
  if (env.APP_MODE === 'demo') {
    const cached = Reflect.get(globalThis, 'conversationDemoProviders');
    if (cached) return cached;
    const providers = createDemoProviders();
    Reflect.set(globalThis, 'conversationDemoProviders', providers);
    return providers;
  }
  return createLiveProviders();
}
