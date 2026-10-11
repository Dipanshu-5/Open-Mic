import { chromium, firefox, webkit } from 'playwright';
import AxeBuilder from '@axe-core/playwright';
import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
const origin = 'http://127.0.0.1:3001';
const results = { flows: [], layouts: [], axe: [], errors: [], security: [] };
await mkdir('scripts/review/artifacts', { recursive: true });
const plans = ['video_30', 'video_60', 'audio_30', 'audio_60'];
const istDay = (offset) => {
  const now = new Date(Date.now() + 19800000 + offset * 86400000);
  return now.toISOString().slice(0, 10);
};
let index = 0;
for (const [engine, type] of Object.entries({ chromium, firefox, webkit })) {
  let browser;
  try {
    browser = await type.launch({ headless: true });
  } catch (e) {
    results.errors.push({ engine, error: String(e) });
    continue;
  }
  try {
    for (const plan of plans) {
      const context = await browser.newContext({
        viewport: { width: 375, height: 812 },
        extraHTTPHeaders: { 'x-vercel-forwarded-for': `192.0.2.${++index}` },
        reducedMotion: 'reduce',
        colorScheme: 'dark',
      });
      await context.route('**/*', (route) =>
        new URL(route.request().url()).origin === origin
          ? route.continue()
          : route.abort(),
      );
      const page = await context.newPage();
      let capture;
      page.on('response', async (response) => {
        if (response.url().endsWith('/api/bookings/start') && response.ok())
          capture = await response.json();
      });
      page.on('pageerror', (error) =>
        results.errors.push({ engine, plan, error: error.message }),
      );
      await page.goto(`${origin}/book?planId=${plan}`);
      const wantedDate = istDay(3 + Math.floor((index - 1) / 4));
      const slotsLoaded = page.waitForResponse(
        (r) =>
          r.url().includes('/api/slots?') &&
          new URL(r.url()).searchParams.get('date') === wantedDate,
      );
      await page
        .locator('.date-strip button')
        .nth(3 + Math.floor((index - 1) / 4))
        .click();
      await slotsLoaded;
      await page.locator('.time-grid[aria-busy=false]').waitFor();
      await page.locator('.time-grid button').first().click();
      const guest = `李 <img src=x onerror=alert(1)> ${engine}`;
      await page.locator('[name=name]').fill(guest);
      await page.locator('[name=email]').fill(`review-${index}@example.com`);
      for (const name of ['adult', 'terms', 'privacy'])
        await page.locator(`[name=${name}]`).check();
      await page.getByRole('button', { name: /Simulate payment/ }).click();
      await page.getByRole('heading', { name: 'Simulated checkout' }).waitFor();
      await page
        .getByRole('button', { name: 'Confirm simulated payment' })
        .click();
      await page.waitForURL('**/b/*');
      await page
        .getByRole('heading', { name: 'Your time is reserved' })
        .waitFor();
      assert.ok((await page.locator('body').innerText()).includes(guest));
      assert.equal(await page.locator('img[src=x]').count(), 0);
      const booking = await (
        await context.request.get(`${origin}/api/b/${capture.token}`)
      ).json();
      assert.equal(
        new Date(new Date(booking.startTime).getTime() + 19800000)
          .toISOString()
          .slice(0, 10),
        wantedDate,
      );
      assert.equal(booking.durationMinutes, plan.endsWith('60') ? 60 : 30);
      assert.equal(booking.amountInPaise, plan.endsWith('60') ? 50000 : 29900);
      assert.equal(booking.mode, plan.startsWith('audio') ? 'audio' : 'video');
      const calendar = await context.request.get(
        `${origin}/api/b/${capture.token}/calendar`,
      );
      assert.ok((await calendar.text()).includes('BEGIN:VCALENDAR'));
      const join = await context.request.post(
        `${origin}/api/b/${capture.token}/join`,
        { headers: { Origin: origin }, data: {} },
      );
      assert.equal(join.status(), 403);
      if (engine === 'chromium' && plan === 'video_30') {
        results.axe.push({ page: 'private-booking', ...(await scan(page)) });
        await page.screenshot({
          path: 'scripts/review/artifacts/booking-375.png',
          fullPage: true,
        });
      }
      await page
        .getByRole('button', { name: 'Cancel with full refund' })
        .click();
      await page
        .getByRole('button', { name: 'Yes, cancel and refund' })
        .click();
      await page
        .getByRole('heading', { name: 'Your refund is being processed' })
        .waitFor();
      const tick = await context.request.get(`${origin}/api/cron/tick`, {
        headers: {
          Authorization: 'Bearer review-local-cron-secret-not-production',
        },
      });
      assert.equal(tick.status(), 200);
      const cancelled = await (
        await context.request.get(`${origin}/api/b/${capture.token}`)
      ).json();
      assert.equal(cancelled.status, 'refunded');
      results.flows.push({
        engine,
        plan,
        status: 'passed',
        calendar: true,
        earlyJoinDenied: true,
        refund: true,
      });
      await context.close();
    }
    const context = await browser.newContext({
      extraHTTPHeaders: { 'x-vercel-forwarded-for': `192.0.2.${++index}` },
    });
    const page = await context.newPage();
    for (const width of [320, 375, 768, 1440])
      for (const path of ['/', '/book', '/admin/login']) {
        await page.setViewportSize({ width, height: 900 });
        await page.goto(origin + path);
        await page.locator('h1').first().waitFor();
        const overflow = await page.evaluate(
          () => document.documentElement.scrollWidth > innerWidth + 1,
        );
        results.layouts.push({ engine, width, path, overflow });
        assert.equal(overflow, false, `${engine} ${width} ${path} overflow`);
        if (engine === 'chromium' && width === 375)
          results.axe.push({ page: path, ...(await scan(page)) });
      }
    await page.goto(origin + '/book');
    await page.evaluate(
      () => (document.documentElement.style.fontSize = '200%'),
    );
    results.layouts.push({
      engine,
      width: 1440,
      path: '/book',
      zoom: '200% text',
      overflow: await page.evaluate(
        () => document.documentElement.scrollWidth > innerWidth + 1,
      ),
    });
    await page.goto(origin + '/admin');
    assert.ok(page.url().endsWith('/admin/login'));
    for (const [path, method, data] of [
      ['/api/admin/data', 'GET'],
      ['/api/admin/windows', 'POST', { windows: [], preview: true }],
      [
        '/api/admin/bookings/00000000-0000-4000-8000-000000000000',
        'POST',
        { action: 'join' },
      ],
    ]) {
      const response = await context.request.fetch(origin + path, {
        method,
        headers: { Origin: origin },
        data,
      });
      assert.equal(response.status(), 401);
      results.security.push({ engine, path, status: 401 });
    }
    const invalid = await context.request.get(
      `${origin}/api/b/${'x'.repeat(43)}`,
    );
    assert.equal(invalid.status(), 404);
    const csrf = await context.request.post(origin + '/api/bookings/start', {
      headers: { Origin: 'https://attacker.invalid' },
      data: {},
    });
    assert.equal(csrf.status(), 403);
    await page.goto(origin + '/admin/login');
    await page.locator('[name=password]').fill('review-local-password-only');
    await page.getByRole('button', { name: 'Sign in', exact: true }).click();
    await page.waitForURL('**/admin');
    if (engine === 'chromium')
      results.axe.push({ page: 'admin', ...(await scan(page)) });
    const cookies = await context.cookies();
    assert.ok(
      cookies.find((c) => c.name === 'demo_admin_session' && c.httpOnly),
    );
    const cookieResponse = await context.request.post(
      origin + '/api/admin/login',
      {
        headers: { Origin: origin },
        data: { password: 'review-local-password-only', email: '' },
      },
    );
    assert.match(
      cookieResponse.headers()['set-cookie'],
      /HttpOnly; SameSite=strict/,
    );
    await context.close();
  } catch (e) {
    results.errors.push({ engine, error: String(e) });
  } finally {
    await browser.close();
    await writeFile(
      'scripts/review/artifacts/browser.json',
      JSON.stringify(results, null, 2),
    );
  }
}
console.log(
  JSON.stringify(
    {
      flows: results.flows,
      layoutChecks: results.layouts.length,
      axe: results.axe,
      securityChecks: results.security.length,
      errors: results.errors,
    },
    null,
    2,
  ),
);
if (results.errors.length) process.exitCode = 1;
async function scan(page) {
  const result = await new AxeBuilder({ page })
    .withTags(['wcag2a', 'wcag2aa', 'wcag21aa'])
    .analyze();
  return {
    violations: result.violations.map((v) => ({
      id: v.id,
      impact: v.impact,
      description: v.description,
      nodes: v.nodes.map((n) => ({
        target: n.target,
        summary: n.failureSummary,
      })),
    })),
    passes: result.passes.length,
  };
}
