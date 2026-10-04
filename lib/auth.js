import 'server-only';
import { createHmac, createHash } from 'node:crypto';
import { cookies } from 'next/headers';
import { createServerClient } from '@supabase/ssr';
import { readEnv } from './env.js';
import { equalSignature } from './tokens.js';
import { HttpError } from './http.js';

export async function authClient() {
  const env = readEnv();
  const store = await cookies();
  return createServerClient(
    env.NEXT_PUBLIC_SUPABASE_URL || '',
    env.NEXT_PUBLIC_SUPABASE_ANON_KEY || '',
    {
      global: {
        fetch: (url, init) =>
          fetch(url, { ...init, signal: AbortSignal.timeout(10000) }),
      },
      cookies: {
        getAll: () => store.getAll(),
        setAll(values) {
          try {
            for (const { name, value, options } of values)
              store.set(name, value, options);
          } catch {
            /* Proxy refreshes cookies before a Server Component is rendered. */
          }
        },
      },
    },
  );
}
/** @param {string} email */
export function isAdminEmail(email) {
  return readEnv()
    .ADMIN_EMAILS.split(',')
    .map((value) => value.trim().toLowerCase())
    .filter(Boolean)
    .includes(email.toLowerCase());
}
export async function requireAdmin() {
  const env = readEnv();
  if (env.APP_MODE === 'demo') {
    const secret = env.DEMO_ADMIN_SECRET;
    if (!secret || secret.length < 16) throw new HttpError(401, 'unauthorized');
    const value = (await cookies()).get('demo_admin_session')?.value || '';
    const [expires, signature] = value.split('.');
    const expected = createHmac('sha256', secret)
      .update(expires || '')
      .digest('hex');
    if (
      !equalSignature(expected, signature || '') ||
      !/^\d+$/.test(expires || '') ||
      Number(expires) < Date.now()
    )
      throw new HttpError(401, 'unauthorized');
    return { email: 'demo-host', id: 'demo-host' };
  }
  const { data, error } = await (await authClient()).auth.getUser();
  if (error || !data.user?.email) throw new HttpError(401, 'unauthorized');
  if (!isAdminEmail(data.user.email)) throw new HttpError(403, 'forbidden');
  return { email: data.user.email, id: data.user.id };
}
/** @param {string} password */
export async function demoLogin(password) {
  const env = readEnv();
  if (!env.DEMO_ADMIN_SECRET || env.DEMO_ADMIN_SECRET.length < 16)
    throw new HttpError(401, 'invalid_credentials');
  const hash = (/** @type {string} */ value) =>
    createHash('sha256').update(value).digest('hex');
  if (!equalSignature(hash(password), hash(env.DEMO_ADMIN_SECRET)))
    throw new HttpError(401, 'invalid_credentials');
  const expires = String(Date.now() + 8 * 3600000);
  const signature = createHmac('sha256', env.DEMO_ADMIN_SECRET)
    .update(expires)
    .digest('hex');
  (await cookies()).set('demo_admin_session', `${expires}.${signature}`, {
    httpOnly: true,
    sameSite: 'strict',
    secure: new URL(env.NEXT_PUBLIC_SITE_URL).protocol === 'https:',
    path: '/',
    maxAge: 8 * 3600,
  });
}
