const r = (x, d = 4) => Number(x.toFixed(d));
const P = (k, v) => console.log(k, JSON.stringify(v));

// B1: alpha-beta filter sim: pred x+=v; residual r=meas-pred; x'=pred+0.5r; v'=v+0.5r
{
  let s = [10, 10, 0, 0]; // init at meas0
  const meas = [[12, 10], [13, 10], [14, 11]];
  const trace = [];
  for (const m of meas) {
    const px = s[0] + s[2], py = s[1] + s[3];
    const rx = m[0] - px, ry = m[1] - py;
    s = [px + 0.5 * rx, py + 0.5 * ry, s[2] + 0.5 * rx, s[3] + 0.5 * ry];
    trace.push(s.map(v => r(v, 2)));
  }
  P('B1', { trace });
  // edge: coast 2 frames no meas
  P('B1e', { coast: [s[0] + s[2], s[1] + s[3]] });
}

// B4: nested boxes
{
  const iou = (a, b) => {
    const x1 = Math.max(a[0], b[0]), y1 = Math.max(a[1], b[1]);
    const x2 = Math.min(a[0] + a[2], b[0] + b[2]), y2 = Math.min(a[1] + a[3], b[1] + b[3]);
    const i = Math.max(0, x2 - x1) * Math.max(0, y2 - y1);
    return i / (a[2] * a[3] + b[2] * b[3] - i || 1);
  };
  P('B4', { iou_ab: r(iou([0, 0, 4, 4], [2, 0, 4, 4])), iou_nested: r(iou([0, 0, 2, 2], [0, 0, 4, 4])), iou_disjoint: iou([0, 0, 2, 2], [5, 5, 2, 2]) });
}

// B5: cost composition w_d*d_norm + w_i*(1-iou) + w_a*app + w_s*size + w_g*(1-dir)
{
  const cost = 0.4 * 0.3 + 0.2 * (1 - 0.35) + 0.2 * 0.15 + 0.1 * 0.1 + 0.1 * (1 - 0.9);
  P('B5', { cost: r(cost) });
}

// B8: reacquire gates
{
  const d = Math.hypot(2, 1), app = 0.2, age = 0.8;
  P('B8', { d: r(d, 2), pass: d <= 3 && app <= 0.22 && age <= 1.5,
            fail_app: app <= 0.25 ? '0.25>0.22 fail' : '?' });
}

// D6: challenger rejected while slot owned; release after exit_pending countdown
{
  const seq = [];
  let owner = 'v0', pending = 0;
  const events = [
    { t: 1, ev: 'challenger_v1_overlap0.6' },
    { t: 2, ev: 'vision_empty' },
    { t: 3, ev: 'vision_empty' },
    { t: 4, ev: 'vision_empty' },
  ];
  for (const e of events) {
    if (e.ev.startsWith('challenger')) seq.push([e.t, 'reject:sticky_id_conflict']);
    if (e.ev === 'vision_empty') { pending++; if (pending >= 3) { seq.push([e.t, 'release_v0']); owner = null; } }
  }
  P('D6', { seq });
}

// D7: token radius growth
{
  const radius = (dt, r0, rate, rmax) => Math.min(rmax, r0 + rate * dt);
  P('D7', { r: [radius(0, 5, 20, 85), radius(2, 5, 20, 85), radius(5, 5, 20, 85)] });
}

// D10: contested fragment - two tokens one fragment
{
  // costs tok->frag: t0->f0=0.2, t1->f0=0.15; only one can take f0
  P('D10e', { winner: 'tok1->f0(0.15)', loser: 'tok0 unmatched' });
}

// E2: outward edge + time-to-edge
{
  const t = (cx, vx, edge) => vx > 0 ? (edge - cx) / vx : cx / -vx;
  P('E2', { t_right: r(t(90, 4, 95), 2), t_left: r(95 / 4, 2), slow: r(t(90, 0.2, 95), 2) });
}

// E4: candidate cost selection
{
  const cands = [{ d: 3, app: 0.1 }, { d: 8, app: 0.05 }];
  const cost = c => 0.7 * c.d / 10 + 0.3 * c.app;
  P('E4', { costs: cands.map(c => r(cost(c))), pick: 0 });
}

// E5: unique overlap pair vs ambiguous
{
  P('E5', { unique: 'w1 only within radius of w2a AND vice versa -> merge',
            ambiguous: 'w2b also in radius -> skip this frame' });
}

// E6: allocatable
{ P('E6', { ready: { obs: 6, disp: 7 }, provisional: { obs: 4 } }); }

// E7: reachable distance vs stale
{
  const limit = 40, d = 18;
  P('E7', { revive: d <= limit, stale_same_cam: 'elapsed=13s>12s && moving -> stale skip' });
}

// E10: lifecycle transitions
{
  P('E10', { seq: ['active', 'handoff', 'dormant', 'revived|exited'] });
}

// F1: 4-point DLT exact: dst = 2*src + (10,20)
{
  const pairs = [[0, 0, 10, 20], [5, 0, 20, 20], [0, 5, 10, 30], [5, 5, 20, 30]];
  P('F1', { check: pairs.every(([x, y, X, Y]) => 2 * x + 10 === X && 2 * y + 20 === Y), residual: 0 });
}

// F2: fit_gate max_error_cm=2.0, max_p95_px=8.5, max_pixel_error=12.0 (literal!)
{ P('F2', { literals: 'fit_gate(diag, max_error_cm=2.0, max_p95_px=8.5, max_pixel_error=12.0)' }); }

// F4: median slot length -> radius
{
  const slots = [400, 500, 600, 520, 480];
  const sorted = [...slots].sort((a, b) => a - b);
  const med = sorted[2];
  P('F4', { median: med, radius: med / 2 });
}

// F5: deviation
{
  const dev = (a, b) => Math.abs(a - b) / b * 100;
  P('F5', { dev760: r(dev(760, 720), 2), dev720: r(dev(720, 720), 2), scale: r(760 / 720, 4) });
}

// F8: evidence freshness
{
  P('F8', { applied: 'job newer than applied_seq -> accept; else drop' });
}

// F9: pace due
{
  const wall = 100, srcNow = 1.5, srcStart = 1.0;
  P('F9', { due: r(wall + srcNow - srcStart, 4) });
}

// ---- patch review: B8 cost floor + B11 gallery (new fixtures) ----
{
  const dB8=Math.hypot(7-5,6-5);
  P('B8f',{d:r(dB8),cost:r(0.5+0.2*dB8/3)});
  const dh=(a,b)=>1-a.reduce((s2,v,i)=>s2+Math.sqrt(v*b[i]),0);
  const A=[[0.9,0.1],[0.6,0.4]];
  const g=(B,covT,w)=>{const nns=A.map(a=>Math.min(...B.map(b=>dh(a,b))));const med=(nns[0]+nns[1])/2;const cov=nns.filter(x=>x>covT).length/nns.length;return{nn:nns.map(x=>r(x)),nnMed:r(med),cov,dist:r(med+w*cov)};};
  P('B11A',g([[0.8,0.2],[0.1,0.9]],0.5,0.2));
  P('B11B',g([[0,1],[0,1]],0.5,0.2));
}
