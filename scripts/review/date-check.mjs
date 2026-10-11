import { webkit } from 'playwright';
const browser = await webkit.launch({ headless: true });
const page = await browser.newPage();
await page.goto('http://127.0.0.1:3001/book');
await page.locator('.time-grid button').first().waitFor();
await page.evaluate(() => {
  window.reviewEvents = [];
  for (const type of ['input', 'change'])
    document.addEventListener(type, (event) => {
      if (event.target.type === 'date')
        window.reviewEvents.push({ type, value: event.target.value });
    });
});
await page.locator('input[type=date]').fill('2026-10-16');
await page.waitForTimeout(200);
console.log(
  'app fill',
  await page.locator('input[type=date]').inputValue(),
  await page.evaluate(() => window.reviewEvents),
);
await page.locator('input[type=date]').evaluate((el) => {
  Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set.call(
    el,
    '2026-10-17',
  );
  el.dispatchEvent(new Event('input', { bubbles: true }));
  el.dispatchEvent(new Event('change', { bubbles: true }));
});
await page.waitForTimeout(200);
console.log(
  'native setter',
  await page.locator('input[type=date]').inputValue(),
  await page.evaluate(() => window.reviewEvents),
);
await page.getByRole('button', { name: /Fri, 16 Oct/ }).click();
console.log('date chip', await page.locator('input[type=date]').inputValue());
await page.setContent('<input type=date value=2026-10-12>');
await page.locator('input').fill('2026-10-16');
console.log('plain date input', await page.locator('input').inputValue());
await browser.close();
