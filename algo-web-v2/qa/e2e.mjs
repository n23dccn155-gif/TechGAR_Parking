// qa/e2e.mjs — E2E Playwright cho kiến trúc mới (Task 2, theo MEGAPLAN).
// Modes: file:// (mặc định) + http://127.0.0.1:8799 (python http.server, kill sau).
// Usage: node qa/e2e.mjs [--file-only] [--pages=a,b] [--sabotage] [--quiet]
//
// Checklist:
//   per trang #/p/<id>: mount article · đúng 7 section s1..s7 theo thứ tự ·
//     mọi <img> complete&&naturalWidth>0 · không overflow ngang tài liệu
//     (ngoại trừ vùng scroll nội bộ .tbl-wrap/pre) · console/pageerror = 0.
//   routes: #/ · #/glossary · #/values · #/journey · #/search?q= mount đúng.
//   nav link click đổi route · topbar search Enter → #/search ·
//   drawer mobile (390px): toggle mở nav.open + backdrop, backdrop đóng.
//   request ngoài file://|127.0.0.1 → chặn + đếm.
//   --sabotage: chèn console.error vào _fixture.js tạm, chứng minh harness bắt được.
// Log: qa/out/e2e.log.
import { createRequire } from 'module';
import { spawn } from 'child_process';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const ROOT = path.dirname(path.dirname(fileURLToPath(import.meta.url))); // algo-web-v2
const r = createRequire('D:/TechGar2/frontend/package.json');
const { chromium } = r('@playwright/test');

const ARGS = process.argv.slice(2);
const FILE_ONLY = ARGS.includes('--file-only');
const SABOTAGE = ARGS.includes('--sabotage');
const QUIET = ARGS.includes('--quiet');
const onlyPages = (ARGS.find(a => a.startsWith('--pages=')) || '').split('=')[1];

/* page ids = những file index.html thật nạp (đồng bộ với lint) */
const html = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
const ALL_PAGES = [...html.matchAll(/<script[^>]+src="js\/pages\/([^"]+)\.js"/g)]
  .map(m => m[1]);
const PAGES = onlyPages
  ? onlyPages.split(',').filter(id => ALL_PAGES.includes(id))
  : ALL_PAGES;

/* ---------- log ---------- */
fs.mkdirSync(path.join(ROOT, 'qa', 'out'), { recursive: true });
const LOGP = path.join(ROOT, 'qa', 'out', 'e2e.log');
const LOGBUF = [];
function log() {
  const s = [...arguments].join(' ');
  LOGBUF.push(s);
  if (!QUIET) console.log(s);
}

/* ---------- http server (own PID) ---------- */
const HTTP_PORT = 8799;
let serverProc = null;
function startServer() {
  return new Promise((resolve, reject) => {
    serverProc = spawn('python', ['-m', 'http.server', String(HTTP_PORT), '--bind', '127.0.0.1'], {
      cwd: ROOT, stdio: ['ignore', 'ignore', 'pipe'],
    });
    serverProc.on('error', reject);
    setTimeout(resolve, 1200);
  });
}
function stopServer() {
  if (serverProc && !serverProc.killed) {
    try { serverProc.kill(); } catch (_) {}
    if (process.platform === 'win32' && serverProc.pid) {
      try { spawn('taskkill', ['/pid', String(serverProc.pid), '/f', '/t'], { stdio: 'ignore' }); } catch (_) {}
    }
  }
}

/* ---------- page harness ---------- */
function wirePage(page, ctx) {
  page.on('console', (msg) => {
    if (msg.type() === 'error') {
      ctx.consoleErrs.push(`[${ctx.tag}] console.error: ${msg.text()}`);
    }
  });
  page.on('pageerror', (e) => {
    ctx.pageErrs.push(`[${ctx.tag}] pageerror: ${e.message}`);
  });
  page.on('requestfailed', (req) => {
    ctx.failedReqs.push(`[${ctx.tag}] requestfailed: ${req.url()} (${req.failure()?.errorText})`);
  });
}

/* chặn request ra ngoài file:// | 127.0.0.1 */
async function guardRequests(page, ctx) {
  await page.route('**/*', (route) => {
    const u = route.request().url();
    if (u.startsWith('file://') || u.startsWith('http://127.0.0.1') ||
        u.startsWith('data:') || u.startsWith('blob:') || u === 'about:blank') {
      route.continue();
    } else {
      ctx.blockedReqs.push(`[${ctx.tag}] blocked: ${u}`);
      route.abort();
    }
  });
}

/* overflow ngang tài liệu, bỏ vùng scroll nội bộ (.tbl-wrap, pre) */
async function docOverflow(page) {
  return page.evaluate(() => {
    const inner = [...document.querySelectorAll('.tbl-wrap, pre')]
      .map(e => e.getBoundingClientRect().right);
    const rightMost = Math.max(
      document.documentElement.scrollWidth,
      ...[...document.body.querySelectorAll('*')]
        .filter(e => !e.closest('.tbl-wrap') && !e.closest('pre'))
        .map(e => e.getBoundingClientRect().right)
    );
    return { scrollW: document.documentElement.scrollWidth,
             clientW: document.documentElement.clientWidth,
             maxRight: Math.round(rightMost), innerScrollers: inner.length };
  });
}

async function checkAlgoPage(page, base, id, ctx, report) {
  const row = { id, issues: [] };
  await page.goto(base + '#/p/' + id);
  await page.waitForTimeout(350);
  /* img loading=lazy → phải scroll hết trang để trigger load */
  await page.evaluate(async () => {
    const h = document.documentElement.scrollHeight;
    for (let y = 0; y <= h; y += 400) { window.scrollTo(0, y); await new Promise(r => setTimeout(r, 40)); }
    window.scrollTo(0, 0);
  });
  await page.waitForTimeout(600);
  const info = await page.evaluate(() => {
    const secs = [...document.querySelectorAll('main section.sec')].map(s => s.id);
    const imgs = [...document.querySelectorAll('main img')].map(im => ({
      src: im.getAttribute('src'),
      ok: im.complete && im.naturalWidth > 0,
    }));
    const art = document.querySelector('main article, main .page');
    const h1 = (document.querySelector('main h1') || {}).textContent || '';
    const terms = document.querySelectorAll('main .term, main abbr.term').length;
    const srcs = document.querySelectorAll('#s7 .src, #s7 li').length;
    return { secs, imgs, mounted: !!art, h1, terms, srcs };
  });
  const want = ['s1','s2','s3','s4','s5','s6','s7'];
  if (!info.mounted) row.issues.push('no-article');
  if (JSON.stringify(info.secs) !== JSON.stringify(want)) {
    row.issues.push('sections=' + JSON.stringify(info.secs));
  }
  info.imgs.forEach(im => { if (!im.ok) row.issues.push('img-not-loaded:' + im.src); });
  row.imgs = info.imgs.length;
  if (!info.srcs) row.issues.push('no-sources-in-s7');
  const ov = await docOverflow(page);
  if (ov.scrollW > ov.clientW + 1 && ov.maxRight > ov.clientW + 1) {
    row.issues.push(`hoverflow scrollW=${ov.scrollW} clientW=${ov.clientW} maxRight=${ov.maxRight}`);
  }
  report.rows.push(row);
  return row;
}

async function checkSimpleRoutes(page, base, ctx, report) {
  const routes = [
    ['#/', 'h1', 'TechGAR'],
    ['#/glossary', '.gls-entry, .placeholder', null],
    ['#/values', 'h1', 'Số liệu'],
    ['#/journey', 'article, .page, .placeholder', null],
    ['#/search?q=kalman', 'h1', 'Tìm kiếm'],
  ];
  for (const [hash, sel, titleHas] of routes) {
    await page.goto(base + hash);
    await page.waitForTimeout(300);
    const st = await page.evaluate(([s, th]) => {
      const el = document.querySelector('main ' + s) ||
                 document.querySelector('main ' + s.split(',')[0]);
      const h1 = (document.querySelector('main h1') || {}).textContent || '';
      const empt = !document.querySelector('main').children.length;
      return { found: !!el, h1, empty: empt };
    }, [sel, titleHas]);
    if (st.empty || !st.found) {
      report.rows.push({ id: 'route:' + hash, issues: ['mount-fail sel=' + sel] });
    } else if (titleHas && !st.h1.includes(titleHas)) {
      report.rows.push({ id: 'route:' + hash, issues: ['h1="' + st.h1 + '"'] });
    } else {
      report.rows.push({ id: 'route:' + hash, issues: [], ok: true });
    }
  }
  /* glossary count khớp registry */
  await page.goto(base + '#/glossary');
  await page.waitForTimeout(250);
  const g = await page.evaluate(() => ({
    dom: document.querySelectorAll('.gls-entry').length,
    reg: (window.TG && TG.allTerms ? TG.allTerms().length : -1),
  }));
  if (g.reg >= 0 && g.dom !== g.reg) {
    report.rows.push({ id: 'glossary-count', issues: [`dom=${g.dom} registry=${g.reg}`] });
  }
  /* search có kết quả cho từ khóa tồn tại */
  await page.goto(base + '#/search?q=kalman');
  await page.waitForTimeout(300);
  const hits = await page.evaluate(() =>
    document.querySelectorAll('main a[href^="#/p/"]').length);
  if (!hits) report.rows.push({ id: 'search-kalman', issues: ['0 kết quả'] });
}

/* ---------- interactive (Task 10): thao tác thật + determinism ---------- */
async function checkInteractive(page, base, ctx, report) {
  const has = id => PAGES.includes(id);

  /* roi: kéo đỉnh → % diện tích đổi */
  if (has('roi-mask')) {
    const row = { id: 'itv:roi', issues: [] };
    try {
      await page.goto(base + '#/p/roi-mask');
      await page.waitForTimeout(400);
      const readout = page.locator('.roi-itv .itv-readout');
      if (!(await readout.count())) { row.issues.push('no-component'); throw 0; }
      const before = await readout.textContent();
      const m = before.match(/([\d.,]+)%/);
      if (!m) { row.issues.push('no-percent:' + before); throw 0; }
      const h = page.locator('.roi-itv .itv-handle').first();
      await h.scrollIntoViewIfNeeded();
      await page.waitForTimeout(150);
      const bb = await h.boundingBox();
      if (!bb) { row.issues.push('no-handle'); throw 0; }
      await page.mouse.move(bb.x + bb.width / 2, bb.y + bb.height / 2);
      await page.mouse.down();
      await page.mouse.move(bb.x + bb.width / 2 - 60, bb.y + bb.height / 2 - 30, { steps: 6 });
      await page.mouse.up();
      await page.waitForTimeout(150);
      const after = await readout.textContent();
      if (after === before) row.issues.push('drag-no-change');
    } catch (e) { if (e) row.issues.push('exc:' + (e.message || e)); }
    report.rows.push(row);
  }

  /* homography: click toggles → error hữu hạn; nút bỏ V → determinism reload */
  if (has('homography')) {
    const row = { id: 'itv:homography', issues: [] };
    try {
      await page.goto(base + '#/p/homography');
      await page.waitForTimeout(400);
      const readout = page.locator('.homo-itv .itv-readout');
      const marks = page.locator('.homo-itv .itv-pane').first().locator('.itv-mark');
      if (!(await marks.count())) { row.issues.push('no-markers'); throw 0; }
      /* tắt cả 8 (thao tác thật) → phải báo cần ≥4 */
      for (let i = 0; i < 8; i++) await marks.nth(i).click();
      await page.waitForTimeout(120);
      const t1 = await readout.textContent();
      if (!/ít nhất 4|cần/.test(t1)) row.issues.push('deselect-all-no-msg:' + t1.slice(0, 60));
      /* bật lại 8 → error hữu hạn */
      for (let i = 0; i < 8; i++) await marks.nth(i).click();
      await page.waitForTimeout(120);
      const t2 = await readout.textContent();
      if (!/[\d.,]+\s*cm/.test(t2)) row.issues.push('no-error-cm:' + t2.slice(0, 80));
      /* nút bỏ vạch làn → vẫn số hữu hạn + có nhãn kiểm chứng */
      const btn = page.locator('.homo-itv .itv-btn').nth(1);
      if (await btn.count()) {
        await btn.click(); await page.waitForTimeout(120);
        const t3 = await readout.textContent();
        if (!/[\d.,]+\s*cm/.test(t3)) row.issues.push('dropV-no-cm:' + t3.slice(0, 80));
        if (!/kiểm chứng|minh họa/.test(t3)) row.issues.push('dropV-no-validation');
      }
      /* determinism: reload → readout giống hệt */
      await page.reload(); await page.waitForTimeout(450);
      const t4 = await readout.textContent();
      if (t4 !== t2) row.issues.push('nondeterministic');
    } catch (e) { if (e) row.issues.push('exc:' + (e.message || e)); }
    report.rows.push(row);
  }

  /* occlusion: slider → trạng thái đổi */
  if (has('occlusion-watershed')) {
    const row = { id: 'itv:occlusion', issues: [] };
    try {
      await page.goto(base + '#/p/occlusion-watershed');
      await page.waitForTimeout(400);
      const st = page.locator('.occ-itv .itv-state');
      const sl = page.locator('.occ-itv .itv-slider');
      if (!(await st.count()) || !(await sl.count())) { row.issues.push('no-component'); throw 0; }
      const s0 = await st.textContent();           /* d=120 → ĐỘC LẬP */
      await sl.fill('30'); await page.waitForTimeout(120);
      const s1 = await st.textContent();           /* d=30 → CHỒNG SÂU */
      await sl.fill('65'); await page.waitForTimeout(120);
      const s2 = await st.textContent();           /* d=65 → GROUP MỞ */
      await sl.fill('95'); await page.waitForTimeout(120);
      const s3 = await st.textContent();           /* d=95 → PAIR ỨNG VIÊN */
      if (new Set([s0, s1, s2, s3]).size < 4) {
        row.issues.push('states-not-distinct:' + JSON.stringify([s0, s1, s2, s3]));
      }
      if (!/GROUP MỞ/.test(s2) || !/PAIR/.test(s3)) {
        row.issues.push('state-format:' + s2.slice(0, 50) + '|' + s3.slice(0, 50));
      }
    } catch (e) { if (e) row.issues.push('exc:' + (e.message || e)); }
    report.rows.push(row);
  }

  /* assignment: grid 4×4 render + reload deterministic */
  if (has('kalman-lapjv')) {
    const row = { id: 'itv:assignment', issues: [] };
    try {
      await page.goto(base + '#/p/kalman-lapjv');
      await page.waitForTimeout(400);
      const cells = page.locator('.assign-itv .itv-cost td');
      const n = await cells.count();
      if (n !== 16) { row.issues.push('cells=' + n); throw 0; }
      const before = await cells.allTextContents();
      await page.reload(); await page.waitForTimeout(450);
      const after = await page.locator('.assign-itv .itv-cost td').allTextContents();
      if (JSON.stringify(before) !== JSON.stringify(after)) row.issues.push('nondeterministic');
    } catch (e) { if (e) row.issues.push('exc:' + (e.message || e)); }
    report.rows.push(row);
  }
}

async function checkNavAndDrawer(page, base, ctx, report, isMobile) {
  await page.goto(base + '#/');
  await page.waitForTimeout(300);
  /* mobile: mở drawer trước khi click nav link */
  if (isMobile) {
    const tog0 = page.locator('#nav-toggle');
    if (await tog0.count()) { await tog0.click(); await page.waitForTimeout(250); }
  }
  /* click nav link đầu tiên → route đổi + article mount */
  const first = page.locator('#nav a[href^="#/p/"]').first();
  if (await first.count()) {
    await first.click();
    await page.waitForTimeout(350);
    const ok = await page.evaluate(() =>
      !!document.querySelector('main section.sec#s7'));
    if (!page.url().includes('#/p/') || !ok) {
      report.rows.push({ id: 'nav-click', issues: ['nav link không mount trang'] });
    }
  }
  /* topbar search → #/search (mobile ẩn control → skip) */
  const ts = page.locator('#top-search');
  if (await ts.count() && await ts.isVisible().catch(() => false)) {
    await ts.fill('homography');
    await ts.press('Enter');
    await page.waitForTimeout(350);
    if (!page.url().includes('#/search')) {
      report.rows.push({ id: 'top-search', issues: ['Enter không route #/search'] });
    }
  }
  /* drawer mobile */
  if (isMobile) {
    await page.goto(base + '#/');
    await page.waitForTimeout(250);
    const tog = page.locator('#nav-toggle');
    if (!(await tog.count())) {
      report.rows.push({ id: 'drawer', issues: ['không có #nav-toggle'] });
      return;
    }
    await tog.click();
    await page.waitForTimeout(250);
    const opened = await page.evaluate(() =>
      document.getElementById('nav').classList.contains('open') &&
      document.getElementById('nav-backdrop').classList.contains('open'));
    if (!opened) { report.rows.push({ id: 'drawer', issues: ['toggle không mở nav'] }); return; }
    /* click backdrop ở mép phải (ngoài nav 320px) */
    await page.mouse.click(385, 400);
    await page.waitForTimeout(250);
    const closed = await page.evaluate(() =>
      !document.getElementById('nav').classList.contains('open'));
    if (!closed) report.rows.push({ id: 'drawer', issues: ['backdrop không đóng nav'] });
  }
}

/* ---------- run ---------- */
const ctx = { consoleErrs: [], pageErrs: [], failedReqs: [], blockedReqs: [], tag: '' };
const report = { rows: [] };

async function runMode(browser, base, tag) {
  for (const vp of [{ width: 1440, height: 900 }, { width: 390, height: 844 }]) {
    ctx.tag = `${tag} ${vp.width}x${vp.height}`;
    const page = await browser.newPage({ viewport: vp });
    wirePage(page, ctx);
    await guardRequests(page, ctx);
    log(`--- ${ctx.tag} ---`);
    for (const id of PAGES) {
      const row = await checkAlgoPage(page, base, id, ctx, report);
      log(`  #/p/${id}: ${row.issues.length ? 'ISSUES ' + row.issues.join(' | ') : 'ok'} (imgs=${row.imgs})`);
    }
    await checkSimpleRoutes(page, base, ctx, report);
    await checkInteractive(page, base, ctx, report);
    await checkNavAndDrawer(page, base, ctx, report, vp.width < 800);
    await page.close();
  }
}

async function main() {
  const t0 = Date.now();
  log(`e2e: pages=${PAGES.join(',') || '(none)'} modes=${FILE_ONLY ? 'file' : 'file+http'}`);
  const browser = await chromium.launch();
  const fileBase = 'file://' + path.join(ROOT, 'index.html').replace(/\\/g, '/');
  try {
    await runMode(browser, fileBase, 'file://');
    if (!FILE_ONLY) {
      await startServer();
      await runMode(browser, `http://127.0.0.1:${HTTP_PORT}/index.html`, 'http');
    }
  } finally {
    stopServer();
  }

  /* sabotage: chèn console.error → harness phải bắt được */
  if (SABOTAGE && ALL_PAGES.length) {
    const fxPath = path.join(ROOT, 'js', 'pages', '_fixture.js');
    const orig = fs.readFileSync(fxPath, 'utf8');
    let caught = false;
    try {
      fs.writeFileSync(fxPath, orig + '\nconsole.error("SABOTAGE-MARKER");\n', 'utf8');
      const p = await browser.newPage();
      let saw = false;
      p.on('console', m => { if (m.type() === 'error' && m.text().includes('SABOTAGE')) saw = true; });
      await p.goto(fileBase + '#/p/_fixture');
      await p.waitForTimeout(400);
      caught = saw;
      await p.close();
    } finally {
      fs.writeFileSync(fxPath, orig, 'utf8');
    }
    if (!caught) report.rows.push({ id: 'sabotage', issues: ['console.error không bị bắt'] });
    else log('sabotage: console.error bị bắt đúng');
  }
  await browser.close();

  /* ---------- tổng kết ---------- */
  const bad = report.rows.filter(rw => rw.issues && rw.issues.length);
  const nErr = ctx.consoleErrs.length + ctx.pageErrs.length;
  log('');
  log(`routes/pages: ${report.rows.length} checked, ${bad.length} issue-rows`);
  bad.forEach(rw => log(`  ✗ ${rw.id}: ${rw.issues.join(' | ')}`));
  log(`console.error: ${ctx.consoleErrs.length} · pageerror: ${ctx.pageErrs.length}` +
      ` · requestfailed: ${ctx.failedReqs.length} · blocked-external: ${ctx.blockedReqs.length}`);
  ctx.consoleErrs.forEach(e => log('  ' + e));
  ctx.pageErrs.forEach(e => log('  ' + e));
  ctx.failedReqs.forEach(e => log('  ' + e));
  ctx.blockedReqs.forEach(e => log('  ' + e));
  const fail = bad.length + nErr + ctx.failedReqs.length + ctx.blockedReqs.length;
  log(`e2e ${fail ? 'FAIL' : 'PASS'} — ${fail} vấn đề (${((Date.now() - t0) / 1000).toFixed(1)}s)`);
  fs.writeFileSync(LOGP, LOGBUF.join('\n') + '\n', 'utf8');
  process.exit(fail ? 1 : 0);
}

main().catch(e => { console.error(e); stopServer(); process.exit(2); });
