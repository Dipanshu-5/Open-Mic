import { webkit } from 'playwright';
const browser = await webkit.launch({ headless: true });
const context = await browser.newContext({
  extraHTTPHeaders: { 'x-vercel-forwarded-for': '192.0.2.230' },
});
const result = await context.request.post(
  'http://127.0.0.1:3001/api/admin/login',
  {
    headers: { Origin: 'http://127.0.0.1:3001' },
    data: { email: '', password: 'review-local-password-only' },
  },
);
console.log(
  'login status',
  result.status(),
  'attributes',
  result.headers()['set-cookie']?.replace(/^[^;]+/, '[cookie value redacted]'),
);
console.log(
  (await context.cookies()).map(({ name, httpOnly, sameSite, secure }) => ({
    name,
    httpOnly,
    sameSite,
    secure,
  })),
);
await browser.close();
