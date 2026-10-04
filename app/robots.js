import { readEnv } from '../lib/env.js';
export default function robots() {
  const env = readEnv();
  return {
    rules:
      env.APP_MODE === 'demo'
        ? { userAgent: '*', disallow: '/' }
        : { userAgent: '*', allow: '/', disallow: ['/b/', '/admin/', '/api/'] },
    sitemap: `${env.NEXT_PUBLIC_SITE_URL}/sitemap.xml`,
  };
}
