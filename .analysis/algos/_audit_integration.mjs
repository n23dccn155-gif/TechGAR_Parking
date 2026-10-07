// Audit độc lập pack integration.js (builder C) — reviewer B, read-only.
// Chạy: node .analysis/algos/_audit_integration.mjs  (cwd độc lập — resolve qua __dir)
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __dir = dirname(fileURLToPath(import.meta.url));
const src = readFileSync(join(__dir, '..', '..', 'algo-web', 'packs', 'integration.js'), 'utf8');

const packs = {};
globalThis.window = { TechGarAlgo: { registerPack(n, l) { packs[n] = l; } } };
try { eval(src); } catch (e) { console.log('EVAL THREW: ' + e.message); process.exit(2); }

let pass = 0, fail = 0;
const failures = [];
const ok = (c, label, detail) => { if (c) pass++; else { fail++; failures.push(label + (detail ? ' — ' + String(detail).slice(0, 200) : '')); } };

function fakeCtx() {
  const store = { canvas: { width: 800, height: 500 } };
  return new Proxy(store, { get: (t, p) => (p in t ? t[p] : (...a) => undefined), set: (t, p, v) => { t[p] = v; return true; } });
}
const env = { width: 800, height: 500, progress: 0.5, previousFrame: null, reducedMotion: false,
  palette: { background: '#12172a', text: '#e8ecf4', muted: '#8a93a8', accent: '#4f9cf7', success: '#3fce7c', danger: '#f2555a', warning: '#f0a93c', grid: '#2a3140' } };

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

const lessons = packs.integration || [];
const ids = lessons.map(l => l.id);
console.log('registered: ' + lessons.length + ' lessons');
console.log('ids: ' + ids.join(', '));

const EXPECTED23 = ['snapshot-v2-build', 'camera-age-online-derivation', 'live-freshness-contract',
  'source-mode-live-gating', 'frame-cursor-monotonic-poll', 'segment-intersection-orientation',
  'directed-crossing-direction', 'observation-continuity-window', 'entry-session-creation',
  'measured-path-entry-rescue', 'exit-crossing-session-delete', 'session-state-machine',
  'qr-token-issuance-ttl', 'revision-optimistic-concurrency', 'spot-reservation-availability',
  'live-observation-cache', 'atomic-session-store', 'parking-episode-apply', 'parked-evidence-dwell-legacy',
  'identity-alias-remap-backend', 'canonical-runtime-id-consumer', 'replay-timestamp-pairing',
  'gate-config-validate-save'];
ok(lessons.length === 23, 'count = 23', String(lessons.length));
EXPECTED23.forEach(id => ok(ids.includes(id), 'registered: ' + id));
ok(new Set(ids).size === ids.length, 'no dup ids');

// renderer registry nếu pack expose (kiểu drawScene.rendererTypes)
const RENDER_TYPES = new Set((lessons[0] && lessons[0].draw && lessons[0].draw.rendererTypes) || []);
console.log('rendererTypes exposed: ' + (RENDER_TYPES.size ? [...RENDER_TYPES].join(',') : '(không expose — chỉ kiểm draw không throw)'));

// ---------- metadata SPEC §4 ----------
const REQ = ['id', 'title', 'topic', 'summary', 'role', 'inputTypes', 'outputTypes', 'structures',
  'complexity', 'codeRefs', 'pseudocode', 'edgeCases', 'simplifications', 'related', 'aliases',
  'parameters', 'scenarios', 'buildTrace', 'draw'];
const shaped = (a, ks) => Array.isArray(a) && a.length > 0 && a.every(e => e && typeof e === 'object' && ks.every(k => typeof e[k] === 'string' && e[k].length > 0));
lessons.forEach(l => {
  REQ.forEach(f => ok(l[f] !== undefined, l.id + '.' + f));
  ok(shaped(l.inputTypes, ['name', 'type', 'description']), l.id + ' inputTypes');
  ok(shaped(l.outputTypes, ['name', 'type', 'description']), l.id + ' outputTypes');
  ok(shaped(l.structures, ['name', 'type', 'description']), l.id + ' structures');
  ok(l.complexity && ['time', 'space', 'variables', 'simulation'].every(k => typeof l.complexity[k] === 'string'), l.id + ' complexity 4 keys');
  ok(Array.isArray(l.pseudocode) && l.pseudocode.every(p => typeof p.id === 'string' && typeof p.text === 'string'), l.id + ' pseudocode {id,text}');
  ok(Array.isArray(l.codeRefs) && l.codeRefs.length > 0 && l.codeRefs.every(r => typeof r.path === 'string' && Number.isInteger(r.line) && r.line >= 1), l.id + ' codeRefs');
  ok(Array.isArray(l.edgeCases) && l.edgeCases.every(e => typeof e.title === 'string' && typeof e.description === 'string'), l.id + ' edgeCases');
  ok(Array.isArray(l.simplifications) && l.simplifications.every(s => typeof s.sourceBehavior === 'string' && typeof s.demoBehavior === 'string' && typeof s.reason === 'string'), l.id + ' simplifications');
  l.scenarios.forEach(s => {
    ok(typeof s.edgeCase === 'boolean', l.id + '/' + s.id + ' edgeCase bool');
    ok(s.input !== undefined && jsonDeep(s.input, 'in') === null, l.id + '/' + s.id + ' input JSON');
    if (s.expected !== undefined) ok(jsonDeep(s.expected, 'e') === null, l.id + '/' + s.id + ' expected JSON', jsonDeep(s.expected, 'e'));
  });
});

// ---------- trace contract ----------
const hardLit = (src.match(/pass\s*:\s*true\b/g) || []).length;
ok(hardLit === 0, 'no literal pass:true in source', String(hardLit));
const stats = { frames: 0, emptyState: 0, noMetrics: 0, short3: [], drawThrow: [], noRenderer: [] };
lessons.forEach(l => {
  const pseudo = new Set(l.pseudocode.map(p => p.id));
  l.scenarios.forEach(sc => {
    const tag = l.id + '/' + sc.id;
    const dparams = {};
    (l.parameters || []).forEach(d => { dparams[d.key] = d.default; });
    if (sc.defaultParams) Object.assign(dparams, sc.defaultParams);
    let tr;
    try { tr = l.buildTrace(sc.id, dparams); } catch (e) { ok(false, tag + ' buildTrace threw', e.message); return; }
    ['frames', 'result', 'expected', 'checks'].forEach(f => ok(tr[f] !== undefined, tag + ' trace.' + f));
    ok(jsonDeep(tr.result, 'r') === null, tag + ' result JSON', jsonDeep(tr.result, 'r'));
    ok(jsonDeep(tr.expected, 'te') === null, tag + ' expected JSON', jsonDeep(tr.expected, 'te'));
    if (sc.expected !== undefined) ok(deepEq(tr.expected, sc.expected), tag + ' expected≡scenario.expected', JSON.stringify(tr.expected).slice(0, 100));
    ok(Array.isArray(tr.checks) && tr.checks.length > 0, tag + ' checks non-empty');
    const bad = (tr.checks || []).filter(c => c.pass !== true);
    ok(bad.length === 0, tag + ' checks all pass @default', bad.map(c => c.label + ' actual=' + JSON.stringify(c.actual)).join(';').slice(0, 140));
    if (sc.expected !== undefined && typeof sc.expected === 'object' && sc.expected !== null) {
      Object.keys(sc.expected).forEach(k => {
        const c = (tr.checks || []).find(c => deepEq(c.expected, sc.expected[k]));
        ok(!!c && deepEq(c.actual, tr.result[k]), tag + ' check[' + k + '] actual=result expected=fixture');
      });
    }
    if (tr.frames.length < 3) stats.short3.push(tag + ':' + tr.frames.length);
    ok(tr.frames.length >= 3, tag + ' ≥3 frames', String(tr.frames.length));
    const fids = new Set();
    tr.frames.forEach((f, i) => {
      const ft = tag + '.f' + i;
      stats.frames++;
      ok(typeof f.id === 'string' && !fids.has(f.id), ft + ' unique frame id', String(f.id));
      fids.add(f.id);
      ok(Array.isArray(f.activeLines) && f.activeLines.length >= 1 && f.activeLines.every(a => pseudo.has(a)), ft + ' activeLines ⊆ pseudocode', JSON.stringify(f.activeLines));
      ok(typeof f.explanation === 'string' && f.explanation.length > 10, ft + ' explanation VN');
      ok(f.state && typeof f.state === 'object' && Object.keys(f.state).length >= 1, ft + ' state non-empty');
      if (!(f.state && Object.keys(f.state).length >= 1)) stats.emptyState++;
      ok(Array.isArray(f.metrics) && f.metrics.length >= 1, ft + ' metrics ≥1');
      if (!Array.isArray(f.metrics) || f.metrics.length < 1) stats.noMetrics++;
      ok(jsonDeep(f.state, 's') === null && jsonDeep(f.scene, 'sc') === null, ft + ' state/scene JSON', jsonDeep(f.state, 's') || jsonDeep(f.scene, 'sc'));
      // SPEC §5: scene shape pack-defined — chỉ yêu cầu object JSON + draw không throw
      ok(f.scene && typeof f.scene === 'object', ft + ' scene object');
      try { l.draw(fakeCtx(), f, { ...env, previousFrame: i > 0 ? tr.frames[i - 1] : null }); }
      catch (e) { ok(false, ft + ' draw threw', e.message); stats.drawThrow.push(ft); }
    });
  });
});

// ---------- params changed: min/max/options/boolean flips → frames ≥3 + checks shape ----------
let paramRuns = 0, paramFail = 0;
const dparamsOf = (l, sc) => {
  const p = {};
  (l.parameters || []).forEach(d => { p[d.key] = d.default; });
  if (sc.defaultParams) Object.assign(p, sc.defaultParams);
  return p;
};
lessons.filter(l => (l.parameters || []).length > 0).forEach(l => {
  l.parameters.forEach(p => {
    const alts = [];
    if (p.options && p.options.length) p.options.forEach(o => { if (o !== p.default) alts.push(o); });
    else if (typeof p.default === 'boolean') alts.push(!p.default);
    else { if (p.min !== undefined && p.min !== p.default) alts.push(p.min); if (p.max !== undefined && p.max !== p.default) alts.push(p.max); }
    l.scenarios.forEach(sc => {
      alts.forEach(a => {
        paramRuns++;
        const tag = l.id + '/' + sc.id + ' @' + p.key + '=' + JSON.stringify(a);
        let tr;
        try { tr = l.buildTrace(sc.id, { ...dparamsOf(l, sc), [p.key]: a }); }
        catch (e) { paramFail++; ok(false, tag + ' threw', e.message); return; }
        ok(tr.frames.length >= 3, tag + ' ≥3 frames', String(tr.frames.length));
        if (!(tr.checks || []).every(c => 'actual' in c && typeof c.pass === 'boolean')) { paramFail++; ok(false, tag + ' checks thiếu actual/pass boolean'); }
      });
    });
  });
});
console.log('param runs: ' + paramRuns + ' | invariant-shape fails: ' + paramFail);

console.log('\nSTATS: frames=' + stats.frames + ' emptyState=' + stats.emptyState + ' noMetrics=' + stats.noMetrics + ' <3frames=' + stats.short3.join(',') + ' drawThrow=' + stats.drawThrow.join(',') + ' sceneNoType=' + stats.noRenderer.join(','));
console.log('PASS ' + pass + ' / ' + (pass + fail));
if (failures.length) { console.log('FAILURES:'); [...new Set(failures)].slice(0, 80).forEach(f => console.log('  ✗ ' + f)); }
