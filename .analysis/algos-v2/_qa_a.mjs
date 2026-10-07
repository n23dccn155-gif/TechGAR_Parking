// Peer-A browser QA — file://, Chromium qua frontend/node_modules (không install).
// Kiểm: 12 node load · console/page errors · assignment/edge nhãn không chồng ·
// controls pause/step/scenario · state render.
import { createRequire } from 'node:module';
import { mkdirSync } from 'node:fs';
const require = createRequire('D:/TechGar2/frontend/package.json');
const { chromium } = require('@playwright/test');

mkdirSync('D:/TechGar2/.analysis/algos-v2/qa-shots', { recursive: true });
const URL = 'file:///D:/TechGar2/algo-web/index.html';
const errs = [], pageErrs = [];

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1280, height: 860 } });
page.on('console', m => { if (m.type() === 'error') errs.push(m.text()); });
page.on('pageerror', e => pageErrs.push(String(e)));

await page.goto(URL, { waitUntil: 'load' });
await page.waitForTimeout(1200);

// 1. map + pack status
const status = await page.locator('#pack-status').innerText().catch(() => '(no #pack-status)');
const nodeCards = await page.locator('.node-card, .map-node, [data-node]').count();
console.log('PACK-STATUS:', status.replace(/\s+/g, ' ').slice(0, 200));
console.log('NODE CARDS:', nodeCards);

// 2. navigate tới assignment/edge qua hash
await page.evaluate(() => { location.hash = '#/node/assignment/edge'; });
await page.waitForTimeout(1500);
const title = await page.locator('h2, .detail-head h2').first().innerText().catch(() => '?');
console.log('DETAIL:', title);
await page.screenshot({ path: 'D:/TechGar2/.analysis/algos-v2/qa-shots/a-assignment-edge.png' });

// step qua các frame để xem nhãn merged ở frame khác
const stepBtn = page.locator('button:has-text("⏭"), button:has-text("→"), .detail-tp button').nth(1);
for (let i = 0; i < 3; i++) {
  const nb = page.locator('.detail-tp button, button').filter({ hasText: /⏭|→|next/i }).first();
  if (await nb.count()) { await nb.click(); await page.waitForTimeout(400); }
}
await page.screenshot({ path: 'D:/TechGar2/.analysis/algos-v2/qa-shots/a-assignment-edge-f3.png' });

// 3. đổi scenario qua hash → normal
await page.evaluate(() => { location.hash = '#/node/assignment/normal'; });
await page.waitForTimeout(1200);
await page.screenshot({ path: 'D:/TechGar2/.analysis/algos-v2/qa-shots/a-assignment-normal.png' });

// 4. back → map, roi detail
await page.evaluate(() => { location.hash = '#/node/roi/edge'; });
await page.waitForTimeout(1400);
await page.screenshot({ path: 'D:/TechGar2/.analysis/algos-v2/qa-shots/a-roi-edge.png' });

// 5. map lại + journey
await page.evaluate(() => { location.hash = '#/map'; });
await page.waitForTimeout(900);
await page.screenshot({ path: 'D:/TechGar2/.analysis/algos-v2/qa-shots/a-map.png' });

console.log('CONSOLE-ERR:', errs.length, errs.slice(0, 4));
console.log('PAGE-ERR:', pageErrs.length, pageErrs.slice(0, 4));
await browser.close();
console.log('DONE');
