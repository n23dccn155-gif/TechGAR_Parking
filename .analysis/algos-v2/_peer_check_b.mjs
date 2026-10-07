// Peer-check độc lập pack B (không dùng verifier B): excerpt fidelity,
// draw trên mọi frame × progress, interpolation, activeLines ⊆ pseudocode.
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
const PACK = resolve('../../algo-web/packs/pipeline-identity.js');
const ROOT = resolve('../..');
globalThis.window = {};
new Function(readFileSync(PACK, 'utf8'))();
const nodes = globalThis.window.TechGarPipelinePacks?.identity;
let pass = 0, fail = 0; const fails = [];
const ok = (c, l, e) => { if (c) pass++; else { fail++; fails.push(l + (e ? ' :: ' + JSON.stringify(e).slice(0, 160) : '')); } };
function ctx() {
  const calls = []; const r = n => (...a) => calls.push(n + JSON.stringify(a).slice(0, 70));
  return { calls, fillStyle: '', strokeStyle: '', lineWidth: 1, font: '', textAlign: '', textBaseline: '', globalAlpha: 1,
    save: r('s'), restore: r('r'), translate: r('tr'), scale: r('sc'), beginPath: r('bp'), moveTo: r('mv'), lineTo: r('lt'),
    closePath: r('cp'), rect: r('rc'), roundRect: r('rr'), arc: r('a'), arcTo: r('at'), ellipse: r('el'), fill: r('f'),
    stroke: r('st'), clip: r('cl'), fillRect: r('fr'), strokeRect: r('sr'), fillText: r('ft'), clearRect: r('cr'),
    measureText: () => ({ width: 40 }), setLineDash: r('ld') };
}
ok(Array.isArray(nodes) && nodes.length === 3, 'identity = 3 nodes');
for (const n of nodes || []) {
  for (const k of ['does', 'role', 'where', 'why'])
    ok(n.answers && typeof n.answers[k] === 'string' && n.answers[k].length > 20, n.id + ' answers.' + k);
  for (const r of n.refs || []) {
    try {
      const src = readFileSync(resolve(ROOT, r.path), 'utf8').split('\n');
      const exc = r.excerpt.split('\n').map(l => l.replace(/\s+$/, '')).join('\n');
      const region = src.slice(r.excerptStart - 1, r.excerptStart - 1 + r.excerpt.split('\n').length)
        .map(l => l.replace(/\s+$/, '')).join('\n');
      ok(region === exc, n.id + ' ref ' + r.symbol + ' excerpt ≡ ' + r.path + ':' + r.excerptStart,
        region === exc ? undefined : { got: region.slice(0, 110), want: exc.slice(0, 110) });
    } catch (e) { ok(false, n.id + ' ref ' + r.symbol + ' read ' + r.path, e.message); }
  }
  for (const sc of n.scenarios || []) {
    const tag = n.id + '/' + sc.id;
    let frames; try { frames = sc.build(); } catch (e) { ok(false, tag + ' build throw', e.message); continue; }
    ok(frames.length >= 3, tag + ' ≥3 frames', frames.length);
    ok(JSON.stringify(frames) === JSON.stringify(sc.build()), tag + ' deterministic');
    let interp = false;
    frames.forEach((f, i) => {
      ok(Array.isArray(f.activeLines) && f.activeLines.every(l => l >= 0 && l < n.pseudocode.length), tag + ' f' + i + ' activeLines');
      ok(f.state && Object.keys(f.state).length > 0, tag + ' f' + i + ' state');
      const before = JSON.stringify(f); const cs = {};
      for (const p of [0, 0.5, 1]) {
        const c = ctx();
        try { n.draw(c, f, { width: 800, height: 480, progress: p, time: p * f.durationMs, previous: i ? frames[i - 1] : null }); }
        catch (e) { ok(false, tag + ' f' + i + ' draw@' + p, e.message); continue; }
        cs[p] = c.calls.join('|');
      }
      ok(JSON.stringify(f) === before, tag + ' f' + i + ' draw no-mutate');
      if (cs[0] !== cs[1]) interp = true;
    });
    ok(interp, tag + ' ≥1 frame nội suy theo progress');
  }
}
console.log(`peer-check B: ${pass} PASS / ${fail} FAIL`);
if (fails.length) console.log(fails.slice(0, 60).join('\n'));
