// Test harness cho algo-web/packs/frontend.js — Node, không browser.
// Chạy: cd D:/TechGar2/.analysis/algos && node test-frontend-pack.mjs
// Stub window.TechGarAlgo.registerPack + CanvasRenderingContext2D tối thiểu.
// Contract theo SPEC §4-§5 + qa/smoke.js của C:
//   - trace.expected deep-equal scenario.expected ở params mặc định (mọi scenario)
//   - ≥3 frame có nghĩa / scenario; frames JSON-safe; activeLines ⊆ pseudocode ids
//   - param select: options không rỗng, default ∈ options
//   - params đổi → trace đổi + expected tham chiếu độc lập (checks vẫn xanh)
//   - draw(ctx) chạy được trên MỌI frame của MỌI scenario
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const PACK_PATH = resolve('../../algo-web/packs/frontend.js');
const code = readFileSync(PACK_PATH, 'utf8');

// --- stub window ---
const registered = {};
globalThis.window = {
  TechGarAlgo: {
    registerPack: (id, lessons) => { registered[id] = lessons; }
  }
};
new Function(code)();
const lessons = registered.frontend;

// --- ctx stub ---
function makeCtx() {
  const calls = [];
  const rec = (name) => (...a) => { calls.push(name); };
  const ctx = {
    calls,
    fillStyle: '', strokeStyle: '', lineWidth: 1, font: '', textAlign: '', textBaseline: '',
    fillText: rec('fillText'), strokeText: rec('strokeText'),
    fillRect: rec('fillRect'), strokeRect: rec('strokeRect'), clearRect: rec('clearRect'),
    beginPath: rec('beginPath'), moveTo: rec('moveTo'), lineTo: rec('lineTo'),
    arc: rec('arc'), stroke: rec('stroke'), fill: rec('fill'), closePath: rec('closePath'),
    setLineDash: rec('setLineDash'), save: rec('save'), restore: rec('restore'),
    translate: rec('translate'), rotate: rec('rotate'), scale: rec('scale'),
    measureText: () => ({ width: 10 })
  };
  return ctx;
}
const ENV = { width: 800, height: 480, palette: { background: '#12172a', accent: '#4f9cf7', text: '#e8ecf4', muted: '#8a93a8', grid: '#2a3248', success: '#3fce7c', warning: '#f0a93c', danger: '#f2555a' } };

// --- assertions ---
let pass = 0, fail = 0;
const fails = [];
function ok(cond, label, extra) {
  if (cond) { pass++; return true; }
  fail++; fails.push(label + (extra ? ' :: ' + JSON.stringify(extra).slice(0, 160) : ''));
  return false;
}
function eqJson(a, b) { return JSON.stringify(a) === JSON.stringify(b); }
// deep-equal 2 chiều (đúng logic qa/smoke.js của C)
function deepEq(a, b) {
  if (a === b) return true;
  if (typeof a !== 'object' || typeof b !== 'object' || a === null || b === null) return a === b;
  const ka = Object.keys(a), kb = Object.keys(b);
  if (ka.length !== kb.length) return false;
  return ka.every(k => deepEq(a[k], b[k]));
}

// 1) pack đăng ký + đúng 37 ID canonical
const CANONICAL = ('lane-graph-build|adjacency-directed-expand|astar-find-route|spot-route-wrappers|drivable-edge-project|pos-route-wrappers|route-edge-validator|gate-node-mutate|spot-rank-score|recommendation-promote|point-segment-dist|off-route-detect|turn-instruction|voice-speak-throttle|session-commit-guard|session-action-serialize|session-refresh-dedupe|action-id-gen|completion-key-build|occupancy-classify|spot-event-reducer|affine-fit-transform|world-svg-project|vehicle-svg-project|route-polyline-simplify|route-arrow-place|viewbox-pan-zoom|parking-geometry-gen|spot-ownership-map|parking-counts-derive|driver-flow-machine|nav-goal-resolve|invalid-spot-recovery|parked-marker-fallback|gate-line-derive|parking-decision-resolve|mock-scenario-emitter').split('|');
const ALIASES = ['live-runtime-validator', 'frame-cursor-guard', 'runtime-request-coalesce', 'qr-visibility-window', 'canonical-gid-chain', 'live-freshness-contract', 'frame-cursor-monotonic-poll', 'qr-token-issuance-ttl', 'canonical-runtime-id-consumer', 'replay-session-sync'];

ok(Array.isArray(lessons), 'registerPack trả array');
ok(lessons.length === 37, 'đúng 37 lesson', lessons.length);
const ids = lessons.map(l => l.id);
ok(new Set(ids).size === ids.length, 'không trùng id');
CANONICAL.forEach(id => ok(ids.includes(id), 'có canonical ' + id));
ALIASES.forEach(a => ok(!ids.includes(a), 'không có alias ' + a));

// 2) metadata shape theo SPEC §4
const REQ_STR = ['title', 'topic', 'summary', 'role'];
const REQ_ARR = ['inputTypes', 'outputTypes', 'structures', 'codeRefs', 'pseudocode', 'edgeCases', 'simplifications', 'related', 'parameters', 'scenarios'];
for (const L of lessons) {
  ok(L.pack === 'frontend', L.id + ' pack=frontend');
  REQ_STR.forEach(k => ok(typeof L[k] === 'string' && L[k].length > 0, L.id + ' metadata.' + k));
  REQ_ARR.forEach(k => ok(Array.isArray(L[k]), L.id + ' metadata.' + k + ' là array'));
  ok(typeof L.buildTrace === 'function', L.id + ' buildTrace fn');
  ok(typeof L.draw === 'function', L.id + ' draw fn');
  ok(L.codeRefs.length > 0 && L.codeRefs.every(r => /^frontend\/src\//.test(r.path) && Number.isInteger(r.line)), L.id + ' codeRefs path:dòng hợp lệ');
  ok(L.pseudocode.length > 0 && L.pseudocode.every(s => s.id && s.text), L.id + ' pseudocode {id,text}');
  const sids = L.scenarios.map(s => s.id);
  ok(sids.includes('default'), L.id + ' có scenario default');
  ok(L.scenarios.some(s => s.edgeCase === true), L.id + ' có scenario edgeCase:true');
  ok(L.scenarios.every(s => typeof s.edgeCase === 'boolean'), L.id + ' edgeCase:boolean');
  ok(L.scenarios.every(s => s.expected !== undefined), L.id + ' mọi scenario có expected');
  // param contract: select có options không rỗng + default ∈ options + label tiếng Việt
  L.parameters.forEach(pr => {
    ok(pr.key && pr.label && pr.type, L.id + ' param ' + pr.key + ' đủ key/label/type');
    if (pr.type === 'select') {
      ok(Array.isArray(pr.options) && pr.options.length > 0, L.id + ' param select ' + pr.key + ' options không rỗng');
      ok(pr.options.some(o => o.value === pr.default), L.id + ' param select ' + pr.key + ' default ∈ options');
      ok(pr.options.every(o => o.label !== undefined), L.id + ' param select ' + pr.key + ' options có label');
    }
    if (pr.type === 'number') ok(typeof pr.default === 'number', L.id + ' param number ' + pr.key + ' default số');
    if (pr.type === 'boolean') ok(typeof pr.default === 'boolean', L.id + ' param bool ' + pr.key + ' default boolean');
  });
}

// 3) chạy MỌI scenario: contract đầy đủ SPEC §4 — CẢ {} và explicit parameters[].default
for (const L of lessons) {
  const pids = new Set(L.pseudocode.map(p => p.id));
  const defsObj = {};
  (L.parameters || []).forEach(pr => { defsObj[pr.key] = pr.default; });
  for (const sc of L.scenarios) {
    let tr;
    try { tr = L.buildTrace(sc.id, {}); }
    catch (e) { ok(false, L.id + '/' + sc.id + ' buildTrace throw', e.message); continue; }
    // Cách UI truyền params (explicit defaults) phải cho CÙNG kết quả với {}
    let trDef;
    try { trDef = L.buildTrace(sc.id, defsObj); }
    catch (e) { ok(false, L.id + '/' + sc.id + ' buildTrace(defaultsObj) throw', e.message); trDef = null; }
    if (trDef) {
      ok(deepEq(trDef.expected, sc.expected), L.id + '/' + sc.id + ' [defsObj] expected ≡ scenario.expected', { got: trDef.expected, want: sc.expected });
      ok(eqJson(trDef.result, tr.result), L.id + '/' + sc.id + ' [defsObj] result ≡ {} result');
      trDef.checks.forEach(c => ok(c.pass === true, L.id + '/' + sc.id + ' [defsObj] check "' + c.label + '" pass', { actual: c.actual, expected: c.expected }));
    }
    ok(tr && Array.isArray(tr.frames) && tr.frames.length > 0, L.id + '/' + sc.id + ' frames[]');
    ok(tr.frames.length >= 3, L.id + '/' + sc.id + ' ≥3 frame có nghĩa', tr.frames.length);
    try { JSON.stringify(tr.frames); ok(true, L.id + '/' + sc.id + ' frames JSON-safe'); }
    catch (e) { ok(false, L.id + '/' + sc.id + ' frames JSON-safe', e.message); }
    tr.frames.forEach((f, i) => {
      (f.activeLines || []).forEach(ln => ok(pids.has(ln), L.id + '/' + sc.id + ' frame' + i + ' activeLine ' + ln + ' ⊆ pseudocode'));
      ok(typeof f.explanation === 'string' && f.explanation.length > 0, L.id + '/' + sc.id + ' frame' + i + ' có explanation');
    });
    ok(tr && tr.result !== undefined, L.id + '/' + sc.id + ' result');
    // CONTRACT CỐT: expected deep-equal scenario.expected ở params mặc định
    ok(deepEq(tr.expected, sc.expected), L.id + '/' + sc.id + ' expected ≡ scenario.expected', { got: tr.expected, want: sc.expected });
    ok(tr && Array.isArray(tr.checks) && tr.checks.length > 0, L.id + '/' + sc.id + ' checks[]');
    tr.checks.forEach((c, i) => {
      ok(c.pass === true || c.pass === false, L.id + '/' + sc.id + ' check[' + i + '] có .pass boolean');
      ok(c.pass === true, L.id + '/' + sc.id + ' check "' + c.label + '" pass', { actual: c.actual, expected: c.expected });
    });
  }
}

// 4) MỌI giá trị hợp lệ của MỌI param trên MỌI scenario:
//    ≥3 frame + checks xanh + activeLines⊆pseudocode + expected tham chiếu độc lập
//    (chặn bug-class "return sc.expected cứng" + changed-branch <3 frame)
function legalAltValues(pr) {
  if (pr.type === 'select') return (pr.options || []).map(o => o.value !== undefined ? o.value : o).filter(v => !eqJson(v, pr.default));
  if (pr.type === 'boolean') return [!pr.default];
  if (pr.type === 'number') {
    const s = [];
    const add = v => {
      if (typeof v !== 'number' || eqJson(v, pr.default)) return;
      if (pr.min !== undefined && v < pr.min) return;
      if (pr.max !== undefined && v > pr.max) return;
      if (!s.includes(v)) s.push(v);
    };
    add(pr.min); add(pr.max); add(pr.default + (pr.step || 1));
    return s;
  }
  return [];
}
for (const L of lessons) {
  if (!L.parameters.length) continue;
  const pids = new Set(L.pseudocode.map(p => p.id));
  const baseDef = L.buildTrace('default', {});
  for (const sc of L.scenarios) {
    for (const param of L.parameters) {
      for (const alt of legalAltValues(param)) {
        const tag = L.id + '/' + sc.id + ' ' + param.key + '=' + JSON.stringify(alt);
        let changed;
        try { changed = L.buildTrace(sc.id, { [param.key]: alt }); }
        catch (e) { ok(false, tag + ' buildTrace throw', e.message); continue; }
        ok(changed.frames.length >= 3, tag + ' ≥3 frame có nghĩa', changed.frames.length);
        changed.checks.forEach(c => ok(c.pass === true, tag + ' check "' + c.label + '" pass', { actual: c.actual, expected: c.expected }));
        changed.frames.forEach((f, i) => (f.activeLines || []).forEach(ln => ok(pids.has(ln), tag + ' frame' + i + ' activeLine ' + ln + ' ⊆ pseudocode')));
        if (sc.id === 'default') {
          ok(JSON.stringify(changed.result) !== JSON.stringify(baseDef.result) || JSON.stringify(changed.frames) !== JSON.stringify(baseDef.frames),
            tag + ' đổi trace/result');
        }
        if (changed.result && changed.expected && typeof changed.result === 'object' && typeof changed.expected === 'object') {
          Object.keys(changed.expected).forEach(k => {
            if (k in changed.result) ok(eqJson(changed.result[k], changed.expected[k]),
              tag + ' expected.' + k + ' ≡ result', { got: changed.expected[k], want: changed.result[k] });
          });
        }
      }
    }
  }
  // cumulative: mọi cặp param đổi đồng thời — expected vẫn phải nhất quán + checks xanh
  for (let i = 0; i < L.parameters.length; i++) for (let j = i + 1; j < L.parameters.length; j++) {
    const pi = L.parameters[i], pj = L.parameters[j];
    const av = pr => pr.type === 'select' ? (pr.options.find(o => o.value !== pr.default) || {}).value
      : pr.type === 'boolean' ? !pr.default : (pr.min !== undefined && pr.min !== pr.default ? pr.min : pr.default + (pr.step || 1));
    const a = av(pi), b = av(pj);
    if (a === undefined || b === undefined) continue;
    let c2;
    try { c2 = L.buildTrace('default', { [pi.key]: a, [pj.key]: b }); }
    catch (e) { ok(false, L.id + ' params pair ' + pi.key + '+' + pj.key + ' throw', e.message); continue; }
    c2.checks.forEach(c => ok(c.pass === true, L.id + ' params-pair check "' + c.label + '" pass'));
    if (c2.result && c2.expected && typeof c2.result === 'object' && typeof c2.expected === 'object') {
      Object.keys(c2.expected).forEach(k => {
        if (k in c2.result) ok(eqJson(c2.result[k], c2.expected[k]),
          L.id + ' params-pair expected.' + k + ' ≡ result', { got: c2.expected[k], want: c2.result[k] });
      });
    }
  }
}

// 5) draw() với ctx stub — MỌI frame của MỌI scenario
for (const L of lessons) {
  for (const sc of L.scenarios) {
    const tr = L.buildTrace(sc.id, {});
    for (const f of tr.frames) {
      const ctx = makeCtx();
      try { L.draw(ctx, f, ENV); }
      catch (e) { ok(false, L.id + '/' + sc.id + ' draw frame ' + f.id + ' throw', e.message); continue; }
      ok(ctx.calls.length > 0, L.id + '/' + sc.id + ' frame ' + f.id + ' draw gọi canvas');
    }
  }
}

// 6) không hardcode: expected không rỗng; có ít nhất 1 scenario edge mỗi lesson có check thật
for (const L of lessons) {
  const tr = L.buildTrace('default', {});
  ok(!(typeof tr.expected === 'object' && Object.keys(tr.expected).length === 0), L.id + ' expected không rỗng');
}

console.log(`\n=== frontend pack test: ${pass} PASS / ${fail} FAIL ===`);
if (fails.length) { console.log(fails.slice(0, 60).join('\n')); process.exit(1); }
