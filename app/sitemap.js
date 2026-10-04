import { readEnv } from '../lib/env.js';
export default function sitemap() {
  const env = readEnv();
  return ['/', '/book', '/terms', '/privacy', '/refund-policy', '/contact'].map(
    (path) => ({
      url: `${env.NEXT_PUBLIC_SITE_URL}${path}`,
      changeFrequency: /** @type {const} */ ('monthly'),
      priority: path === '/' ? 1 : 0.5,
    }),
  );
}
