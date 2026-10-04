import { NextResponse } from 'next/server';
import { createServerClient } from '@supabase/ssr';
/** Refresh only; authorization always happens again inside handlers and pages. */
/** @param {import('next/server').NextRequest} request */
export async function proxy(request) {
  let response = NextResponse.next({ request });
  if (process.env.APP_MODE !== 'live') return response;
  const client = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL || '',
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || '',
    {
      global: {
        fetch: (url, init) =>
          fetch(url, { ...init, signal: AbortSignal.timeout(10000) }),
      },
      cookies: {
        getAll: () => request.cookies.getAll(),
        setAll(values) {
          for (const { name, value } of values)
            request.cookies.set(name, value);
          response = NextResponse.next({ request });
          for (const { name, value, options } of values)
            response.cookies.set(name, value, options);
        },
      },
    },
  );
  await client.auth.getUser();
  return response;
}
export const config = { matcher: ['/admin/:path*', '/api/admin/:path*'] };
