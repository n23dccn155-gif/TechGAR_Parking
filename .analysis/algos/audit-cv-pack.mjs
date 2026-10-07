// Audit đọc-only pack cv.js của B — contract SPEC §4-5 + quality signals.
// Chạy: cd D:/TechGar2/.analysis/algos && node audit-cv-pack.mjs
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const code = readFileSync(resolve('_cv-snapshot.js'), 'utf8');
const registered = {};
globalThis.window = { TechGarAlgo: { registerPack: (id, l) => { registered[id] = l; } } };
new Function(code)();
const lessons = registered.cv;

function makeCtx() {
  const calls = [];
  const rec = (n) => () => calls.push(n);
  return { calls, fillStyle: '', strokeStyle: '', lineWidth: 1, font: '', textAlign: '', textBaseline: '',
    fillText: rec('fillText'), strokeText: rec('strokeText'), fillRect: rec('fillRect'), strokeRect: rec('strokeRect'),
    clearRect: rec('clearRect'), beginPath: rec('beginPath'), moveTo: rec('moveTo'), lineTo: rec('lineTo'),
    arc: rec('arc'), stroke: rec('stroke'), fill: rec('fill'), closePath: rec('closePath'), setLineDash: rec('setLineDash'),
    save: rec('save'), restore: rec('restore'), translate: rec('translate'), rotate: rec('rotate'), scale: rec('scale'),
    measureText: () => ({ width: 10 }), ellipse: rec('ellipse'), rect: rec('rect'), quadraticCurveTo: rec('qc') };
}
const ENV = { width: 800, height: 480, palette: { background: '#12172a', accent: '#4f9cf7', text: '#e8ecf4', muted: '#8a93a8', grid: '#2a3248', success: '#3fce7c', warning: '#f0a93c', danger: '#f2555a' } };

const CANON = ('mog2-foreground-mask|temporal-motion-gate|roi-strict-context-mask|foreground-morphology|contour-geometry-filter|bottom-center-anchor|cast-shadow-discriminator|dark-foreground-rescue|motion-echo-suppression|occlusion-group-guard|watershed-blob-partition|merged-blob-assignment-guard|kalman-constant-velocity|prediction-age-decay|association-distance-gate|iou-overlap-score|association-cost-matrix|lapjv-assignment|assignment-margin-ambiguity|stale-anchor-reacquire|track-lifecycle|hsv-lab-descriptor|tracklet-gallery-match|slot-roi-precompute|ensemble-threshold-voting|border-line-filter|core-rescue-vote|temporal-smoothing-dwell|slot-overlap-geometry|slot-track-batch-match|arrival-claim-qualification|vision-primary-fusion|stop-dwell-detection|sticky-id-bind-release|departure-token-lifecycle|predeparture-candidate-guard|recovery-candidate-gates|recovery-batch-assignment|parking-episode-state|world-projection-anchor|handoff-entry-creation|handoff-prediction-corridor|handoff-lapjv-matching|overlap-simultaneous-pairing|global-id-allocation|dormant-identity-reid|world-trajectory-match|merge-alias-resolution|global-identity-lifecycle|homography-fit-distributed|rectangle-line-fit-gate|calibration-load-validation|matching-distance-derivation|frame-size-adaptation|camera-skew-synchronization|latest-frame-mailbox|stale-evidence-health-gating').split('|');

function deepEq(a, b) {
  if (a === b) return true;
  if (typeof a !== 'object' || typeof b !== 'object' || a === null || b === null) return a === b;
  const ka = Object.keys(a), kb = Object.keys(b);
  if (ka.length !== kb.length) return false;
  return ka.every(k => deepEq(a[k], b[k]));
}

const issues = [];
const stats = { frames: 0, scenarios: 0, drawCalls: 0, stateKeys: new Set(), sceneTypes: {} };
const reqStr = ['title', 'topic', 'summary', 'role'];
const reqArr = ['inputTypes', 'outputTypes', 'structures', 'codeRefs', 'pseudocode', 'edgeCases', 'simplifications', 'related', 'parameters', 'scenarios'];

console.log('lessons:', lessons.length);
const ids = lessons.map(l => l.id);
CANON.forEach(id => { if (!ids.includes(id)) issues.push(['MISSING canonical', id]); });
ids.forEach(id => { if (!CANON.includes(id)) issues.push(['EXTRA (alias?)', id]); });
const dup = ids.filter((x, i) => ids.indexOf(x) !== i);
if (dup.length) issues.push(['DUP', dup]);

for (const L of lessons) {
  reqStr.forEach(k => { if (!(typeof L[k] === 'string' && L[k].length)) issues.push([L.id, 'metadata.' + k + ' thiếu']); });
  reqArr.forEach(k => { if (!Array.isArray(L[k])) issues.push([L.id, 'metadata.' + k + ' không array']); });
  if (L.pack !== 'cv') issues.push([L.id, 'pack≠cv: ' + L.pack]);
  if (typeof L.buildTrace !== 'function' || typeof L.draw !== 'function') issues.push([L.id, 'thiếu buildTrace/draw']);
  if (!L.codeRefs.length) issues.push([L.id, 'codeRefs rỗng']);
  L.codeRefs.forEach(r => { if (!/^backend\//.test(r.path) || !Number.isInteger(r.line)) issues.push([L.id, 'codeRef lạ: ' + r.path + ':' + r.line]); });
  const sids = L.scenarios.map(s => s.id);
  if (!sids.includes('default') && !sids.includes('normal')) issues.push([L.id, 'không có default/normal']);
  if (!L.scenarios.some(s => s.edgeCase === true)) issues.push([L.id, 'không có edgeCase:true']);
  if (!L.scenarios.every(s => typeof s.edgeCase === 'boolean')) issues.push([L.id, 'edgeCase không boolean']);
  const pids = new Set(L.pseudocode.map(p => p.id));
  L.parameters.forEach(pr => {
    if (pr.type === 'select' && (!Array.isArray(pr.options) || !pr.options.length)) issues.push([L.id, 'select ' + pr.key + ' options rỗng']);
    if (pr.type === 'select' && pr.options && !pr.options.some(o => o.value === pr.default)) issues.push([L.id, 'select ' + pr.key + ' default ∉ options']);
  });
  for (const sc of L.scenarios) {
    stats.scenarios++;
    let tr;
    try { tr = L.buildTrace(sc.id, {}); } catch (e) { issues.push([L.id + '/' + sc.id, 'buildTrace THROW: ' + e.message]); continue; }
    stats.frames += tr.frames.length;
    if (tr.frames.length < 3) issues.push([L.id + '/' + sc.id, 'frames=' + tr.frames.length + ' <3']);
    if (!deepEq(tr.expected, sc.expected)) issues.push([L.id + '/' + sc.id, 'expected≠scenario.expected', JSON.stringify(tr.expected).slice(0, 120), 'want', JSON.stringify(sc.expected).slice(0, 120)]);
    tr.checks.forEach(c => { if (c.pass !== true) issues.push([L.id + '/' + sc.id, 'check "' + c.label + '" FAIL', c.actual, 'vs', c.expected]); });
    tr.frames.forEach((f, i) => {
      (f.activeLines || []).forEach(ln => { if (!pids.has(ln)) issues.push([L.id + '/' + sc.id, 'frame' + i + ' activeLine ' + ln + ' ∉ pseudocode']); });
      if (!(typeof f.explanation === 'string' && f.explanation.length)) issues.push([L.id + '/' + sc.id, 'frame' + i + ' thiếu explanation']);
      if (!f.state || Object.keys(f.state).length === 0) issues.push([L.id + '/' + sc.id, 'frame' + i + ' state rỗng']);
      else Object.keys(f.state).forEach(k => stats.stateKeys.add(k));
      const vt = f.scene && f.scene.type;
      stats.sceneTypes[vt] = (stats.sceneTypes[vt] || 0) + 1;
      const ctx = makeCtx();
      try { L.draw(ctx, f, ENV); if (!ctx.calls.length) issues.push([L.id + '/' + sc.id, 'frame' + i + ' draw 0 calls']); }
      catch (e) { issues.push([L.id + '/' + sc.id, 'frame' + i + ' draw THROW: ' + e.message]); }
    });
  }
  // params có tác động?
  for (const pr of L.parameters) {
    const alt = pr.type === 'select' ? (pr.options.find(o => o.value !== pr.default) || {}).value
      : pr.type === 'boolean' ? !pr.default
      : (pr.min !== undefined ? pr.min : pr.default + 1);
    if (alt === undefined) continue;
    let changed;
    try { changed = L.buildTrace('default', { [pr.key]: alt }); } catch (e) { issues.push([L.id, 'params ' + pr.key + ' THROW: ' + e.message]); continue; }
    const base = L.buildTrace('default', {});
    if (JSON.stringify(changed.result) === JSON.stringify(base.result) && JSON.stringify(changed.frames) === JSON.stringify(base.frames))
      issues.push([L.id, 'param ' + pr.key + '=' + JSON.stringify(alt) + ' KHÔNG đổi trace/result (no-op?)']);
    else changed.checks.forEach(c => { if (c.pass !== true) issues.push([L.id, 'params-changed check "' + c.label + '" FAIL', c.actual, 'vs', c.expected]); });
  }
}

// Sweep param hợp lệ (trong min/max/step — như UI slider): mọi giá trị hợp lệ
// phải buildTrace không-throw và mọi check (invariants trong params-changed mode) xanh.
const eq2 = (a, b) => JSON.stringify(a) === JSON.stringify(b);
let invTotal = 0;
for (const L of lessons) {
  for (const sc of L.scenarios) {
    for (const pr of (L.parameters || [])) {
      let vals = [];
      if (pr.type === 'boolean') vals = [!pr.default];
      else if ((pr.options || []).length) vals = pr.options.map(o => o.value !== undefined ? o.value : o).filter(v => !eq2(v, pr.default)).slice(0, 4);
      else if (typeof pr.default === 'number' && pr.min !== undefined && pr.step !== undefined) {
        for (let v = pr.min; v <= pr.max && vals.length < 6; v += pr.step) if (v !== pr.default) vals.push(Math.round(v * 1000) / 1000);
      } else if (typeof pr.default === 'number') vals = [pr.default + 1];
      for (const v of vals) {
        let tr;
        try { tr = L.buildTrace(sc.id, { [pr.key]: v }); }
        catch (e) { issues.push([L.id + '/' + sc.id, 'legal-param ' + pr.key + '=' + v + ' THROW: ' + e.message.slice(0, 70)]); continue; }
        (tr.checks || []).forEach(c => { invTotal++; if (c.pass !== true) issues.push([L.id + '/' + sc.id, 'legal-param ' + pr.key + '=' + v + ' invariant "' + c.label + '" FAIL', JSON.stringify(c.actual).slice(0, 80)]); });
      }
    }
  }
}
console.log('legal-param invariant checks:', invTotal);

console.log('scenarios:', stats.scenarios, '| frames:', stats.frames, '| sceneTypes:', JSON.stringify(stats.sceneTypes));
console.log('stateKeys mẫu:', [...stats.stateKeys].slice(0, 60).join(','));
console.log('\n=== ISSUES: ' + issues.length + ' ===');
issues.forEach(i => console.log(' -', i.join(' :: ')));
