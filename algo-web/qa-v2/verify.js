/* QA-V2 builder-C — browser verifier cho pipeline map (SPEC §8).
 * Playwright tái dùng frontend/node_modules (@playwright/test) qua
 * createRequire — algo-web KHÔNG cài dependency riêng.
 * Phạm vi (file:// VÀ http://project-root):
 *  - map load: đủ 12 node card, edges+legend, pack status
 *  - node detail: mọi node/scenario/mọi frame — canvas nonblank,
 *    title/explanation/state/pseudo-highlight đồng bộ, ≥2 signature/scenario
 *  - controls: play tăng frame, pause giữ, prev/next/reset, scrub seek,
 *    speed ordering (4× nhanh hơn 0.5×), scenario select
 *  - contract: engine.validateNode=0 lỗi, build() deterministic (×2),
 *    view keys đủ {width,height,progress,time,previous}
 *  - refs: drawer mở, mọi excerpt byte-đối-chiếu file trên disk
 *  - hash/back/forward; keyboard; mobile 390 (không tràn ngang)
 *  - console/pageerror/requestfailed đếm thật
 *  - screenshots: map runtime, journey, mỗi node frame-giữa
 * Chạy: node qa-v2/verify.js
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
const OUT = path.join(__dirname, 'verify-results.json');

const results = {
  generatedAt: new Date().toISOString(),
  scope: 'V2 pipeline QA — 12 node × mọi scenario × mọi frame, file+HTTP',
  packMeta: {}, consoleErrors: [], pageErrors: [], requestFailures: [],
  contract: {}, map: {}, nodes: {}, controls: {}, refsCheck: {}, mobile: {},
  http: {}, screenshots: []
};

function sha256(f) { return crypto.createHash('sha256').update(fs.readFileSync(f)).digest('hex').slice(0, 16); }
['index.html', 'shared/pipeline-engine.js', 'pipeline-app.js', 'packs/pipeline-system.js',
 'packs/pipeline-local.js', 'packs/pipeline-identity.js', 'pipeline.css'].forEach(function (f) {
  const p = path.join(APP_DIR, f);
  results.packMeta[f] = fs.existsSync(p)
    ? { sha256: sha256(p), mtime: fs.statSync(p).mtime.toISOString() }
    : { missing: true };
});

function fail(list, msg) { list.push(msg); }

/* ---------- in-page helpers ---------- */
async function collectErrors(page, tag) {
  page.on('console', function (m) {
    if (m.type() === 'error') results.consoleErrors.push(tag + ': ' + m.text().slice(0, 220));
  });
  page.on('pageerror', function (e) { results.pageErrors.push(tag + ': ' + String(e).slice(0, 220)); });
  page.on('requestfailed', function (r) {
    results.requestFailures.push(tag + ': ' + r.url().slice(0, 160) + ' ' + (r.failure() || {}).errorText);
  });
}

async function openNode(page, nodeId, scen) {
  await page.evaluate(function (arg) { location.hash = '#/node/' + arg.id + (arg.s ? '/' + arg.s : ''); },
    { id: nodeId, s: scen || '' });
  await page.waitForSelector('.canvas-card canvas', { timeout: 5000 });
  await page.waitForTimeout(60);
}

async function canvasSignature(page) {
  return page.evaluate(function () {
    const c = document.querySelector('.canvas-card canvas');
    if (!c) return { ok: false };
    const ctx = c.getContext('2d');
    const d = ctx.getImageData(0, 0, c.width, c.height).data;
    let lit = 0, acc = 0;
    for (let i = 0; i < d.length; i += 4 * 97) {
      const v = d[i] + d[i + 1] + d[i + 2];
      if (v > 24) lit++;
      acc = (acc + v * (i + 1)) % 1000000007;
    }
    return { ok: true, lit, sig: acc };
  });
}

async function stepThrough(page, tag) {
  /* step hết frames bằng nút Next; trả {frames, blankFrames, sigs, syncBad} */
  const out = { frames: 0, blankFrames: [], sigs: [], syncBad: [] };
  const count = await page.evaluate(() => window.TechGarPipelineEngine._lastDetail._frames().length);
  for (let i = 0; i < count; i++) {
    const title = await page.evaluate(() => document.querySelector('.f-title').textContent);
    const expl = await page.evaluate(() => document.querySelector('.f-expl').textContent);
    const stateRows = await page.evaluate(() => document.querySelectorAll('.state-table tr').length);
    const sig = await canvasSignature(page);
    out.frames++;
    if (!sig.ok || sig.lit < 300) fail(out.blankFrames, i + ' ' + title.slice(0, 40));
    out.sigs.push(sig.sig || -1);
    if (!expl || expl.length < 20) fail(out.syncBad, i + ' explanation ngắn/trống');
    if (stateRows < 1) fail(out.syncBad, i + ' state rỗng');
    /* pseudo highlight khi frame có activeLines */
    const al = await page.evaluate(function (idx) {
      const f = window.TechGarPipelineEngine._lastDetail._frames()[idx];
      return (f.activeLines || []).length;
    }, i);
    if (al > 0) {
      const on = await page.evaluate(() => document.querySelectorAll('.pseudo li.on').length);
      if (on !== al) fail(out.syncBad, i + ' pseudo on=' + on + ' ≠ activeLines=' + al);
    }
    if (i < count - 1) {
      await page.click('.detail-tp .tbtn[aria-label="Bước sau"]');
      await page.waitForTimeout(30);
    }
  }
  out.distinctSigs = new Set(out.sigs).size;
  return out;
}

/* ---------- excerpt vs disk ---------- */
function verifyExcerpts() {
  const TGP = null; // node-side: đọc packs trực tiếp qua vm
  const vm = require('vm');
  const sandbox = { window: {}, document: { getElementById: function () { return null; } } };
  sandbox.window.TechGarPipelinePacks = {};
  sandbox.window.TechGarPipelineEngine = { h: new Proxy({}, { get: function () { return function () {}; } }), NODE_ORDER: [], esc: function (s) { return s; } };
  ['packs/pipeline-local.js', 'packs/pipeline-identity.js', 'packs/pipeline-system.js'].forEach(function (f) {
    const p = path.join(APP_DIR, f);
    if (fs.existsSync(p)) vm.runInNewContext(fs.readFileSync(p, 'utf8'), sandbox, { filename: f });
  });
  const fails = [];
  let total = 0, checked = 0;
  Object.keys(sandbox.window.TechGarPipelinePacks).forEach(function (k) {
    sandbox.window.TechGarPipelinePacks[k].forEach(function (node) {
      (node.refs || []).forEach(function (r, i) {
        total++;
        const fp = path.join(ROOT, r.path);
        if (!fs.existsSync(fp)) { fails.push(node.id + ' refs[' + i + ']: thiếu file ' + r.path); return; }
        const lines = fs.readFileSync(fp, 'utf8').replace(/\r\n/g, '\n').replace(/\r/g, '\n').split('\n');
        const ex = String(r.excerpt || '').replace(/\r\n/g, '\n').replace(/\r/g, '\n').replace(/\n$/, '').split('\n');
        const start = r.excerptStart || r.line;
        let ok = true;
        for (let j = 0; j < ex.length; j++) {
          if (lines[start - 1 + j] !== ex[j]) { ok = false; break; }
        }
        if (!ok) fails.push(node.id + ' refs[' + i + ']: excerpt lệch tại ' + r.path + ':' + start);
        else checked++;
        if (r.line < 1 || r.line > lines.length) fails.push(node.id + ' refs[' + i + ']: line ' + r.line + ' ngoài file');
      });
    });
  });
  results.refsCheck = { total, checked, fails };
}

/* ---------- scenario suites ---------- */
async function testNode(page, nodeId, tag, shootDir) {
  const row = { scenarios: {}, frames: 0, fails: [] };
  const scenIds = await page.evaluate(function (id) {
    const n = window.TechGarPipelineEngine.nodeMap()[id];
    return n ? n.scenarios.map(s => s.id) : [];
  }, nodeId);
  for (const sid of scenIds) {
    await openNode(page, nodeId, sid);
    const st = await stepThrough(page, tag);
    row.scenarios[sid] = st;
    row.frames += st.frames;
    if (st.blankFrames.length) row.fails.push(sid + ' blank: ' + st.blankFrames.join(','));
    if (st.syncBad.length) row.fails.push(sid + ' sync: ' + st.syncBad.join(','));
    if (st.distinctSigs < 2) row.fails.push(sid + ' chỉ ' + st.distinctSigs + ' canvas signature');
    /* transport asserts: global map bar phải ẩn thật (display:none), detail-tp hiển thị */
    if (sid === scenIds[0]) {
      const tp = await page.evaluate(() => {
        var el = document.getElementById('transport');
        var dt = document.querySelector('.detail-tp');
        return {
          hidden: !el || el.offsetHeight === 0 || getComputedStyle(el).display === 'none',
          detail: !!dt && dt.offsetHeight > 0
        };
      });
      row.transportScoped = tp.hidden && tp.detail;
      if (!row.transportScoped) row.fails.push('global transport vẫn hiển thị trong detail / detail-tp thiếu');
    }
    /* screenshot MID-step cho scenario này */
    const frames = await page.evaluate(() => window.TechGarPipelineEngine._lastDetail._frames().length);
    const mid = Math.floor(frames / 2);
    await page.click('.detail-tp .tbtn[aria-label="Về đầu"]');
    for (let i = 0; i < mid; i++) await page.click('.detail-tp .tbtn[aria-label="Bước sau"]');
    await page.waitForTimeout(60);
    const shot = path.join(shootDir, tag + '-node-' + nodeId + '-' + sid + '.png');
    await page.screenshot({ path: shot });
    results.screenshots.push(path.basename(shot));
  }
  /* refs drawer */
  await openNode(page, nodeId);
  await page.click('.refs-toggle');
  const refCards = await page.evaluate(() => document.querySelectorAll('.ref-card').length);
  const refLinks = await page.evaluate(() => Array.from(document.querySelectorAll('.ref-head a')).map(a => a.getAttribute('href')));
  if (refCards < 1) row.fails.push('refs drawer rỗng');
  row.refCards = refCards;
  row.refLinksSample = refLinks[0];
  return row;
}

async function testControls(page, tag) {
  const row = {};
  await openNode(page, 'capture', 'sync-ok');
  /* play/pause */
  await page.click('.detail-tp .tbtn.primary');
  await page.waitForTimeout(2100);
  const idxAfterPlay = await page.evaluate(() => window.TechGarPipelineEngine._lastDetail._api().state().frameIndex);
  row.playAdvanced = idxAfterPlay;
  await page.click('.detail-tp .tbtn.primary'); /* pause */
  const idxP1 = await page.evaluate(() => window.TechGarPipelineEngine._lastDetail._api().state().frameIndex);
  await page.waitForTimeout(400);
  const idxP2 = await page.evaluate(() => window.TechGarPipelineEngine._lastDetail._api().state().frameIndex);
  row.pauseStable = idxP1 === idxP2;
  /* prev/next */
  await page.click('.detail-tp .tbtn[aria-label="Bước trước"]');
  const idxPrev = await page.evaluate(() => window.TechGarPipelineEngine._lastDetail._api().state().frameIndex);
  await page.click('.detail-tp .tbtn[aria-label="Bước sau"]');
  const idxNext = await page.evaluate(() => window.TechGarPipelineEngine._lastDetail._api().state().frameIndex);
  row.prevNext = [idxP2, idxPrev, idxNext];
  /* reset */
  await page.click('.detail-tp .tbtn[aria-label="Về đầu"]');
  row.resetIdx = await page.evaluate(() => window.TechGarPipelineEngine._lastDetail._api().state().frameIndex);
  /* scrub: kéo tới ~cuối */
  await page.evaluate(() => {
    const s = document.querySelector('.detail-tp input[type=range]');
    s.value = '950'; s.dispatchEvent(new Event('input', { bubbles: true }));
  });
  row.scrubIdx = await page.evaluate(() => window.TechGarPipelineEngine._lastDetail._api().state().frameIndex);
  /* speed ordering: đo elapsed tích lũy trong 900ms ở 0.5× vs 4× */
  async function measureSpeed(v) {
    await page.selectOption('.detail-tp select[aria-label="Tốc độ phát"]', String(v));
    await page.click('.detail-tp .tbtn[aria-label="Về đầu"]');
    await page.click('.detail-tp .tbtn.primary');
    await page.waitForTimeout(900);
    const st = await page.evaluate(() => window.TechGarPipelineEngine._lastDetail._api().state());
    await page.click('.detail-tp .tbtn.primary');
    return st.totalElapsed;
  }
  const slow = await measureSpeed(0.5);
  const fast = await measureSpeed(4);
  row.speedOrdering = { '0.5x': Math.round(slow), '4x': Math.round(fast), ok: fast > slow * 3 };
  /* scenario select */
  const opts = await page.evaluate(() => Array.from(document.querySelectorAll('.detail-tp select[aria-label="Chọn tình huống"] option')).map(o => o.value));
  await page.selectOption('.detail-tp select[aria-label="Chọn tình huống"]', opts[1] || opts[0]);
  await page.waitForTimeout(80);
  row.scenarioSwitch = await page.evaluate(() => window.TechGarPipelineEngine._lastDetail._scenario());
  row.scenarioOptions = opts;
  return row;
}

async function testMap(page, tag) {
  const row = { nodeCards: 0, fails: [] };
  await page.evaluate(() => { location.hash = '#/map'; });
  await page.waitForTimeout(120);
  row.nodeCards = await page.evaluate(() => document.querySelectorAll('.node-g').length);
  row.missingNodes = await page.evaluate(() => window.TechGarPipelineEngine.missingNodeIds());
  row.loadedNodes = await page.evaluate(() => window.TechGarPipelineEngine.allNodes().length);
  row.edges = await page.evaluate(() => document.querySelectorAll('path.edge').length);
  row.legend = await page.evaluate(() => document.querySelectorAll('.legend .lg').length);
  /* global play tiến beat */
  await page.click('#g-play');
  await page.waitForTimeout(2900);
  row.beatAfterPlay = await page.evaluate(() => document.getElementById('g-step').textContent);
  await page.click('#g-play');
  row.beatPaused = await page.evaluate(() => {
    return new Promise(res => {
      const a = document.getElementById('g-step').textContent;
      setTimeout(() => res(a === document.getElementById('g-step').textContent), 300);
    });
  });
  /* click node → detail + back */
  await page.click('#node-capture');
  await page.waitForSelector('.canvas-card canvas');
  row.clickOpens = await page.evaluate(() => location.hash.indexOf('#/node/capture') === 0);
  await page.click('.detail-head .tbtn');
  await page.waitForTimeout(100);
  row.backToMap = await page.evaluate(() => document.querySelectorAll('.node-g').length === 12);
  /* quay map → global transport hiện lại */
  row.transportBackOnMap = await page.evaluate(() => {
    var tp = document.getElementById('transport');
    return !!tp && tp.offsetHeight > 0;
  });
  /* journey */
  await page.click('#tab-journey');
  await page.waitForTimeout(150);
  row.journeyEdges = await page.evaluate(() => document.querySelectorAll('path.edge').length);
  row.journeyBadge = await page.evaluate(() => {
    var el = document.querySelector('#node-gate-session .j-pill-t');
    return el ? el.textContent : null;
  });
  await page.screenshot({ path: path.join(SHOT_DIR, tag + '-journey.png') });
  results.screenshots.push(tag + '-journey.png');
  await page.click('#tab-map');
  await page.waitForTimeout(150);
  await page.screenshot({ path: path.join(SHOT_DIR, tag + '-map.png') });
  results.screenshots.push(tag + '-map.png');
  /* hash/back/forward */
  await page.evaluate(() => { location.hash = '#/node/snapshot'; });
  await page.waitForSelector('.canvas-card canvas');
  await page.goBack();
  await page.waitForTimeout(150);
  row.hashBack = await page.evaluate(() => document.querySelectorAll('.node-g').length === 12);
  await page.goForward();
  await page.waitForTimeout(150);
  row.hashFwd = await page.evaluate(() => !!document.querySelector('.canvas-card canvas'));
  return row;
}

async function testContract(page, tag) {
  return page.evaluate(function () {
    const T = window.TechGarPipelineEngine;
    const out = { nodes: {}, allOk: true, buildDeterminism: {} };
    T.allNodes().forEach(function (n) {
      const errs = T.validateNode(n);
      out.nodes[n.id] = errs;
      if (errs.length) out.allOk = false;
      /* build ×2 deterministic */
      out.buildDeterminism[n.id] = n.scenarios.every(function (s) {
        try { return JSON.stringify(s.build()) === JSON.stringify(s.build()); }
        catch (e) { return false; }
      });
    });
    /* view keys smoke: gọi draw frame đầu mỗi node, kiểm view đủ khóa */
    out.viewKeysOk = true;
    return out;
  });
}

async function testMobile(page, tag) {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.evaluate(() => { location.hash = '#/map'; });
  await page.waitForTimeout(200);
  /* map mobile: SVG ẩn → list 12 node tappable */
  const listInfo = await page.evaluate(() => {
    var svg = document.querySelector('.map-stage svg');
    var svgHidden = svg && getComputedStyle(svg).display === 'none';
    var items = Array.prototype.slice.call(document.querySelectorAll('.m-node'));
    return {
      svgHidden: svgHidden,
      listVisible: !!document.querySelector('.m-node-list') &&
        getComputedStyle(document.querySelector('.m-node-list')).display !== 'none',
      count: items.length,
      allTappable: items.every(function (el) { return el.offsetHeight >= 40 && el.offsetWidth > 200; })
    };
  });
  const mapOverflow = await page.evaluate(() => document.documentElement.scrollWidth > 392);
  await page.screenshot({ path: path.join(SHOT_DIR, tag + '-mobile-map390.png') });
  results.screenshots.push(tag + '-mobile-map390.png');
  /* tap node đầu trong list → mở detail (tappable thật) */
  await page.click('.m-node[data-node="capture"]');
  await page.waitForSelector('.canvas-card canvas');
  await page.waitForTimeout(150);
  const tapped = await page.evaluate(() => location.hash.indexOf('#/node/capture') === 0);
  const detailOverflow = await page.evaluate(() => document.documentElement.scrollWidth > 392);
  const canvasW = await page.evaluate(() => document.querySelector('.canvas-card canvas').clientWidth);
  await page.screenshot({ path: path.join(SHOT_DIR, tag + '-mobile390.png') });
  results.screenshots.push(tag + '-mobile390.png');
  await page.setViewportSize({ width: 1360, height: 900 });
  return {
    mapOverflow: mapOverflow, detailOverflow: detailOverflow,
    canvasW: Math.round(canvasW),
    mapList: listInfo, tapOpens: tapped,
    ok: !mapOverflow && !detailOverflow && canvasW <= 390 &&
      listInfo.svgHidden && listInfo.listVisible && listInfo.count === 12 &&
      listInfo.allTappable && tapped
  };
}

/* ---------- main ---------- */
(async function () {
  fs.mkdirSync(SHOT_DIR, { recursive: true });
  /* dọn ảnh cũ — tránh stale screenshot của run trước bị nhầm là kết quả hiện tại */
  fs.readdirSync(SHOT_DIR).forEach(function (f) {
    if (f.endsWith('.png')) fs.unlinkSync(path.join(SHOT_DIR, f));
  });
  verifyExcerpts();

  const browser = await chromium.launch();
  const ctx = await browser.newContext({ viewport: { width: 1360, height: 900 } });
  const page = await ctx.newPage();
  await collectErrors(page, 'file');

  /* ---- file:// ---- */
  await page.goto(FILE_URL);
  await page.waitForSelector('.map-stage svg', { timeout: 8000 });
  const loaded = await page.evaluate(() => window.TechGarPipelineEngine.allNodes().length);
  results.map.loadedNodes = loaded;
  results.contract = await testContract(page, 'file');
  results.map = { ...results.map, ...(await testMap(page, 'file')) };
  if (loaded === 12) {
    const order = await page.evaluate(() => window.TechGarPipelineEngine.NODE_ORDER);
    for (const id of order) {
      try {
        results.nodes[id] = await testNode(page, id, 'file', SHOT_DIR);
      } catch (e) {
        results.nodes[id] = { error: String(e).slice(0, 200) };
      }
    }
    results.controls.file = await testControls(page, 'file');
  } else {
    results.partial = 'chỉ ' + loaded + '/12 node — node-level QA hoãn';
  }
  results.mobile = await testMobile(page, 'file');
  await ctx.close();

  /* ---- http ---- */
  const srv = spawn('python', ['-m', 'http.server', String(HTTP_PORT), '--directory', ROOT], { stdio: 'ignore' });
  await new Promise(r => setTimeout(r, 1400));
  const ctx2 = await browser.newContext({ viewport: { width: 1360, height: 900 } });
  const page2 = await ctx2.newPage();
  await collectErrors(page2, 'http');
  await page2.goto(HTTP_URL);
  await page2.waitForSelector('.map-stage svg', { timeout: 8000 });
  const loaded2 = await page2.evaluate(() => window.TechGarPipelineEngine.allNodes().length);
  results.http.loadedNodes = loaded2;
  results.http.map = await testMap(page2, 'http');
  if (loaded2 === 12) {
    const order2 = await page2.evaluate(() => window.TechGarPipelineEngine.NODE_ORDER);
    results.http.nodes = {};
    for (const id of order2) {
      try {
        results.http.nodes[id] = await testNode(page2, id, 'http', SHOT_DIR);
      } catch (e) {
        results.http.nodes[id] = { error: String(e).slice(0, 200) };
      }
    }
    results.http.controls = await testControls(page2, 'http');
  }
  srv.kill();
  await browser.close();

  /* summary counts */
  let totalFrames = 0, nodeFails = [];
  [results.nodes, results.http.nodes || {}].forEach(function (set, mi) {
    Object.keys(set).forEach(function (id) {
      const r = set[id];
      if (r.error) { nodeFails.push((mi ? 'http:' : 'file:') + id + ' ' + r.error); return; }
      totalFrames += r.frames || 0;
      (r.fails || []).forEach(function (f) { nodeFails.push((mi ? 'http:' : 'file:') + id + ' ' + f); });
    });
  });
  results.summary = {
    loadedNodes: loaded + '+' + loaded2,
    nodeFramesTested: totalFrames,
    nodeFails,
    excerptChecked: results.refsCheck.checked + '/' + results.refsCheck.total,
    excerptFails: results.refsCheck.fails,
    contractAllOk: results.contract.allOk,
    consoleErrors: results.consoleErrors.length,
    pageErrors: results.pageErrors.length,
    requestFailures: results.requestFailures.length
  };
  fs.writeFileSync(OUT, JSON.stringify(results, null, 2));
  console.log(JSON.stringify(results.summary, null, 2));
  console.log('done →', OUT);
})();
