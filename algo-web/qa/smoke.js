/* Dev-smoke builder-C — shell + integration pack qua Playwright/Chromium.
 * Playwright: tái sử dụng frontend/node_modules (@playwright/test@1.62.0) qua
 * createRequire — algo-web KHÔNG cài dependency riêng (SPEC no-runtime-deps).
 * Phạm vi:
 *  - CONTRACT (in-page, all-registered): buildTrace defaults → trace.expected
 *    deep-equal scenario.expected; ≥3 frames/scenario (explanation + id duy
 *    nhất, không generic pad); frames JSON-safe; activeLines ⊆ pseudocode;
 *    metadata SPEC §4 (summary/role/topic/inputTypes/outputTypes/structures/
 *    complexity/edgeCases/codeRefs); parameters type+options+default;
 *    scenario.edgeCase boolean; checks chạy pass.
 *  - SRC-REFS (node-side): mọi codeRefs.path tồn tại trên disk + line ≤ file.
 *  - BROWSER step-through đầy đủ cho integration pack (23 × mọi scenario):
 *    canvas nonblank, Next-paused tạo frame MỚI đồng bộ inspector/pseudo,
 *    checks ok/ko đọc từ DOM.
 *  - A/B lessons: load + canvas nonblank + checks đọc được (spot — full QA
 *    khi owner README-ready).
 *  - HTTP mode: TOÀN BỘ integration scenarios step-through (không chỉ spot).
 *  - Controls, 6 alias, file:// + HTTP root-serve, desktop + 390px
 *    (kèm canvasEdgeLit proxy cho text-tràn-canvas).
 * Chạy: node qa/smoke.js
 */
const { createRequire } = require('module');
const path = require('path');
const feRequire = createRequire(path.resolve(__dirname, '..', '..', 'frontend', 'package.json'));
const { chromium } = feRequire('@playwright/test');
const { spawn } = require('child_process');
const fs = require('fs');
const crypto = require('crypto');

const APP_DIR = path.resolve(__dirname, '..');
const ROOT = path.resolve(APP_DIR, '..');
const FILE_URL = 'file:///' + path.join(APP_DIR, 'index.html').replace(/\\/g, '/');
const HTTP_PORT = 8137;
const HTTP_URL = `http://localhost:${HTTP_PORT}/algo-web/index.html`;
const SHOT_DIR = path.join(__dirname, 'screenshots');
const OUT = path.join(__dirname, 'smoke-results.json');

const results = {
  generatedAt: new Date().toISOString(),
  scope: 'FULL QA — ALL packs (117 lessons, 236 scenarios) file+HTTP step-through + contract + controls + paramChanges ALL packs',
  browser: null, modes: {}, packCounts: {}, contract: {}, lessons: {}, aliases: {}, controls: {}, mobile: {},
  consoleErrors: [], pageErrors: [], requestFailures: []
};

function rec(list, entry) { list.push(entry); }

/* click an toàn: bỏ qua nếu button disabled (vd đã ở frame đầu/cuối) — không đợi actionability */
const clickCtl = (page, sel) => page.$eval(sel, b => { if (!b.disabled) b.click(); }).catch(() => {});

async function watchPage(page, tag) {
  page.on('console', m => { if (m.type() === 'error') rec(results.consoleErrors, { mode: tag, url: page.url(), text: m.text().slice(0, 400) }); });
  page.on('pageerror', e => rec(results.pageErrors, { mode: tag, url: page.url(), text: String(e).slice(0, 400) }));
  page.on('requestfailed', r => rec(results.requestFailures, { mode: tag, url: r.url().slice(0, 300), err: (r.failure() || {}).errorText }));
  page.on('response', r => { if (r.status() >= 400) rec(results.requestFailures, { mode: tag, url: r.url().slice(0, 300), status: r.status() }); });
}

async function gotoLesson(page, base, id, scen) {
  await page.goto(base + '#/algo/' + id + (scen ? '?scenario=' + scen : ''));
  await page.waitForSelector('canvas', { timeout: 8000 });
  await page.waitForTimeout(60);
}

async function stepThrough(page, maxSteps) {
  let steps = 0;
  for (let i = 0; i < (maxSteps || 400); i++) {
    const dis = await page.$eval('#btn-next', b => b.disabled).catch(() => true);
    if (dis) break;
    await clickCtl(page, '#btn-next');
    steps++;
  }
  const counter = await page.$eval('#step-counter', el => el.textContent).catch(() => '');
  return { steps, counter };
}

async function canvasNonblank(page) {
  return await page.evaluate(() => {
    const c = document.querySelector('canvas');
    if (!c || !c.width) return { nonblank: false, reason: 'no canvas' };
    const x = c.getContext('2d');
    const d = x.getImageData(0, 0, c.width, c.height).data;
    let lit = 0;
    for (let i = 3; i < d.length; i += 4000) if (d[i] > 0) lit++;
    return { nonblank: lit > 0, litSamples: lit, w: c.width, h: c.height };
  });
}

/* Chụp "state hash" = canvas pixels + inspector + pseudo active — để chứng minh
 * Next-paused render frame MỚI đồng bộ, không chỉ background nonblank */
async function frameSignature(page) {
  return await page.evaluate(() => {
    const c = document.querySelector('canvas');
    let hash = 0;
    if (c) {
      const d = c.getContext('2d').getImageData(0, 0, c.width, c.height).data;
      for (let i = 0; i < d.length; i += 7919) hash = (hash * 31 + d[i]) | 0;
    }
    const ins = document.getElementById('inspector');
    const active = document.querySelector('#pseudo-list li.on, #pseudo-list li.active, #pseudo-list li.hl, #pseudo-list li[class]');
    return {
      px: hash,
      inspector: ins ? ins.textContent.slice(0, 300) : '',
      pseudoActive: active ? active.textContent.slice(0, 60) : ''
    };
  });
}

async function checkRows(page) {
  return await page.evaluate(() => {
    const rows = [...document.querySelectorAll('#checks-body .check-row')];
    return {
      total: rows.length,
      ok: rows.filter(r => r.querySelector('.ok')).length,
      ko: rows.filter(r => r.querySelector('.ko')).length,
      koLabels: rows.filter(r => r.querySelector('.ko')).map(r => r.textContent.trim().slice(0, 140))
    };
  });
}

/* CONTRACT check in-page cho mọi lesson đã register (cả 3 pack) */
async function contractCheck(page, base, tag) {
  await page.goto(base + '#/');
  await page.waitForSelector('#catalog-body', { timeout: 8000 });
  const r = await page.evaluate(() => {
    const NS = window.TechGarAlgo;
    const out = { total: 0, ok: 0, fails: [] };
    function deepEq(a, b) {
      if (a === b) return true;
      if (typeof a !== 'object' || typeof b !== 'object' || !a || !b) return false;
      const ka = Object.keys(a), kb = Object.keys(b);
      if (ka.length !== kb.length) return false;
      return ka.every(k => deepEq(a[k], b[k]));
    }
    NS.allLessons().forEach(L => {
      const pids = new Set((L.pseudocode || []).map(p => p.id));
      (L.scenarios || []).forEach(sc => {
        out.total++;
        const dp = {};
        (L.parameters || []).forEach(d => { dp[d.key] = d.default; });
        if (sc.defaultParams) Object.assign(dp, sc.defaultParams);
        try {
          const t = L.buildTrace(sc.id, dp);
          const probs = [];
          if (!t || !Array.isArray(t.frames) || !t.frames.length) probs.push('no frames');
          else {
            /* ≥3 meaningful frames (LEAD gate) + explanation + ids duy nhất */
            if (t.frames.length < 3) probs.push('chỉ ' + t.frames.length + ' frames (<3)');
            const fids = {};
            t.frames.forEach((f, i) => {
              if (!f.explanation || !String(f.explanation).trim()) probs.push('frame' + i + ' thiếu explanation');
              if (fids[f.id]) probs.push('duplicate frame id ' + f.id);
              fids[f.id] = true;
              (f.activeLines || []).forEach(ln => { if (!pids.has(ln)) probs.push('frame' + i + ' bad line ' + ln); });
            });
            /* frames JSON-safe */
            try { JSON.stringify(t.frames); } catch (e) { probs.push('frames not JSON-safe: ' + e.message); }
          }
          /* default trace.expected == scenario.expected (SPEC contract) */
          if (t && t.expected !== undefined && sc.expected !== undefined && !deepEq(t.expected, sc.expected)) {
            probs.push('expected != scenario.expected');
          }
          /* static metadata đầy đủ theo SPEC §4 */
          ['id', 'title', 'topic', 'summary', 'role'].forEach(k => { if (!L[k]) probs.push('missing ' + k); });
          ['inputTypes', 'outputTypes', 'structures', 'edgeCases'].forEach(k => {
            if (!Array.isArray(L[k])) probs.push('missing ' + k + ' (array)');
          });
          if (!L.complexity || !L.complexity.time || !L.complexity.space) probs.push('complexity thiếu time/space');
          (L.codeRefs || []).forEach(cr => { if (!cr.path || !cr.line) probs.push('codeRef thiếu path/line'); });
          if (!(L.codeRefs || []).length) probs.push('không có codeRefs');
          /* parameters: type hợp lệ + select có options + default */
          (L.parameters || []).forEach(pd => {
            if (!pd.key) probs.push('param thiếu key');
            if (!['boolean', 'number', 'select'].includes(pd.type)) probs.push('param ' + pd.key + ' type lạ "' + pd.type + '"');
            if (pd.type === 'select' && !(Array.isArray(pd.options) && pd.options.length)) probs.push('param ' + pd.key + ' select thiếu options');
            if (pd.default === undefined) probs.push('param ' + pd.key + ' thiếu default');
          });
          /* {} empty-params: buildTrace phải tự xử default khi thiếu params */
          try {
            const tE = L.buildTrace(sc.id, {});
            if (!tE || !Array.isArray(tE.frames) || !tE.frames.length) probs.push('buildTrace({}) → no frames');
          } catch (e) { probs.push('buildTrace({}) THROW ' + String(e && e.message || e).slice(0, 100)); }
          /* scenario.edgeCase phải boolean */
          if (typeof sc.edgeCase !== 'boolean') probs.push('scenario.edgeCase không phải boolean');
          /* checks phải chạy được */
          (t.checks || []).forEach((c, i) => { if (c.pass !== true) probs.push('check[' + i + '] ko: ' + (c.label || '')); });
          if (probs.length) out.fails.push({ id: L.id + '/' + sc.id, probs: probs.slice(0, 5) });
          else out.ok++;
        } catch (e) {
          out.fails.push({ id: L.id + '/' + sc.id, probs: ['THROW ' + String(e.message || e).slice(0, 160)] });
        }
      });
    });
    return out;
  });
  results.contract[tag] = r;
  return r;
}

/* ====== 2b. source-refs: path tồn tại trên disk + line hợp lệ (node-side) ====== */
async function srcRefCheck(page, tag) {
  const out = { total: 0, ok: 0, fails: [] };
  const ROOT_DIR = path.resolve(APP_DIR, '..');
  const lessons = await page.evaluate(() => window.TechGarAlgo.allLessons().map(l => ({ id: l.id, codeRefs: l.codeRefs || [] })));
  const fileCache = {};
  lessons.forEach(L => {
    (L.codeRefs || []).forEach(cr => {
      out.total++;
      const fp = path.join(ROOT_DIR, cr.path.replace(/\//g, path.sep));
      let okHere = false;
      try {
        if (fs.existsSync(fp) && Number.isInteger(cr.line) && cr.line > 0) {
          if (!(fp in fileCache)) fileCache[fp] = fs.readFileSync(fp, 'utf8').split('\n').length;
          okHere = cr.line <= fileCache[fp];
        }
      } catch (e) { /* để fails ghi */ }
      if (okHere) out.ok++; else out.fails.push({ id: L.id, ref: cr.path + ':' + cr.line });
    });
  });
  results.srcRefs = results.srcRefs || {};
  results.srcRefs[tag] = out;
  return out;
}

async function smokeMode(page, base, tag, shotList, allPacks) {
  const m = { lessonsTested: 0, scenariosTested: 0, checksOk: 0, checksTotal: 0, framesTotal: 0, fails: [] };
  await page.goto(base + '#/');
  await page.waitForSelector('#catalog-body', { timeout: 8000 });
  const counts = await page.evaluate(() => {
    const cat = window.TechGarAlgo.allLessons();
    const byPack = {};
    cat.forEach(l => { byPack[l.pack] = (byPack[l.pack] || 0) + 1; });
    return { total: cat.length, byPack, aliases: Object.keys(window.TechGarAlgo.aliases || {}), packStatus: window.TechGarAlgo.packStatus() };
  });
  if (tag === 'file') { results.packCounts = counts; }
  /* mọi pack full step-through — A READY + B freeze */
  const lessons = await page.evaluate(() => window.TechGarAlgo.allLessons().map(l => ({ id: l.id, pack: l.pack, scens: l.scenarios.map(s => s.id) })));
  for (const L of lessons) {
    const full = true;
    m.lessonsTested++; /* unique lesson — scenarios đếm riêng ở scenariosTested */
    for (const sc of L.scens) {
      const key = L.id + '/' + sc;
      try {
        await gotoLesson(page, base, L.id, sc);
        m.scenariosTested++;
        const cb = await canvasNonblank(page);
        const sig0 = await frameSignature(page);
        let steps = { steps: 0, counter: '' }, sigN = sig0;
        if (full) {
          steps = await stepThrough(page);
          m.framesTotal += steps.steps + 1;
          /* Next-paused phải tạo frame MỚI — skip nếu trace chỉ 1 frame */
          const nextDis0 = await page.$eval('#btn-next', b => b.disabled).catch(() => true);
          if (!nextDis0) {
            const firstDis = await page.$eval('#btn-first', b => b.disabled).catch(() => true);
            if (!firstDis) await clickCtl(page,'#btn-first');
            await clickCtl(page,'#btn-next');
            sigN = await frameSignature(page);
          }
        }
        const chk = await checkRows(page);
        m.checksOk += chk.ok; m.checksTotal += chk.total;
        const pseudo = await page.$eval('#pseudo-list', el => el.children.length).catch(() => 0);
        const explain = await page.$eval('#explain', el => el.textContent.trim().length).catch(() => 0);
        const row = { pack: L.pack, steps: full ? steps.steps + 1 : '-', counter: steps.counter, canvas: cb.nonblank, checks: chk.ok + '/' + chk.total, pseudo, explain };
        if (full) row.newFrameSync = sigN === sig0 ? 'single-frame' : (sigN.px !== sig0.px || sigN.inspector !== sig0.inspector) ? 'ok' : 'NO-CHANGE!';
        if (!cb.nonblank || chk.ko > 0 || pseudo === 0 || explain === 0 || row.newFrameSync === 'NO-CHANGE!') {
          row.ko = chk.koLabels; m.fails.push(key + ' ' + JSON.stringify(row));
        }
        results.lessons[key + (tag === 'http' ? ' [http]' : '')] = row;
        if (shotList.includes(L.id + '/' + sc)) {
          /* chọn frame GIÀU NỘI DUNG trong nửa sau trace (đếm pixel mực canvas):
             trace ngắn input→transform→map thì map nằm cuối — floor/ceil tĩnh
             bắt trúng frame input, sai mục đích "mid-algorithm shot" */
          const tot = await page.$eval('#step-counter', el => parseInt(el.textContent.split('/')[1], 10)).catch(() => 0);
          const inkAt = () => page.evaluate(() => {
            const c = document.querySelector('canvas'); if (!c) return 0;
            const x = c.getContext('2d'), d = x.getImageData(0, 0, c.width, c.height).data;
            /* ink = pixel khác nền — so với pixel góc (0,0) làm màu nền; nền opaque
               đồng nhất nên delta>90 chỉ đếm nội dung vẽ thật */
            const br = d[0], bg = d[1], bb = d[2];
            let n = 0;
            for (let i = 16; i < d.length; i += 16)
              if (Math.abs(d[i - 4] - br) + Math.abs(d[i - 3] - bg) + Math.abs(d[i - 2] - bb) > 90) n++;
            return n;
          });
          await clickCtl(page, '#btn-first');
          const inks = [await inkAt()];
          for (let d = 2; d <= tot; d++) { await clickCtl(page, '#btn-next'); inks.push(await inkAt()); }
          const lo = Math.max(2, Math.floor(tot / 2)); /* chỉ xét nửa sau — không bao giờ lấy frame input */
          let best = lo;
          for (let d = lo; d <= tot; d++) if ((inks[d - 1] || 0) > (inks[best - 1] || 0)) best = d;
          await clickCtl(page, '#btn-first');
          for (let i = 1; i < best; i++) await clickCtl(page, '#btn-next');
          await page.evaluate(() => window.scrollTo(0, 0));
          await page.screenshot({ path: path.join(SHOT_DIR, (tag === 'http' ? 'http-' : '') + L.id + '-' + sc + '.png'), fullPage: false });
          row.shotFrame = best + ' / ' + tot + ' ink=' + inks[best - 1];
        }
      } catch (e) {
        m.fails.push(key + ' THROW ' + String(e).slice(0, 200));
        results.lessons[key + (tag === 'http' ? ' [http]' : '')] = { error: String(e).slice(0, 200) };
      }
    }
  }
  results.modes[tag] = m;
  return counts;
}

async function controlsTest(page, base, tag) {
  const c = {};
  const idx = () => page.$eval('#step-counter', el => parseInt(el.textContent.split('/')[0], 10)).catch(() => -1);
  const ctl = sel => clickCtl(page, sel);
  await gotoLesson(page, base, 'session-state-machine', 'normal');

  /* 1) play PHẢI tăng index thật — poll tới khi đổi, timeout theo speed */
  const i0 = await idx();
  await page.selectOption('#speed-sel', '4');
  await ctl('#btn-play');
  let moved = -1;
  for (let w = 0; w < 24 && moved < 0; w++) {
    await page.waitForTimeout(125);
    const i1 = await idx();
    if (i1 > i0) moved = i1;
  }
  c.playMoved = { before: i0, after: moved, ok: moved > i0 };
  /* 2) pause → index đứng yên + aria-pressed=false (chỉ bấm nếu đang play) */
  if (await page.$eval('#btn-play', b => b.getAttribute('aria-pressed') === 'true')) await ctl('#btn-play');
  await page.waitForTimeout(80);
  const ip = await idx();
  await page.waitForTimeout(400);
  const ip2 = await idx();
  const pressed = await page.$eval('#btn-play', b => b.getAttribute('aria-pressed'));
  c.pauseStable = { idx: ip, after400ms: ip2, ariaPressed: pressed, ok: ip === ip2 && pressed === 'false' };

  /* 3) TỪNG speed 0.25/.5/1/2/4 phải thực sự advance — đo thời gian tới frame kế */
  c.speedOptions = await page.$$eval('#speed-sel option', os => os.map(o => o.value));
  c.speedAdvance = {};
  for (const sp of c.speedOptions) {
    await ctl('#btn-first');
    await page.selectOption('#speed-sel', sp);
    await ctl('#btn-play');
    const t0 = Date.now(); let adv = -1;
    const cap = Math.min(9000, Math.ceil(2600 / parseFloat(sp)) + 1000);
    while (Date.now() - t0 < cap) {
      await page.waitForTimeout(100);
      if ((await idx()) > 1) { adv = Date.now() - t0; break; }
    }
    if (await page.$eval('#btn-play', b => b.getAttribute('aria-pressed') === 'true')) await ctl('#btn-play');
    c.speedAdvance[sp] = adv >= 0 ? adv + 'ms' : 'NO-ADVANCE(cap ' + cap + 'ms)';
  }
  /* speed nhanh phải nhanh hơn speed chậm (so sánh thời gian advance đo được) */
  const ms = k => { const v = c.speedAdvance[k]; return typeof v === 'string' && v.endsWith('ms') ? parseInt(v, 10) : null; };
  c.speedOrdering = (ms('4') != null && ms('0.25') != null && ms('4') < ms('0.25')) ? 'ok (4 < 0.25)' : 'not-proven';

  /* 4) scrub/next/prev/first/end auto-pause */
  await page.selectOption('#speed-sel', '4');
  const max = await page.$eval('#step-slider', el => parseInt(el.max, 10));
  await page.$eval('#step-slider', (el, v) => { el.value = v; el.dispatchEvent(new Event('input', { bubbles: true })); }, Math.floor(max / 2));
  await page.waitForTimeout(80);
  c.scrubbed = await page.$eval('#step-counter', el => el.textContent);
  await ctl('#btn-next'); const cN = await page.$eval('#step-counter', el => el.textContent);
  await ctl('#btn-prev'); const cP = await page.$eval('#step-counter', el => el.textContent);
  c.nextPrev = cN + ' → ' + cP;
  await ctl('#btn-first');
  c.afterFirst = await page.$eval('#step-counter', el => el.textContent);
  await ctl('#btn-play');
  await page.waitForTimeout(3500);
  const end = await page.evaluate(() => ({ c: document.getElementById('step-counter').textContent, playing: document.getElementById('btn-play').getAttribute('aria-pressed') }));
  c.endAutoPause = end;

  /* 5) scenario switch → frame về "1 / n" + params reset về default
   * (dùng lesson CÓ params: observation-continuity-window, param max_gap_s) */
  await gotoLesson(page, base, 'observation-continuity-window', 'normal');
  const scens = await page.$$eval('#scen-sel option', os => os.map(o => o.value));
  if (scens.length > 1) {
    /* bẩn param trước khi đổi scenario */
    const dirty = await page.evaluate(() => {
      const inp = document.querySelector('#param-group input[type=number]');
      if (!inp) return null;
      const old = inp.value;
      inp.value = String(parseFloat(old) + 1);
      inp.dispatchEvent(new Event('change', { bubbles: true }));
      return old;
    });
    await page.selectOption('#scen-sel', scens[1]);
    await page.waitForTimeout(150);
    const counter = await page.$eval('#step-counter', el => el.textContent);
    const paramReset = await page.evaluate(() => {
      return [...document.querySelectorAll('#param-group .field')].map(f => {
        const inp = f.querySelector('input,select');
        return inp ? (inp.type === 'checkbox' ? inp.checked : inp.value) : null;
      });
    });
    const paramDefaults = await page.evaluate(() => {
      const l = window.TechGarAlgo.allLessons().find(x => location.hash.includes(x.id));
      return (l && l.parameters || []).map(d => d.default);
    });
    const resetOk = paramDefaults.length === paramReset.length &&
      paramDefaults.every((d, i) => String(paramReset[i]) === String(d));
    c.afterScenario = { counter, frame0: /^1\s*\//.test(counter), paramResetOk: paramDefaults.length ? resetOk : 'no-params', dirtyBefore: dirty };
    c.scenIds = scens;
  }

  /* 6) route change while playing → pause + frame0 ở lesson mới */
  if (!(await page.$eval('#btn-play', b => b.getAttribute('aria-pressed') === 'true'))) await ctl('#btn-play');
  await page.waitForTimeout(300);
  await gotoLesson(page, base, 'qr-token-issuance-ttl', 'normal');
  const rc = await page.$eval('#step-counter', el => el.textContent);
  const rcPressed = await page.$eval('#btn-play', b => b.getAttribute('aria-pressed'));
  c.routeChangeWhilePlaying = { counter: rc, ariaPressed: rcPressed, ok: /^1\s*\//.test(rc) && rcPressed === 'false' };
  results.controls[tag] = c;
}

/* Param-change test: đổi TỪNG param hợp lệ qua UI phải tạo thay đổi có ý nghĩa
 * trong trace (frame count / explanation / canvas / inspector) và checks vẫn
 * pass — expected được tính lại theo params mới (KHÔNG assert vs scenario.expected
 * ở nhánh non-default: contract chỉ bắt defaultParams). */
async function paramChangeTest(page, base, tag) {
  const out = { tested: 0, changed: 0, checksPass: 0, rows: [] };
  const lessons = await page.evaluate(() =>
    window.TechGarAlgo.allLessons().filter(l => (l.parameters || []).length) /* ALL packs — A READY + B freeze */
      .map(l => ({ id: l.id, pack: l.pack, scen: l.scenarios[0].id, params: l.parameters })));
  for (const L of lessons) {
    for (let pi = 0; pi < L.params.length; pi++) {
      const pd = L.params[pi];
      /* giá trị mới hợp lệ theo type */
      let newVal;
      if (pd.type === 'boolean') newVal = !pd.default;
      else if (pd.type === 'select') {
        /* options có thể là string[] hoặc {value,label}[] (frontend pack) */
        const alt = (pd.options || []).find(o => ((o && typeof o === 'object') ? o.value : o) !== pd.default);
        newVal = alt === undefined ? undefined : ((alt && typeof alt === 'object') ? alt.value : alt);
      } else { /* number: chọn giá trị khác default trong [min,max] */
        const cands = [pd.min, pd.max, pd.default + (pd.step || 1), pd.default - (pd.step || 1)]
          .filter(v => v != null && Number.isFinite(v) && v !== pd.default);
        newVal = cands.find(v => (pd.min == null || v >= pd.min) && (pd.max == null || v <= pd.max));
      }
      if (newVal === undefined) { out.rows.push({ lesson: L.id, param: pd.key, skipped: 'no-alt-value' }); continue; }
      await gotoLesson(page, base, L.id, L.scen);
      const sig0 = await frameSignature(page);
      const total0 = await page.$eval('#step-counter', el => parseInt(el.textContent.split('/')[1], 10)).catch(() => -1);
      /* set qua UI input trong #param-group theo index param (fields theo thứ tự lesson.parameters) */
      const setOk = await page.evaluate(({ pi, val }) => {
        const fields = [...document.querySelectorAll('#param-group .field')];
        const f = fields[pi];
        if (!f) return null;
        const lab = f.querySelector('label');
        const inp = f.querySelector('input,select');
        if (!inp) return null;
        if (inp.type === 'checkbox') inp.checked = !!val; else inp.value = String(val);
        inp.dispatchEvent(new Event('change', { bubbles: true }));
        return lab ? lab.textContent : '(no-label)';
      }, { pi, val: newVal });
      await page.waitForTimeout(120);
      const sig1 = await frameSignature(page);
      const total1 = await page.$eval('#step-counter', el => parseInt(el.textContent.split('/')[1], 10)).catch(() => -1);
      const chk = await checkRows(page);
      /* đọc lại TOÀN BỘ field sau edit — phát hiện UI cumulative/dirty không reset */
      const uiParams = await page.evaluate(() => {
        const o = {};
        [...document.querySelectorAll('#param-group .field')].forEach(f => {
          const lab = f.querySelector('label'), inp = f.querySelector('input,select');
          if (lab && inp) o[lab.textContent.trim()] = inp.type === 'checkbox' ? inp.checked : inp.value;
        });
        return o;
      });
      /* semantic ground truth: buildTrace với 2 bộ params phải khác frames/result;
         ghi FULL effectiveParams (defaults + scenario.defaultParams + override) + frames count */
      const tr = await page.evaluate(({ scen, key, val }) => {
        try {
          const mid = (location.hash.match(/#\/algo\/([\w-]+)/) || [])[1];
          const l = window.TechGarAlgo.allLessons().find(x => x.id === mid);
          if (!l) return null;
          const dp0 = {}, dp1 = {};
          (l.parameters || []).forEach(d => { dp0[d.key] = d.default; dp1[d.key] = d.default; });
          const sc = (l.scenarios || []).find(s => s.id === scen) || {};
          Object.assign(dp0, sc.defaultParams || {}); Object.assign(dp1, sc.defaultParams || {});
          dp1[key] = val;
          const t0 = l.buildTrace(scen, dp0), t1 = l.buildTrace(scen, dp1);
          /* expected thay đổi phải tính từ TỔ HỢP params — t1.expected là ground truth */
          return {
            effectiveParams: dp1,
            frames0: (t0.frames || []).length, frames1: (t1.frames || []).length,
            diff: JSON.stringify(t0.frames) !== JSON.stringify(t1.frames) || JSON.stringify(t0.result) !== JSON.stringify(t1.result),
            ko1: (t1.checks || []).filter(c => c.pass !== true).map(c => (c.label || '?') + ':' + JSON.stringify(c.actual).slice(0, 40) + 'vs' + JSON.stringify(c.expected).slice(0, 40))
          };
        } catch (e) { return { throw: String(e && e.message || e).slice(0, 140) }; }
      }, { scen: L.scen, key: pd.key, val: newVal });
      const uiChanged = sig1.px !== sig0.px || sig1.inspector !== sig0.inspector || total1 !== total0;
      const traceThrow = tr && tr.throw ? tr.throw : null;
      const changed = tr && tr.diff === true; /* traceDiff là ground truth; uiChanged phụ thuộc frame0 */
      const lowFrames = tr && tr.frames1 != null && tr.frames1 < 3; /* changed trace cũng phải ≥3 frames */
      out.tested++;
      if (changed) out.changed++;
      if (chk.ko === 0 && chk.total > 0) out.checksPass++;
      if (lowFrames) out.lowFrames = (out.lowFrames || 0) + 1;
      out.rows.push({
        lesson: L.id, pack: L.pack, scenario: L.scen, param: pd.key, type: pd.type,
        from: pd.default, to: newVal, uiField: setOk,
        effectiveParams: tr && tr.effectiveParams, uiParams: uiParams,
        frames: total0 + '→' + total1, traceFrames1: tr && tr.frames1, lowFrames: lowFrames || undefined,
        traceDiff: tr ? tr.diff : null, traceThrow, uiChanged, traceKo: tr && tr.ko1 && tr.ko1.length ? tr.ko1 : undefined,
        checks: chk.ok + '/' + chk.total + (chk.ko ? ' KO:' + chk.koLabels[0].slice(0, 80) : '')
      });
    }
  }
  /* gắn pack version để mỗi fail truy được về file hash cụ thể */
  out.packVersions = {};
  (results.packCounts && results.packCounts.packStatus ? Object.keys(results.packCounts.packStatus) : []).forEach(pk => {
    const meta = results.packMeta && results.packMeta['packs/' + pk + '.js'];
    if (meta) out.packVersions[pk] = { mtime: meta.mtime, sha256_16: meta.sha256_16 };
  });
  results.paramChanges = results.paramChanges || {};
  results.paramChanges[tag] = out;
}

/* DOM evidence cho select params — chốt mismatch shell↔pack option shape.
   Contract đã chốt (README §options): options: [{ value, label }] hoặc primitive string.
   Shell render o.value/o.label; KHÔNG normalize object lạ (mask lỗi pack). */
async function paramDomEvidence(page, base, tag, lessonId, scenId) {
  const ev = { lesson: lessonId, scenario: scenId, fields: [], selects: [], fails: [] };
  await gotoLesson(page, base, lessonId, scenId);
  await page.waitForSelector('#param-group .field');
  ev.fields = await page.evaluate(() =>
    [...document.querySelectorAll('#param-group .field')].map(f => {
      const lab = f.querySelector('label');
      const inp = f.querySelector('select,input');
      if (!inp) return { label: lab ? lab.textContent.trim() : '(no-label)', tag: 'NONE' };
      if (inp.tagName === 'SELECT') return {
        label: lab ? lab.textContent.trim() : '(no-label)', tag: 'SELECT',
        optionCount: inp.options.length,
        options: [...inp.options].map(o => ({ value: o.value, text: o.text })),
        selected: inp.value
      };
      return { label: lab ? lab.textContent.trim() : '(no-label)', tag: inp.tagName + ':' + inp.type, value: inp.type === 'checkbox' ? inp.checked : inp.value };
    }));
  /* assert: mọi select phải có option > 0, không option nào value/text dạng [object Object] */
  for (const f of ev.fields) {
    if (f.tag !== 'SELECT') continue;
    ev.selects.push(f.label);
    if (!f.optionCount) ev.fails.push(f.label + ': 0 options');
    for (const o of f.options || []) {
      if (/^\[object /.test(String(o.value)) || /^\[object /.test(String(o.text)))
        ev.fails.push(f.label + ': option rỗng/object ' + JSON.stringify(o));
      if (o.text === '' || o.text == null) ev.fails.push(f.label + ': option text rỗng value=' + o.value);
    }
    if (!(f.options || []).some(o => o.value === f.selected))
      ev.fails.push(f.label + ': selected ' + f.selected + ' không thuộc options');
  }
  /* đổi từng select qua UI thật → trace/state phải thay đổi */
  const sels = await page.evaluate(() =>
    [...document.querySelectorAll('#param-group .field')].map((f, i) => {
      const s = f.querySelector('select');
      if (!s) return null;
      const alt = [...s.options].find(o => o.value !== s.value);
      return alt ? { i, from: s.value, to: alt.value } : null;
    }).filter(Boolean));
  ev.uiChanges = [];
  for (const s of sels) {
    const sig0 = await frameSignature(page);
    const res0 = await page.$eval('#inspector', el => el.textContent).catch(() => '');
    await page.evaluate(({ i, to }) => {
      const sel = [...document.querySelectorAll('#param-group .field')][i].querySelector('select');
      sel.value = to; sel.dispatchEvent(new Event('change', { bubbles: true }));
    }, { i: s.i, to: s.to });
    await page.waitForTimeout(150);
    const sig1 = await frameSignature(page);
    const res1 = await page.$eval('#inspector', el => el.textContent).catch(() => '');
    const changed = sig1.px !== sig0.px || sig1.inspector !== sig0.inspector || res0 !== res1;
    ev.uiChanges.push({ field: ev.fields[s.i] && ev.fields[s.i].label, from: s.from, to: s.to, changed });
    if (!changed) ev.fails.push('select ' + s.from + '→' + s.to + ' UI không đổi trace/state');
  }
  ev.ok = ev.fails.length === 0;
  results.paramDomEvidence = results.paramDomEvidence || {};
  results.paramDomEvidence[tag] = ev;
}

async function aliasTest(page, base, tag) {
  const a = {};
  const aliases = await page.evaluate(() => Object.assign({}, window.TechGarAlgo.aliases));
  for (const [alias, canon] of Object.entries(aliases)) {
    await page.goto(base + '#/algo/' + alias);
    await page.waitForTimeout(200);
    const hash = await page.evaluate(() => location.hash);
    a[alias] = { target: canon, landed: hash.includes(canon) ? 'ok' : 'FAIL:' + hash };
  }
  results.aliases[tag] = a;
}

async function mobileTest(page, base) {
  await page.setViewportSize({ width: 390, height: 800 });
  await page.goto(base + '#/');
  await page.waitForSelector('#catalog-body');
  const m = {};
  m.catalogOk = await page.$eval('#catalog-body', el => el.children.length > 0);
  m.sidebarCollapsed = await page.evaluate(() => {
    const sb = document.querySelector('.sidebar');
    return sb ? !sb.classList.contains('open') : null;
  });
  m.hScroll = await page.evaluate(() => document.documentElement.scrollWidth > 395);
  await gotoLesson(page, base, 'directed-crossing-direction', 'normal');
  /* step vài frame để panel 'd' hiện — đây là chỗ text tràn 390px đã fix */
  for (let i = 0; i < 3; i++) await clickCtl(page,'#btn-next');
  const cb = await canvasNonblank(page);
  m.canvasNonblank = cb.nonblank;
  m.canvasFits = await page.evaluate(() => {
    const c = document.querySelector('canvas');
    return c ? c.getBoundingClientRect().width <= 390 : false;
  });
  /* scene-fit heuristic: cột mép phải của canvas không được cháy sát text —
     proxy: đếm pixel sáng ở 2 cột ngoài cùng */
  m.canvasEdgeLit = await page.evaluate(() => {
    const c = document.querySelector('canvas');
    if (!c) return -1;
    const x = c.getContext('2d'), d = x.getImageData(0, 0, c.width, c.height).data;
    let lit = 0;
    for (let y = 0; y < c.height; y += 2)
      for (let i = 0; i < 2; i++) {
        const p = (y * c.width + (c.width - 1 - i)) * 4;
        if (d[p + 3] > 0 && (d[p] > 30 || d[p + 1] > 30 || d[p + 2] > 30)) lit++;
      }
    return lit;
  });
  await page.evaluate(() => window.scrollTo(0, 0));
  const cEl = await page.$('canvas');
  if (cEl) await cEl.screenshot({ path: path.join(SHOT_DIR, 'mobile-390-canvas.png') });
  await page.screenshot({ path: path.join(SHOT_DIR, 'mobile-390.png'), fullPage: false });
  await page.setViewportSize({ width: 1280, height: 800 });
  results.mobile = m;
}

(async () => {
  fs.mkdirSync(SHOT_DIR, { recursive: true });
  /* snapshot file đã load — mọi failure gắn được với phiên bản pack cụ thể */
  results.packMeta = {};
  ['index.html', 'shared/engine.js', 'app.js', 'packs/frontend.js', 'packs/cv.js', 'packs/integration.js'].forEach(rel => {
    const fp = path.join(APP_DIR, rel);
    const st = fs.statSync(fp);
    results.packMeta[rel] = { size: st.size, mtime: st.mtime.toISOString(), sha256_16: crypto.createHash('sha256').update(fs.readFileSync(fp)).digest('hex').slice(0, 16) };
  });
  const browser = await chromium.launch();
  results.browser = await browser.version();
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 800 } });
  const page = await ctx.newPage();
  await watchPage(page, 'file');

  const SHOTS = ['directed-crossing-direction/normal', 'session-state-machine/normal', 'qr-token-issuance-ttl/normal',
    'replay-timestamp-pairing/normal', 'gate-config-validate-save/normal', 'atomic-session-store/normal',
    'parking-episode-apply/normal', 'snapshot-v2-build/normal',
    /* mid-algorithm đại diện cho LEAD review: A* / projection / matrix / morphology / tracks / handoff */
    'astar-find-route/default', 'world-svg-project/default',
    'association-cost-matrix/normal', 'foreground-morphology/normal', 'track-lifecycle/normal',
    'vehicle-svg-project/default', 'mog2-foreground-mask/normal', 'lapjv-assignment/normal',
    'sticky-id-bind-release/normal', 'handoff-lapjv-matching/normal'];

  /* ============ MODE 1: file:// ============ */
  await contractCheck(page, FILE_URL, 'file'); /* contract cho MỌI lesson đã register */
  await srcRefCheck(page, 'file'); /* codeRefs path/line tồn tại trên disk */
  await smokeMode(page, FILE_URL, 'file', SHOTS, true); /* allPacks=true: C full-step, A/B spot */
  await page.goto(FILE_URL + '#/');
  await page.waitForSelector('#catalog-body');
  await page.screenshot({ path: path.join(SHOT_DIR, 'catalog-file.png'), fullPage: false });
  await controlsTest(page, FILE_URL, 'file');
  await paramChangeTest(page, FILE_URL, 'file');
  await paramDomEvidence(page, FILE_URL, 'file', 'vehicle-svg-project', 'default');
  await aliasTest(page, FILE_URL, 'file');
  await mobileTest(page, FILE_URL);

  /* ============ MODE 2: HTTP root-serve ============ */
  const srv = spawn('python', ['-m', 'http.server', String(HTTP_PORT), '--directory', ROOT], { stdio: 'ignore' });
  await new Promise(r => setTimeout(r, 1500));
  try {
    await page.goto(HTTP_URL + '#/');
    await page.waitForSelector('#catalog-body');
    const httpCounts = await page.evaluate(() => window.TechGarAlgo.allLessons().length);
    results.modes.http = { catalog: httpCounts, lessonsTested: 0, scenariosTested: 0, fails: [] };
    /* full coverage ALL packs (A READY + B freeze): mọi lesson × mọi scenario */
    const intLessons = await page.evaluate(() =>
      window.TechGarAlgo.allLessons()
        .map(l => ({ id: l.id, scens: l.scenarios.map(s => s.id) })));
    for (const L of intLessons) {
      results.modes.http.lessonsTested++;
      for (const sc of L.scens) {
        results.modes.http.scenariosTested++;
        try {
          await gotoLesson(page, HTTP_URL, L.id, sc);
          const cb = await canvasNonblank(page);
          const steps = await stepThrough(page);
          const chk = await checkRows(page);
          if (!cb.nonblank || chk.ko > 0 || steps.steps < 1)
            results.modes.http.fails.push(L.id + '/' + sc + ' canvas=' + cb.nonblank + ' ko=' + chk.ko + ' steps=' + steps.steps);
        } catch (e) { results.modes.http.fails.push(L.id + '/' + sc + ' THROW ' + String(e).slice(0, 160)); }
      }
    }
    results.modes.http.sourceLinks = await page.evaluate(() => {
      return [...document.querySelectorAll('a')].filter(a => (a.getAttribute('href') || '').startsWith('../')).slice(0, 5).map(a => a.getAttribute('href'));
    });
    await aliasTest(page, HTTP_URL, 'http');
    await controlsTest(page, HTTP_URL, 'http');
    await page.screenshot({ path: path.join(SHOT_DIR, 'catalog-http.png'), fullPage: false });
  } finally {
    srv.kill(); /* server của chính QA — user-server không đụng */
  }

  await browser.close();
  fs.writeFileSync(OUT, JSON.stringify(results, null, 2));
  const m = results.modes;
  console.log('=== DEV-SMOKE (C scope + contract all-registered) ===');
  console.log('browser:', results.browser);
  console.log('pack counts:', JSON.stringify(results.packCounts.byPack), '| aliases:', results.packCounts.aliases);
  console.log('packStatus:', JSON.stringify(results.packCounts.packStatus));
  console.log('contract file:', JSON.stringify(results.contract.file && { total: results.contract.file.total, ok: results.contract.file.ok, fails: results.contract.file.fails.length }));
  console.log('srcRefs file:', JSON.stringify(results.srcRefs && results.srcRefs.file && { total: results.srcRefs.file.total, ok: results.srcRefs.file.ok, fails: results.srcRefs.file.fails.length }));
  console.log('file:', JSON.stringify(m.file));
  console.log('http:', JSON.stringify(m.http));
  console.log('controls file:', JSON.stringify(results.controls.file));
  console.log('paramChanges file:', JSON.stringify(results.paramChanges && results.paramChanges.file && { tested: results.paramChanges.file.tested, changed: results.paramChanges.file.changed, checksPass: results.paramChanges.file.checksPass }));
  const pcFails = (results.paramChanges && results.paramChanges.file ? results.paramChanges.file.rows : []).filter(r => r.traceDiff === false || r.traceThrow || r.lowFrames || /KO/.test(r.checks || ''));
  if (pcFails.length) console.log('PARAM FAILS:\n' + pcFails.map(f => JSON.stringify(f)).join('\n'));
  console.log('paramDomEvidence:', JSON.stringify(results.paramDomEvidence && results.paramDomEvidence.file));
  console.log('mobile:', JSON.stringify(results.mobile));
  console.log('consoleErrors:', results.consoleErrors.length, '| pageErrors:', results.pageErrors.length, '| reqFails:', results.requestFailures.length);
  if (results.contract.file && results.contract.file.fails.length) console.log('CONTRACT FAILS:\n' + results.contract.file.fails.map(f => JSON.stringify(f)).join('\n'));
  if (m.file && m.file.fails.length) console.log('FILE FAILS:\n' + m.file.fails.slice(0, 30).join('\n'));
  if (results.consoleErrors.length) console.log('CONSOLE:', results.consoleErrors.slice(0, 8));
  if (results.pageErrors.length) console.log('PAGE:', results.pageErrors.slice(0, 8));
  if (results.requestFailures.length) console.log('REQ:', results.requestFailures.slice(0, 8));
})().catch(e => { console.error('SMOKE CRASH', e); try { fs.writeFileSync(OUT, JSON.stringify(results, null, 2)); } catch (_) {} process.exit(1); });
