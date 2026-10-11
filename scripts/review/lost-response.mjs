import { chromium } from 'playwright';
import assert from 'node:assert/strict';
const browser = await chromium.launch({ headless: true });
const page = await browser.newPage();
try {
  await page.goto('http://127.0.0.1:3001/book');
  await page.locator('.time-grid button').first().click();
  await page.locator('[name=name]').fill('Lost response review');
  await page.locator('[name=email]').fill('lost-response@example.com');
  for (const name of ['adult', 'terms', 'privacy'])
    await page.locator(`[name=${name}]`).check();
  let dropped = false;
  const attempts = [];
  await page.route('**/api/bookings/start', async (route) => {
    attempts.push(route.request().postDataJSON());
    if (!dropped) {
      dropped = true;
      await route.fetch();
      await route.abort('failed');
    } else await route.continue();
  });
  await page.getByRole('button', { name: /Simulate payment/ }).click();
  await page
    .getByRole('button', { name: /Simulate payment/ })
    .waitFor({ state: 'visible' });
  await page.waitForFunction(
    () => !document.querySelector('button[type=submit]').disabled,
  );
  await page.getByRole('button', { name: /Simulate payment/ }).click();
  await page
    .getByRole('heading', { name: 'Simulated checkout' })
    .waitFor({ timeout: 5000 });
  assert.equal(attempts.length, 2);
  assert.equal(attempts[0].retryToken, attempts[1].retryToken);
  assert.match(attempts[0].retryToken, /^[A-Za-z0-9_-]{43}$/);
  console.log('PASS lost response recovered to same checkout');
} finally {
  await browser.close();
}
