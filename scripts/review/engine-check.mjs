import { firefox, webkit } from 'playwright';
for (const [name, type] of Object.entries({ firefox, webkit })) {
  try {
    const browser = await type.launch({ headless: true });
    const page = await browser.newPage();
    await page.goto('http://127.0.0.1:3001/book');
    console.log(name, await page.locator('input[type=date]').inputValue());
    await page
      .locator('input[type=date]')
      .fill(
        new Date(Date.now() + 5 * 86400000 + 19800000)
          .toISOString()
          .slice(0, 10),
      );
    await page.waitForTimeout(1000);
    console.log(
      name,
      await page.locator('input[type=date]').inputValue(),
      await page.locator('.time-grid button').count(),
    );
    await browser.close();
  } catch (e) {
    console.log(name, String(e));
  }
}
