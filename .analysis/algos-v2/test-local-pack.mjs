// Owner verifier cho packs/pipeline-local.js (builder A, SPEC V2 §5).
// Chạy: cd D:/TechGar2/.analysis/algos-v2 && node test-local-pack.mjs
// Assert: registry shape, refs đối chiếu source THẬT (line-range ≡ excerpt),
// scenario build deterministic + frame invariants có nghĩa, draw() chạy trên
// mọi frame/progress với ctx stub + có nội suy animation + không mutate frame.
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const PACK = resolve('../../algo-web/packs/pipeline-local.js');
const ROOT = resolve('../..'); // D:/TechGar2
const code = readFileSync(PACK, 'utf8');

globalThis.window = {};
new Function(code)();
const nodes = globalThis.window.TechGarPipelinePacks?.local;

let pass = 0, fail = 0;
const fails = [];
function ok(c, label, extra) {
  if (c) { pass++; return; }
  fail++; fails.push(label + (extra ? ' :: ' + JSON.stringify(extra).slice(0, 140) : ''));
}
const eq = (a, b) => JSON.stringify(a) === JSON.stringify(b);

// ---- ctx stub ghi lại lệnh + args ----
function makeCtx() {
  const calls = [];
  const rec = n => (...a) => calls.push(n + JSON.stringify(a).slice(0, 80));
  return {
    calls, fillStyle: '', strokeStyle: '', lineWidth: 1, font: '', textAlign: '', textBaseline: '', globalAlpha: 1,
    save: rec('save'), restore: rec('restore'), translate: rec('translate'), scale: rec('scale'),
    beginPath: rec('beginPath'), moveTo: rec('moveTo'), lineTo: rec('lineTo'), closePath: rec('closePath'),
    rect: rec('rect'), roundRect: rec('roundRect'), arc: rec('arc'), ellipse: rec('ellipse'),
    fill: rec('fill'), stroke: rec('stroke'), clip: rec('clip'), fillRect: rec('fillRect'), strokeRect: rec('strokeRect'),
    fillText: rec('fillText'), strokeText: rec('strokeText'), measureText: () => ({ width: 42 }),
    setLineDash: rec('setLineDash')
  };
}
const ENV = { width: 800, height: 480 };

// ---- 1) registry ----
ok(Array.isArray(nodes), 'TechGarPipelinePacks.local là array');
const IDS = ['roi', 'motion', 'kalman', 'assignment', 'coasting'];
if (Array.isArray(nodes)) {
  ok(nodes.length === 5, 'đúng 5 node', nodes.length);
  IDS.forEach(id => ok(nodes.some(n => n.id === id), 'có node ' + id));
}

// ---- 2) metadata + refs đối chiếu source ----
for (const n of nodes || []) {
  ok(typeof n.title === 'string' && n.title.length > 0, n.id + ' title');
  ok(n.group === 'local', n.id + ' group=local');
  ok(typeof n.summary === 'string' && n.summary.length > 0, n.id + ' summary');
  for (const k of ['does', 'role', 'where', 'why']) {
    ok(n.answers && typeof n.answers[k] === 'string' && n.answers[k].length > 20,
      n.id + ' answers.' + k + ' đủ nội dung');
  }
  ok(Array.isArray(n.refs) && n.refs.length > 0, n.id + ' refs[]');
  for (const r of n.refs || []) {
    ok(typeof r.path === 'string' && Number.isInteger(r.line) && typeof r.symbol === 'string'
      && typeof r.excerpt === 'string' && Number.isInteger(r.excerptStart),
      n.id + ' ref ' + r.symbol + ' đủ field');
    // đối chiếu excerpt với file thật tại excerptStart
    try {
      const src = readFileSync(resolve(ROOT, r.path), 'utf8').split('\n');
      const excLines = r.excerpt.split('\n');
      const region = src.slice(r.excerptStart - 1, r.excerptStart - 1 + excLines.length)
        .map(l => l.replace(/\s+$/, '')).join('\n');
      const want = excLines.map(l => l.replace(/\s+$/, '')).join('\n');
      ok(region === want, n.id + ' ref ' + r.symbol + ' excerpt ≡ source @' + r.path + ':' + r.excerptStart,
        region === want ? undefined : { got: region.slice(0, 90), want: want.slice(0, 90) });
      ok(r.line >= r.excerptStart && r.line <= r.excerptStart + excLines.length - 1,
        n.id + ' ref ' + r.symbol + ' line nằm trong excerpt');
    } catch (e) { ok(false, n.id + ' ref ' + r.symbol + ' đọc file ' + r.path, e.message); }
  }
  ok(Array.isArray(n.pseudocode) && n.pseudocode.length >= 5 && n.pseudocode.length <= 10,
    n.id + ' pseudocode 5-10 dòng', (n.pseudocode || []).length);
  ok(Array.isArray(n.scenarios) && n.scenarios.length >= 2, n.id + ' ≥2 scenario');
  ok(typeof n.draw === 'function', n.id + ' draw fn');
}

// ---- 3) frames: invariant + determinism + JSON-safe ----
const built = new Map(); // "node/sc" -> frames
for (const n of nodes || []) {
  for (const sc of n.scenarios || []) {
    const tag = n.id + '/' + sc.id;
    let f1, f2;
    try { f1 = sc.build(); } catch (e) { ok(false, tag + ' build throw', e.message); continue; }
    try { f2 = sc.build(); } catch (e) { ok(false, tag + ' build#2 throw', e.message); f2 = null; }
    ok(Array.isArray(f1) && f1.length >= 3, tag + ' ≥3 frame có nghĩa', f1 && f1.length);
    if (f2) ok(eq(f1, f2), tag + ' build deterministic (build×2 ≡)');
    try { JSON.stringify(f1); ok(true, tag + ' frames JSON-safe'); }
    catch (e) { ok(false, tag + ' frames JSON-safe', e.message); }
    (f1 || []).forEach((f, i) => {
      ok(typeof f.title === 'string' && f.title.length > 0, tag + ' f' + i + ' title');
      ok(typeof f.explanation === 'string' && f.explanation.length > 15, tag + ' f' + i + ' explanation');
      ok(Array.isArray(f.activeLines) && f.activeLines.every(l => Number.isInteger(l) && l >= 0 && l < n.pseudocode.length),
        tag + ' f' + i + ' activeLines ⊆ pseudocode', f.activeLines);
      ok(f.state && typeof f.state === 'object' && Object.keys(f.state).length > 0, tag + ' f' + i + ' state');
      ok(typeof f.durationMs === 'number' && f.durationMs > 0, tag + ' f' + i + ' durationMs');
      ok(f.scene && typeof f.scene === 'object', tag + ' f' + i + ' scene');
    });
    built.set(tag, f1);
  }
}

// ---- 4) draw(): mọi frame × progress {0,.5,1} không throw + có lệnh vẽ + không mutate ----
for (const n of nodes || []) {
  for (const sc of n.scenarios || []) {
    const tag = n.id + '/' + sc.id;
    const frames = built.get(tag) || [];
    let interpolated = false;
    frames.forEach((f, i) => {
      const before = JSON.stringify(f);
      const callsAt = {};
      for (const p of [0, 0.5, 1]) {
        const ctx = makeCtx();
        const prev = i > 0 ? frames[i - 1] : null;
        try { n.draw(ctx, f, { ...ENV, progress: p, time: p * f.durationMs, previous: prev }); }
        catch (e) { ok(false, tag + ' f' + i + ' draw@' + p + ' throw', e.message); continue; }
        ok(ctx.calls.length > 0, tag + ' f' + i + ' draw@' + p + ' phát sinh lệnh vẽ');
        callsAt[p] = ctx.calls.join('|');
      }
      ok(JSON.stringify(f) === before, tag + ' f' + i + ' draw không mutate frame');
      if (callsAt[0] !== callsAt[1]) interpolated = true;
    });
    ok(interpolated, tag + ' ≥1 frame nội suy theo progress (animation thật, không đổi-frame-gán)');
  }
}

console.log(`\n=== pipeline-local pack test: ${pass} PASS / ${fail} FAIL ===`);
if (fails.length) { console.log(fails.slice(0, 50).join('\n')); process.exit(1); }
