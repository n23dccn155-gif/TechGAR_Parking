// _qa_reduced_b.mjs — B's independent repro: manual step under prefers-reduced-motion.
// Mục tiêu: phân-biệt real UI bug vs harness artifact (stale focus trên button).
// Scenarios: A=body focus +ArrowRight · B=stale #btn-fullscreen focus +ArrowRight (repro smoke)
//            C=click nút ⏭ next thật · D=scrub input · E=ArrowLeft body.
// Không sửa core/web/C-script. node .analysis/algos-v2/_qa_reduced_b.mjs
import { createRequire } from 'module';
const r = createRequire('D:/TechGar2/frontend/package.json');
const { chromium } = r('@playwright/test');
const BASE = 'file:///D:/TechGar2/algo-web-v2/index.html';

const stepOf = (page) => page.evaluate(() => {
  const t = document.querySelector('.tg-step-label');
  const m = t && t.textContent.match(/(\d+)\s*\/\s*(\d+)/);
  return m ? +m[1] : null;
});
const focus = (page) => page.evaluate(() => {
  const a = document.activeElement;
  return a ? (a.tagName + (a.id ? '#' + a.id : '') + '.' + (a.className || '')) : 'none';
});

const browser = await chromium.launch();
const page = await browser.newPage();
const errs = [];
page.on('pageerror', e => errs.push(e.message));
await page.emulateMedia({ reducedMotion: 'reduce' });

// --- A: fresh nav, body focus ---
await page.goto(BASE + '#/algo/polygon');
await page.waitForTimeout(700);
const rm = await page.evaluate(() => TG.reducedMotion ? TG.reducedMotion() : 'no-api');
console.log('A reducedMotion api =', rm, '| step0 =', await stepOf(page), '| focus =', await focus(page));
await page.waitForTimeout(1200);
console.log('A auto-check step =', await stepOf(page), '(expect = step0, không auto)');
await page.keyboard.press('ArrowRight');
await page.waitForTimeout(160);
console.log('A ArrowRight body-focus → step =', await stepOf(page), '| focus =', await focus(page), '(expect +1)');

// --- B: repro điều-kiện smoke — focus kẹt button header rồi ArrowRight ---
await page.locator('#btn-fullscreen').click().catch(() => {});
await page.waitForTimeout(120);
console.log('B sau click #btn-fullscreen focus =', await focus(page));
const sB0 = await stepOf(page);
await page.keyboard.press('ArrowRight');   // guard player.js:119 BUTTON → expected dead
await page.waitForTimeout(160);
const sB1 = await stepOf(page);
console.log('B ArrowRight button-focus →', sB0, '→', sB1, '(nếu không đổi = manual-dead do STALE FOCUS)');

// --- C: click nút ⏭ thật dưới reduce (đường đi không qua keydown guard) ---
await page.locator('button[title^="Bước sau"]').first().click();
await page.waitForTimeout(160);
console.log('C click ⏭ → step =', await stepOf(page), '(expect +1 nếu player.next không gate reduce)');

// --- D: scrub input trực-tiếp ---
await page.evaluate(() => {
  const s = document.querySelector('.tg-scrub');
  s.value = 2; s.dispatchEvent(new Event('input', { bubbles: true }));
});
await page.waitForTimeout(160);
console.log('D scrub→2 → step =', await stepOf(page));

// --- E: ArrowLeft sau khi blur button (click canvas/body trước) ---
await page.evaluate(() => document.activeElement && document.activeElement.blur());
await page.keyboard.press('ArrowLeft');
await page.waitForTimeout(160);
console.log('E ArrowLeft body → step =', await stepOf(page), '(expect 1)');

// --- F: goto cùng-URL có remount không? (giải-thích tại sao focus kẹt) ---
const p1 = await page.evaluate(() => !!document.querySelector('.tg-scrub'));
await page.goto(BASE + '#/algo/polygon');        // identical URL — same-doc nav
await page.waitForTimeout(300);
const same = await page.evaluate(() => window.__mark ? false : (window.__mark = 1, true));
console.log('F same-URL goto: DOM preserved (no reload) =', same, '| focus =', await focus(page));

console.log('pageerrors =', JSON.stringify(errs));
await browser.close();
