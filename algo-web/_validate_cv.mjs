// Node validation — stub registerPack, assert đủ SPEC §4/§5 cho pack cv.
// Chạy: node _validate_cv.mjs
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __dir = dirname(fileURLToPath(import.meta.url));
const src = readFileSync(join(__dir, 'packs', 'cv.js'), 'utf8');

const packs = {};
globalThis.window = { TechGarAlgo: { registerPack(n, l) { packs[n] = l; } } };
eval(src);

let pass = 0, fail = 0;
const failures = [];
const ok = (cond, label, detail) => {
  if (cond) pass++;
  else { fail++; failures.push(label + (detail ? ' — ' + String(detail).slice(0, 160) : '')); }
};

// fake ctx: nhận mọi method call, giữ thuộc tính set được
function fakeCtx() {
  const store = { canvas: { width: 800, height: 500 } };
  return new Proxy(store, {
    get: (t, p) => (p in t ? t[p] : (...a) => undefined),
    set: (t, p, v) => { t[p] = v; return true; }
  });
}
const env = { width: 800, height: 500, progress: 0.5, previousFrame: null, reducedMotion: false,
  palette: { background: '#12172a', text: '#e8ecf4', muted: '#8a93a8', accent: '#4f9cf7', success: '#3fce7c', danger: '#f2555a', warning: '#f0a93c', grid: '#2a3140' } };

// JSON-compat walk: chặn function/Set/Map/undefined/Symbol trong scene/state
function jsonDeep(v, path) {
  if (v === null || v === undefined) return null;
  const t = typeof v;
  if (t === 'function' || t === 'symbol' || t === 'bigint') return path + ':' + t;
  if (t === 'number' && !isFinite(v)) return path + ':non-finite-number';
  if (t === 'object') {
    if (v instanceof Set || v instanceof Map || v instanceof WeakMap || v instanceof WeakSet) return path + ':' + v.constructor.name;
    if (Array.isArray(v)) { for (let i = 0; i < v.length; i++) { const r = jsonDeep(v[i], path + '[' + i + ']'); if (r) return r; } return null; }
    for (const k of Object.keys(v)) { const r = jsonDeep(v[k], path + '.' + k); if (r) return r; }
  }
  return null;
}
const deepEq = (a, b) => JSON.stringify(a) === JSON.stringify(b);

// ---------- 1. Pack-level ----------
const lessons = packs.cv || [];
const ids = lessons.map(l => l.id);
ok(lessons.length === 57, 'count = 57', 'got ' + lessons.length);
ok(!ids.includes('replay-session-sync'), 'F9 alias NOT registered');
const canonicalIds = [
  'mog2-foreground-mask', 'temporal-motion-gate', 'roi-strict-context-mask', 'foreground-morphology',
  'contour-geometry-filter', 'bottom-center-anchor', 'cast-shadow-discriminator', 'dark-foreground-rescue',
  'motion-echo-suppression', 'occlusion-group-guard', 'watershed-blob-partition', 'merged-blob-assignment-guard',
  'kalman-constant-velocity', 'prediction-age-decay', 'association-distance-gate', 'iou-overlap-score',
  'association-cost-matrix', 'lapjv-assignment', 'assignment-margin-ambiguity', 'stale-anchor-reacquire',
  'track-lifecycle', 'hsv-lab-descriptor', 'tracklet-gallery-match',
  'slot-roi-precompute', 'ensemble-threshold-voting', 'border-line-filter', 'core-rescue-vote', 'temporal-smoothing-dwell',
  'slot-overlap-geometry', 'slot-track-batch-match', 'arrival-claim-qualification', 'vision-primary-fusion',
  'stop-dwell-detection', 'sticky-id-bind-release', 'departure-token-lifecycle', 'predeparture-candidate-guard',
  'recovery-candidate-gates', 'recovery-batch-assignment', 'parking-episode-state',
  'world-projection-anchor', 'handoff-entry-creation', 'handoff-prediction-corridor', 'handoff-lapjv-matching',
  'overlap-simultaneous-pairing', 'global-id-allocation', 'dormant-identity-reid', 'world-trajectory-match',
  'merge-alias-resolution', 'global-identity-lifecycle',
  'homography-fit-distributed', 'rectangle-line-fit-gate', 'calibration-load-validation', 'matching-distance-derivation',
  'frame-size-adaptation', 'camera-skew-synchronization', 'latest-frame-mailbox', 'stale-evidence-health-gating'
];
canonicalIds.forEach(id => ok(ids.includes(id), 'registered: ' + id));
ok(new Set(ids).size === ids.length, 'no duplicate ids', ids.filter((x, i) => ids.indexOf(x) !== i).join(','));

// scene types đăng ký renderer — lấy TRỰC TIẾP từ registry của pack (không hardcode
// để không lệch: scene.type không có renderer thật → fail, không fallback board).
const RENDER_TYPES = new Set((lessons[0] && lessons[0].draw && lessons[0].draw.rendererTypes) || []);
ok(RENDER_TYPES.size >= 10, 'renderer registry coverage', String(RENDER_TYPES.size));

// ---------- 2. Per-lesson metadata — SPEC §4 literal ----------
const REQ_META = ['title', 'topic', 'summary', 'role', 'inputTypes', 'outputTypes', 'structures', 'complexity', 'codeRefs', 'pseudocode', 'edgeCases', 'simplifications', 'related', 'aliases', 'parameters', 'scenarios', 'buildTrace', 'draw'];
const shaped = (arr, keys) => Array.isArray(arr) && arr.length > 0 && arr.every(e => e && typeof e === 'object' && keys.every(k => typeof e[k] === 'string' && e[k].length > 0));
lessons.forEach(l => {
  REQ_META.forEach(f => ok(l[f] !== undefined, l.id + '.' + f));
  ok(typeof l.title === 'string' && l.title.length > 3, l.id + ' title');
  ok(typeof l.topic === 'string' && l.topic.length > 3, l.id + ' topic');
  ok(typeof l.summary === 'string' && l.summary.length > 10, l.id + ' summary VN', l.summary && l.summary.slice(0, 60));
  ok(typeof l.role === 'string' && l.role.length > 10, l.id + ' role VN');
  ok(shaped(l.inputTypes, ['name', 'type', 'description']), l.id + ' inputTypes {name,type,description}', JSON.stringify((l.inputTypes || [])[0]));
  ok(shaped(l.outputTypes, ['name', 'type', 'description']), l.id + ' outputTypes {name,type,description}');
  ok(shaped(l.structures, ['name', 'type', 'description']), l.id + ' structures {name,type,description}');
  ok(l.complexity && ['time', 'space', 'variables', 'simulation'].every(k => typeof l.complexity[k] === 'string'), l.id + ' complexity {time,space,variables,simulation}');
  ok(Array.isArray(l.pseudocode) && l.pseudocode.length > 0 && l.pseudocode.every(p => typeof p.id === 'string' && typeof p.text === 'string'), l.id + ' pseudocode {id,text}');
  ok(Array.isArray(l.codeRefs) && l.codeRefs.length > 0 && l.codeRefs.every(r => typeof r.path === 'string' && r.path.indexOf('/') > 0 && Number.isInteger(r.line) && r.line >= 1), l.id + ' codeRefs {path:line}');
  ok(Array.isArray(l.edgeCases) && l.edgeCases.every(e => typeof e.title === 'string' && typeof e.description === 'string'), l.id + ' edgeCases {title,description}');
  ok(Array.isArray(l.simplifications) && l.simplifications.every(s => typeof s.sourceBehavior === 'string' && typeof s.demoBehavior === 'string' && typeof s.reason === 'string'), l.id + ' simplifications {sourceBehavior,demoBehavior,reason}');
  ok(Array.isArray(l.related), l.id + ' related array');
  ok(Array.isArray(l.aliases), l.id + ' aliases array');
  ok(l.scenarios.length >= 2, l.id + ' ≥2 scenarios', String(l.scenarios.length));
  ok(l.scenarios.some(s => s.id === 'normal' && s.edgeCase === false), l.id + ' normal scenario edgeCase=false');
  ok(l.scenarios.some(s => s.edgeCase === true), l.id + ' edge scenario edgeCase=true');
  l.scenarios.forEach(s => {
    ok(typeof s.title === 'string' && s.title.length > 2, l.id + '/' + s.id + ' scenario.title');
    ok(typeof s.description === 'string' && s.description.length > 2, l.id + '/' + s.id + ' scenario.description');
    ok(typeof s.edgeCase === 'boolean', l.id + '/' + s.id + ' edgeCase boolean', String(s.edgeCase));
    ok(s.input !== undefined, l.id + '/' + s.id + ' input');
    ok(jsonDeep(s.input, 'in') === null, l.id + '/' + s.id + ' input JSON-compat', jsonDeep(s.input, 'in'));
    if (s.expected !== undefined) ok(jsonDeep(s.expected, 'exp') === null, l.id + '/' + s.id + ' expected JSON-compat', jsonDeep(s.expected, 'exp'));
  });
  (l.parameters || []).forEach(p => {
    ok(typeof p.key === 'string' && typeof p.label === 'string' && ['number', 'boolean', 'select'].indexOf(p.type) >= 0 && p.default !== undefined, l.id + ' param ' + p.key + ' {key,label,type,default}');
  });
});

// ---------- 3. Trace contract per scenario ----------
lessons.forEach(l => {
  const pseudoIds = new Set(l.pseudocode.map(p => p.id));
  l.scenarios.forEach(sc => {
    let tr;
    try { tr = l.buildTrace(sc.id, {}); }
    catch (e) { ok(false, l.id + '/' + sc.id + ' buildTrace threw', e.message); return; }
    const tag = l.id + '/' + sc.id;
    // 4 fields bắt buộc
    ['frames', 'result', 'expected', 'checks'].forEach(f => ok(tr[f] !== undefined, tag + ' trace.' + f));
    ok(Array.isArray(tr.frames), tag + ' frames array');
    ok(jsonDeep(tr.result, 'res') === null, tag + ' result JSON-compat', jsonDeep(tr.result, 'res'));
    ok(jsonDeep(tr.expected, 'texp') === null, tag + ' trace.expected JSON-compat', jsonDeep(tr.expected, 'texp'));
    // expected deep-equal scenario.expected ở default params
    if (sc.expected !== undefined) ok(deepEq(tr.expected, sc.expected), tag + ' expected == scenario.expected', JSON.stringify(tr.expected).slice(0, 120));
    // checks: pass tính thật, không hardcode
    ok(Array.isArray(tr.checks) && tr.checks.length > 0, tag + ' checks non-empty');
    const bad = (tr.checks || []).filter(c => c.pass !== true);
    ok(bad.length === 0, tag + ' all checks pass', bad.map(c => c.label + ':' + JSON.stringify(c.actual) + '≠' + JSON.stringify(c.expected)).join(';').slice(0, 120));
    ok((tr.checks || []).every(c => c.label !== undefined && 'actual' in c && 'expected' in c), tag + ' checks shape {label,actual,expected}');
    // checks phải so result↔fixture THẬT: mỗi key expected của scenario phải có
    // check tương ứng (actual = result[k], expected = fixture[k]) — chặn tautology.
    if (sc.expected !== undefined && typeof sc.expected === 'object' && sc.expected !== null) {
      Object.keys(sc.expected).forEach(k => {
        const c = (tr.checks || []).find(c => deepEq(c.expected, sc.expected[k]));
        ok(!!c && deepEq(c.actual, tr.result[k]), tag + ' check[' + k + '] so result với fixture', c ? 'actual=' + JSON.stringify(c.actual).slice(0, 80) : 'không có check nào expected=' + JSON.stringify(sc.expected[k]).slice(0, 80));
      });
    }
    // frames
    ok(tr.frames.length >= 3, tag + ' ≥3 frames', String(tr.frames.length));
    const fids = new Set();
    tr.frames.forEach((f, i) => {
      const ft = tag + '.f' + i;
      ok(typeof f.id === 'string' && !fids.has(f.id), ft + ' unique id');
      fids.add(f.id);
      ok(Array.isArray(f.activeLines) && f.activeLines.length >= 1, ft + ' activeLines ≥1');
      ok(f.activeLines.every(a => pseudoIds.has(a)), ft + ' activeLines ⊆ pseudocode', f.activeLines.join(','));
      ok(typeof f.explanation === 'string' && f.explanation.length > 10, ft + ' explanation');
      ok(jsonDeep(f.state, 'st') === null, ft + ' state JSON-compat', jsonDeep(f.state, 'st'));
      ok(f.state && typeof f.state === 'object' && Object.keys(f.state).length >= 1, ft + ' state có dữ liệu thật (không rỗng)');
      ok(Array.isArray(f.metrics), ft + ' metrics array');
      ok(f.metrics.length >= 1, ft + ' metrics ≥1 (giá trị bước đang tính)');
      ok(f.scene && typeof f.scene === 'object', ft + ' scene object');
      const sj = jsonDeep(f.scene, 'sc');
      ok(sj === null, ft + ' scene JSON-compat', sj);
      ok(RENDER_TYPES.has(f.scene.type), ft + ' scene.type có renderer', f.scene.type);
      ok(typeof f.durationMs === 'number' && f.durationMs > 0, ft + ' durationMs');
    });
    // draw() an toàn mọi frame — bắt lỗi renderer thiếu/shape sai
    tr.frames.forEach((f, i) => {
      try { l.draw(fakeCtx(), f, { ...env, progress: 0.5, previousFrame: i > 0 ? tr.frames[i - 1] : null }); ok(true, tag + '.f' + i + ' draw'); }
      catch (e) { ok(false, tag + '.f' + i + ' draw threw', e.message); }
    });
  });
});

// ---------- 4. Param-change contract — MỌI param trên MỌI scenario ----------
lessons.filter(l => (l.parameters || []).length > 0).forEach(l => {
  l.parameters.forEach(p => {
    l.scenarios.forEach(sc => {
      let tr;
      try { tr = l.buildTrace(sc.id, { [p.key]: p.min }); }
      catch (e) { ok(false, l.id + '/' + sc.id + ' param ' + p.key + ' threw', e.message); return; }
      const tag = l.id + '/' + sc.id + ' @' + p.key + '=' + p.min;
      ok(tr.expected !== undefined, tag + ' expected defined');
      ok(jsonDeep(tr.expected, 'pexp') === null, tag + ' expected JSON-compat', jsonDeep(tr.expected, 'pexp'));
      // expected phải là tham chiếu/invariant — KHÔNG clone result
      ok(!deepEq(tr.expected, tr.result), tag + ' expected ≠ result clone');
      ok(Array.isArray(tr.checks) && tr.checks.length > 0 && tr.checks.every(c => 'actual' in c), tag + ' checks có actual');
    });
  });
});

// ---------- 4.5 Invariant audit — peer-review A §3.3 (16 findings) ----------
// a) Source-level: không còn literal `pass: true` / `pass: 1` / `pass: !0`
//    trong toàn pack (invariant phải là biểu thức tính từ result/state).
const hardLit = (src.match(/pass\s*:\s*true\b/g) || []).length
  + (src.match(/pass\s*:\s*1(?![\d.])/g) || []).length
  + (src.match(/pass\s*:\s*!0\b/g) || []).length;
ok(hardLit === 0, 'inv-audit: 0 literal pass:true/pass:1 trong source', String(hardLit));
// b) Runtime: 16 lesson review A liệt kê — với param đổi (nếu có), checks phải
//    là invariant computed (boolean pass + actual định nghĩa, không rỗng).
const INV16 = ['ensemble-threshold-voting', 'kalman-constant-velocity', 'prediction-age-decay',
  'track-lifecycle', 'slot-roi-precompute', 'border-line-filter', 'temporal-smoothing-dwell',
  'slot-track-batch-match', 'vision-primary-fusion', 'stop-dwell-detection', 'sticky-id-bind-release',
  'predeparture-candidate-guard', 'parking-episode-state', 'overlap-simultaneous-pairing',
  'latest-frame-mailbox', 'stale-evidence-health-gating'];
INV16.forEach(id => {
  const l = lessons.find(x => x.id === id);
  ok(!!l, 'inv16 registered: ' + id);
  if (!l) return;
  const p = (l.parameters || [])[0];
  const pv = p ? (p.min !== p.default ? p.min : p.max) : undefined;
  if (!p) { ok(true, 'inv16 ' + id + ' (param-less — covered by source scan)'); return; }
  l.scenarios.forEach(sc => {
    let tr;
    try { tr = l.buildTrace(sc.id, { [p.key]: pv }); }
    catch (e) { ok(false, 'inv16 ' + id + '/' + sc.id + ' threw', e.message); return; }
    ok(tr.checks.length >= 1 && tr.checks.every(c => typeof c.pass === 'boolean' && c.actual !== undefined),
      'inv16 ' + id + '/' + sc.id + ' invariants computed {pass:boolean, actual}',
      JSON.stringify((tr.checks || [])[0]).slice(0, 100));
  });
});

// ---------- 4.6 Domain sweep (A §3.7) — mọi giá trị param hợp lệ: 0 throw, ----------
// ---------- mọi invariant computed pass. Invariant chỉ đúng công thức khi giữ    ----------
// ---------- trên toàn miền param (≠ fixture-equality checks chỉ áp ở default).   ----------
const PROBES = { // giá trị ngoài step-grid nhưng vẫn callable — phải normalize/validate, không throw
  'foreground-morphology': { close_k: [2, 4] },        // §3.7a — kernel chẵn → normalize lẻ
  'contour-geometry-filter': { min_ratio: [0.01] },    // §3.7b — OR formula biên
  'overlap-simultaneous-pairing': { radius: [2, 2.5, 3, 3.5] } // §3.7c — premise gated
};
let swept = 0, invChecked = 0;
lessons.filter(l => (l.parameters || []).length).forEach(l => {
  l.parameters.forEach(p => {
    const vals = [];
    if (typeof p.default === 'boolean') { vals.push(p.default, !p.default); }
    else if (Array.isArray(p.options) && p.options.length) { p.options.forEach(o => vals.push(o)); }
    else if (p.min !== undefined) {
      const step = p.step || 1;
      for (let v = p.min, n = 0; v <= p.max + 1e-9 && n < 12; v += step, n++) vals.push(+v.toFixed(6));
      if (vals.indexOf(p.max) < 0) vals.push(p.max);
    }
    ((PROBES[l.id] || {})[p.key] || []).forEach(v => { if (vals.indexOf(v) < 0) vals.push(v); });
    vals.forEach(v => l.scenarios.forEach(sc => {
      swept++;
      const tag = 'sweep ' + l.id + '/' + sc.id + ' @' + p.key + '=' + JSON.stringify(v);
      let tr;
      try { tr = l.buildTrace(sc.id, { [p.key]: v }); }
      catch (e) { ok(false, tag + ' THREW', e.message); return; }
      ok(tr.frames.length >= 3, tag + ' ≥3 frames', String(tr.frames.length));
      ok(jsonDeep(tr.result, 'r') === null, tag + ' result JSON', jsonDeep(tr.result, 'r'));
      (tr.checks || []).forEach(c => {
        invChecked++;
        ok(typeof c.pass === 'boolean' && c.actual !== undefined, tag + ' check shape', JSON.stringify(c).slice(0, 90));
        ok(c.pass === true, tag + ' invariant giữ trên miền: ' + c.label, 'actual=' + JSON.stringify(c.actual).slice(0, 120));
      });
    }));
  });
});
console.log('domain sweep: ' + swept + ' runs · ' + invChecked + ' invariant-checks');

// ---------- 5. Numeric spot-checks vs dossier fixtures ----------
const num = (id, scId, path, want, tol) => {
  const tr = lessons.find(l => l.id === id).buildTrace(scId, {});
  let val = tr.result;
  path.split('.').forEach(k => { val = val ? val[k] : undefined; });
  const passNum = tol !== undefined
    ? (typeof val === 'number' && Math.abs(val - want) <= tol)
    : deepEq(val, want);
  ok(passNum, 'num ' + id + ' ' + path + '=' + JSON.stringify(want), 'got ' + JSON.stringify(val));
};

num('iou-overlap-score', 'normal', 'iou', 0.3333, 1e-3);
num('association-cost-matrix', 'normal', 'cost', 0.3669, 1e-3);
num('lapjv-assignment', 'normal', 'total', 0.9, 1e-9);
num('slot-overlap-geometry', 'normal', 'score', 0.862, 1e-2);
num('tracklet-gallery-match', 'normal', 'distance', 0.1553, 1e-3);
num('hsv-lab-descriptor', 'normal', 'd', 0.366, 1e-2);
num('departure-token-lifecycle', 'normal', 'radius', [5, 25, 45, 45]);
num('stale-anchor-reacquire', 'normal', 'cost', 0.2809, 1e-3);
num('world-projection-anchor', 'normal', 'world', [20, 30]);
num('camera-skew-synchronization', 'normal', 'reads', 2, 0);
num('handoff-entry-creation', 'normal', 't_edge', 1.25, 0.01);
num('matching-distance-derivation', 'normal', 'median', 500, 0);
num('frame-size-adaptation', 'normal', 'adapted_H', [[4, 0, 10], [0, 4, 20], [0, 0, 1]]);

console.log('\n=== CV pack validation ===');
console.log('lessons: ' + lessons.length + ' | scenarios: ' + lessons.reduce((n, l) => n + l.scenarios.length, 0) + ' | frames: ' + lessons.reduce((n, l) => n + l.scenarios.reduce((m, s) => m + l.buildTrace(s.id, {}).frames.length, 0), 0));
console.log('PASS ' + pass + ' / ' + (pass + fail));
if (failures.length) {
  console.log('FAILURES (' + fail + '):');
  [...new Set(failures)].slice(0, 60).forEach(f => console.log('  ✗ ' + f));
  process.exit(1);
}
console.log('All checks pass.');
