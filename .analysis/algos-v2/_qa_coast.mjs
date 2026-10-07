import { createRequire } from 'node:module';
const require = createRequire('D:/TechGar2/frontend/package.json');
const { chromium } = require('@playwright/test');
const errs = [];
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1280, height: 860 } });
page.on('console', m => { if (m.type() === 'error') errs.push(m.text()); });
page.on('pageerror', e => errs.push(String(e)));
await page.goto('file:///D:/TechGar2/algo-web/index.html', { waitUntil: 'load' });
await page.waitForTimeout(900);
await page.evaluate(() => { location.hash = '#/node/coasting/normal'; });
await page.waitForTimeout(1100);
// nhảy tới frame 3 bằng nút next của detail transport
for (let i = 0; i < 2; i++) {
  const b = page.locator('.detail-tp button').nth(2);
  if (await b.count()) { await b.click(); await page.waitForTimeout(700); }
}
await page.waitForTimeout(600);
await page.screenshot({ path: 'D:/TechGar2/.analysis/algos-v2/qa-shots/a-coasting-normal-f3.png' });
console.log('ERR:', errs.length, errs.slice(0, 3));
await browser.close();
console.log('DONE');
