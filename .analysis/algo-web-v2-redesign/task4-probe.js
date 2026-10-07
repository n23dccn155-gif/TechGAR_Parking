// task4-probe.js — manual e2e-lite for homography R0 page (Task 4 step 4).
// Usage: node task4-probe.js
const { createRequire } = require('module');
const r = createRequire('D:/TechGar2/frontend/package.json');
const { chromium } = r('@playwright/test');
const fs = require('fs');
const path = require('path');

const OUT = 'D:/TechGar2/.analysis/algo-web-v2-redesign/task4-shots';
fs.mkdirSync(OUT, { recursive: true });
const URL = 'file:///D:/TechGar2/algo-web-v2/index.html#/p/homography';
const failures = [];

async function check(page, vp) {
  const errs = [], ext = [];
  page.on('console', m => { if (m.type() === 'error') errs.push(m.text().slice(0, 200)); });
  page.on('pageerror', e => errs.push('pageerror: ' + e.message.slice(0, 200)));
  page.on('request', q => {
    const u = q.url();
    if (!u.startsWith('file://') && !u.startsWith('data:') && !u.startsWith('blob:')) ext.push(u.slice(0, 140));
  });
  page.on('requestfailed', q => errs.push('reqfail: ' + q.url().slice(0, 140)));

  await page.goto(URL, { waitUntil: 'networkidle' });
  // cuộn hết trang để lazy-img tải, rồi về đầu chụp
  await page.evaluate(async () => {
    await new Promise(res => {
      let y = 0; const t = setInterval(() => {
        y += 600; window.scrollTo(0, y);
        if (y >= document.body.scrollHeight) { clearInterval(t); res(); }
      }, 60);
    });
  });
  await page.waitForTimeout(800);
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.waitForTimeout(300);

  const rep = await page.evaluate(() => {
    const secs = [...document.querySelectorAll('section.sec')]
      .map(s => s.querySelector('h2,h3') ? s.querySelector('h2,h3').textContent.trim() : s.id);
    const imgs = [...document.querySelectorAll('img')].map(i => ({ src: i.src.split('/').pop(), nw: i.naturalWidth }));
    const badR = [], badI = [];
    document.querySelectorAll('body *').forEach(el => {
      const cs = getComputedStyle(el);
      if (cs.borderRadius !== '0px' && !badR.includes(el.tagName + '.' + el.className)) badR.push(el.tagName + '.' + String(el.className).slice(0, 40) + ':' + cs.borderRadius);
      if ((cs.fontStyle === 'italic' || cs.fontStyle === 'oblique') && !badI.includes(el.tagName)) badI.push(el.tagName + ':' + cs.fontStyle);
    });
    const hov = document.documentElement.scrollWidth - document.documentElement.clientWidth;
    const wide = [];
    const clipped = el => { let p = el.parentElement; while (p) { const o = getComputedStyle(p).overflowX; if (o === 'auto' || o === 'scroll' || o === 'hidden') return true; p = p.parentElement; } return false; };
    document.querySelectorAll('body *').forEach(el => {
      const b = el.getBoundingClientRect();
      if (b.right > document.documentElement.clientWidth + 1 && !clipped(el) && wide.length < 10)
        wide.push(el.tagName + '.' + String(el.className).slice(0, 50) + ' right=' + Math.round(b.right) + ' w=' + Math.round(b.width) + ' text=' + (el.textContent || '').trim().slice(0, 60));
    });
    const fonts = [...document.fonts].map(f => f.family + ':' + f.status);
    const h1 = (document.querySelector('h1') || {}).textContent;
    return { secs, imgs, badR: badR.slice(0, 8), badI: badI.slice(0, 8), hov, wide, fonts: fonts.slice(0, 12), h1 };
  });

  // tooltip check — term là abbr.term, tooltip là div.tip (bỏ hidden khi hiện)
  const term = await page.$('article abbr.term, abbr.term');
  let tipOk = null;
  if (term) {
    await term.scrollIntoViewIfNeeded();
    await term.hover();
    await page.waitForTimeout(300);
    tipOk = await page.evaluate(() => {
      const t = document.querySelector('.tip');
      return !!(t && !t.hidden && t.textContent.trim().length > 0);
    });
  }

  await page.screenshot({ path: path.join(OUT, `homography-${vp.name}.png`), fullPage: false });
  await page.screenshot({ path: path.join(OUT, `homography-${vp.name}-full.png`), fullPage: true });

  console.log(`--- ${vp.name} ---`);
  console.log('h1:', rep.h1);
  console.log('sections (' + rep.secs.length + '):', JSON.stringify(rep.secs));
  console.log('imgs:', JSON.stringify(rep.imgs));
  console.log('borderRadius!=0:', JSON.stringify(rep.badR));
  console.log('italic:', JSON.stringify(rep.badI));
  console.log('hOverflow px:', rep.hov, 'culprits:', JSON.stringify(rep.wide));
  console.log('fonts:', JSON.stringify(rep.fonts));
  console.log('tooltip:', tipOk);
  console.log('console/page errs:', JSON.stringify(errs));
  console.log('external reqs:', JSON.stringify(ext));

  if (rep.secs.length !== 7) failures.push(`${vp.name}: sections=${rep.secs.length}`);
  rep.imgs.forEach(i => { if (i.nw <= 0) failures.push(`${vp.name}: img ${i.src} naturalWidth=0`); });
  if (rep.hov > 0) failures.push(`${vp.name}: horizontal overflow ${rep.hov}px`);
  if (rep.badR.length) failures.push(`${vp.name}: nonzero border-radius`);
  if (rep.badI.length) failures.push(`${vp.name}: italic/oblique`);
  if (errs.length) failures.push(`${vp.name}: ${errs.length} console/page errors`);
  if (ext.length) failures.push(`${vp.name}: ${ext.length} external requests`);
}

(async () => {
  const browser = await chromium.launch();
  for (const vp of [{ name: '1440x900', width: 1440, height: 900 }, { name: '390x844', width: 390, height: 844 }]) {
    const ctx = await browser.newContext({ viewport: { width: vp.width, height: vp.height } });
    const page = await ctx.newPage();
    await check(page, vp);
    await ctx.close();
  }
  await browser.close();
  console.log('\nFAILURES:', failures.length ? JSON.stringify(failures, null, 1) : 'none');
  process.exit(failures.length ? 1 : 0);
})().catch(e => { console.error(e); process.exit(2); });
