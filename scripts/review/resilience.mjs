import { chromium } from 'playwright';
import assert from 'node:assert/strict';
import { writeFile } from 'node:fs/promises';
const origin = 'http://127.0.0.1:3001';
const browser = await chromium.launch({ headless: true });
const context = await browser.newContext({
  extraHTTPHeaders: { 'x-vercel-forwarded-for': '192.0.2.201' },
  timezoneId: 'America/New_York',
});
const page = await context.newPage();
const results = [];
try {
  await page.goto(origin + '/book?planId=audio_60');
  await page.locator('.date-strip button').nth(7).click();
  await page.locator('.time-grid[aria-busy=false]').waitFor();
  await page.locator('.time-grid button').first().click();
  await page.locator('[name=name]').fill('Offline resilience');
  await page.locator('[name=email]').fill('resilience@example.com');
  for (const n of ['adult', 'terms', 'privacy'])
    await page.locator(`[name=${n}]`).check();
  await page.route('**/api/bookings/start', (route) =>
    route.fulfill({
      status: 500,
      contentType: 'application/json',
      body: '{"error":"temporarily_unavailable"}',
    }),
  );
  await page.getByRole('button', { name: /Simulate payment/ }).click();
  await page.locator('.form-error[role=alert]').waitFor();
  assert.equal(
    await page.locator('[name=name]').inputValue(),
    'Offline resilience',
  );
  await page.getByRole('button', { name: 'Refresh times' }).click();
  await page.locator('.time-grid[aria-busy=false]').waitFor();
  assert.ok(
    (await page.locator('.form-error[role=alert]').innerText()).includes(
      'interrupted',
    ),
  );
  results.push('API 500 preserves details and error after slots refresh');
  await page.unroute('**/api/bookings/start');
  await page.getByRole('button', { name: /Simulate payment/ }).click();
  await page.getByRole('heading', { name: 'Simulated checkout' }).waitFor();
  await page.getByRole('button', { name: 'Return to booking' }).click();
  await page.getByRole('button', { name: 'Retry payment' }).click();
  await page.getByRole('heading', { name: 'Simulated checkout' }).waitFor();
  results.push('Abandon and retry preserves checkout');
  await page.getByRole('button', { name: 'Confirm simulated payment' }).click();
  await page.waitForURL('**/b/*');
  await page.reload();
  await page.getByRole('heading', { name: 'Your time is reserved' }).waitFor();
  results.push('Confirmation reload succeeds in a foreign browser timezone');
  await context.setOffline(true);
  await page.getByRole('button', { name: 'Cancel with full refund' }).click();
  await page.getByRole('button', { name: 'Yes, cancel and refund' }).click();
  await page.locator('.form-error[role=alert]').waitFor();
  assert.ok(
    await page
      .getByRole('heading', { name: 'Your time is reserved' })
      .isVisible(),
  );
  await context.setOffline(false);
  results.push(
    'Offline cancellation retains confirmed booking and reports error',
  );
  const html = await context.request.get(origin + '/does-not-exist');
  assert.equal(html.status(), 404);
  results.push('404 page returns 404');
  await writeFile(
    'scripts/review/artifacts/resilience.json',
    JSON.stringify(results, null, 2),
  );
  console.log(results);
} finally {
  await browser.close();
}
