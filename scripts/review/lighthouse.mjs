import lighthouse from 'lighthouse';

import { chromium } from 'playwright';
import { mkdir, writeFile } from 'node:fs/promises';
await mkdir('scripts/review/artifacts', { recursive: true });
const chrome = await chromium.launch({
  headless: true,
  args: ['--remote-debugging-port=9227'],
});
const results = [];
try {
  for (const path of ['/', '/book', '/admin/login']) {
    const report = await lighthouse('http://127.0.0.1:3001' + path, {
      port: 9227,
      output: 'json',
      onlyCategories: ['performance', 'accessibility', 'best-practices', 'seo'],
      logLevel: 'error',
    });
    await writeFile(
      `scripts/review/artifacts/lighthouse-${path.replaceAll('/', '') || 'home'}.json`,
      report.report,
    );
    results.push({
      path,
      scores: Object.fromEntries(
        Object.entries(report.lhr.categories).map(([name, c]) => [
          name,
          Math.round(c.score * 100),
        ]),
      ),
      failures: Object.values(report.lhr.audits)
        .filter(
          (a) =>
            a.score !== null &&
            a.score < 1 &&
            a.scoreDisplayMode !== 'informative' &&
            a.scoreDisplayMode !== 'notApplicable',
        )
        .map((a) => ({
          id: a.id,
          score: a.score,
          title: a.title,
          displayValue: a.displayValue,
        })),
    });
  }
  await writeFile(
    'scripts/review/artifacts/lighthouse-summary.json',
    JSON.stringify(results, null, 2),
  );
  console.log(JSON.stringify(results, null, 2));
} finally {
  await chrome.close();
}
