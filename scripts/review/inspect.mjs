import { chromium } from 'playwright';
import { mkdir, writeFile } from 'node:fs/promises';
await mkdir('scripts/review/artifacts', { recursive: true });
const browser = await chromium.launch({ headless: true });
const page = await browser.newPage();
await page.goto('http://127.0.0.1:3001/book');
await page
  .locator('.time-options button, .slot-grid button')
  .first()
  .waitFor({ timeout: 30000 })
  .catch(() => {});
console.log(await page.locator('button').allTextContents());
console.log(
  await page
    .locator('input')
    .evaluateAll((nodes) => nodes.map((n) => ({ name: n.name, type: n.type }))),
);
await browser.close();
