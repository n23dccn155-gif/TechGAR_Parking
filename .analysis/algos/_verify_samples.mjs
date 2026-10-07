// Verification harness for dossier numerical samples (deterministic, offline).
const r = (x, d = 4) => Number(x.toFixed(d));
const out = [];

// --- A1: running-avg bg update + fg count ---
{
  const bgPrev = [[120,120,120,120],[120,120,120,120],[120,120,120,120],[120,120,120,120]];
  const fr = [[120,120,120,120],[120,60,60,120],[120,60,60,120],[120,120,120,120]];
  const a = 0.2, T = 30; let fg = 0; const bgNew = bgPrev.map((row, y) => row.map((v, x) => {
    const nv = a * fr[y][x] + (1 - a) * v; if (Math.abs(fr[y][x] - v) > T) fg++; return r(nv, 2);
  }));
  out.push(['A1', { bg_new_11: bgNew[1][1], fg_count: fg }]); // expect 108, 4
}

// --- A3: roi strict/context scaled demo ---
{
  // 8x8, strict ROI x∈[1..6],y∈[1..6]; context = dilate 1px -> x∈[0..7],y∈[0..7]
  const comp = { box: [0, 2, 2, 2] }; // fills 4 px at x=0,1 y=2,3
  const compPx = comp.box[2] * comp.box[3]; // 4
  const strictPx = 2; // only column x=1 inside strict
  const ratio = strictPx / compPx; // 0.5 -> clipped
  const required = Math.max(2, Math.min(4, Math.round(0.08 * compPx))); // scaled: floor2, minPx 4
  const contextPx = compPx; // whole comp within dilated context
  const anchor = [comp.box[0] + comp.box[2] / 2, comp.box[1] + comp.box[3]]; // (1,4)
  const anchorInContext = true; // context covers whole 8x8
  const rescued = ratio < 0.98 && strictPx > 0 && anchorInContext && contextPx >= required && strictPx < required;
  out.push(['A3', { compPx, strictPx, ratio: r(ratio), required, contextPx, anchor, verdict: strictPx < required ? (rescued ? 'rescued' : 'reject') : 'accept' }]);
}

// --- A4: OPEN 3x3 then CLOSE k=3 on 12x8 ---
{
  const g = Array.from({ length: 8 }, () => Array(12).fill(0));
  g[1][1] = 1; g[1][10] = 1;                        // speckles
  for (let y = 3; y <= 5; y++) for (let x = 3; x <= 5; x++) g[y][x] = 1; // vehicle 3x3
  for (let y = 3; y <= 4; y++) g[y][7] = 1;         // fragment 1x2, gap 1 col (x=6)
  const erode = (m, k) => m.map((row, y) => row.map((v, x) => {
    if (!v) return 0; for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
      const yy = y + dy, xx = x + dx; if (yy < 0 || xx < 0 || yy >= 8 || xx >= 12 || !m[yy][xx]) return 0;
    } return 1;
  }));
  const dilate = (m, k) => m.map((row, y) => row.map((v, x) => {
    for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
      const yy = y + dy, xx = x + dx; if (yy >= 0 && xx >= 0 && yy < 8 && xx < 12 && m[yy][xx]) return 1;
    } return 0;
  }));
  const opened = dilate(erode(g), 3);
  const closed = erode(dilate(opened), 3);
  const cnt = m => m.flat().filter(Boolean).length;
  out.push(['A4', { before: cnt(g), afterOpen: cnt(opened), afterClose: cnt(closed),
    closeJoins: closed[3][6] === 1 || closed[4][6] === 1 }]); // vehicle 9 survives, fragment merges via gap fill
}

// --- A5: geometry gates on 12x8 ---
{
  const img = [12, 8], minA = 4, minW = 2, minH = 2, maxA = 0.5 * 96, maxW = 0.75 * 12, maxH = 0.9 * 8, minPx = 3, minR = 0.1;
  const comps = [
    { box: [1, 1, 3, 3], area: 8, motion: 6 }, { box: [8, 1, 2, 2], area: 4, motion: 1 },
    { box: [0, 6, 12, 2], area: 22, motion: 20 }, { box: [5, 4, 2, 2], area: 4, motion: 3 },
  ];
  const verdicts = comps.map(c => {
    const [x, y, w, h] = c.box;
    if (c.area < minA || w < minW || h < minH) return 'reject:floor';
    if (c.area > 0.22 * 96) return 'reject:whole-scene';
    if (w > maxW || h > maxH || w * h > maxA) return 'reject:oversized';
    const ar = w / h; if (ar < 0.25 || ar > 5) return 'reject:aspect';
    if (c.motion < minPx || c.motion / (w * h) < minR) return 'reject:motion';
    return 'accept';
  });
  out.push(['A5', { verdicts, anchors: [[2, 4], null, null, [6, 6]] }]);
}

// --- A7: cast shadow metrics ---
{
  const bgL = [100, 100, 100, 100];
  const test = (curL) => {
    const att = curL.map(c => c / 100); const med = att.slice().sort((a, b) => a - b)[1]; // median of 4 -> idx1? use avg of mid2
    const sorted = att.slice().sort((a, b) => a - b); const m = (sorted[1] + sorted[2]) / 2;
    const explained = att.filter(a => Math.abs(a - m) <= 0.18).length / att.length;
    const res = curL.map((c, i) => Math.abs(c - m * bgL[i]) / bgL[i]);
    const resMed = (res.slice().sort((a, b) => a - b)[1] + res.slice().sort((a, b) => a - b)[2]) / 2;
    return { attMed: r(m), explained, resMed: r(resMed),
      shadow: m >= 0.32 && m <= 0.62 && resMed <= 0.08 && explained >= 0.75 };
  };
  out.push(['A7a', test([50, 50, 45, 180])]);  // expect shadow=true (explained .75)
  out.push(['A7b', test([70, 70, 70, 70])]);   // expect shadow=false (att .7 out of band)
}

// --- A9: echo IoU + hist ---
{
  const iou = (a, b) => {
    const iw = Math.max(0, Math.min(a[0] + a[2], b[0] + b[2]) - Math.max(a[0], b[0]));
    const ih = Math.max(0, Math.min(a[1] + a[3], b[1] + b[3]) - Math.max(a[1], b[1]));
    const i = iw * ih; return i / (a[2] * a[3] + b[2] * b[3] - i);
  };
  const bc = (p, q) => 1 - p.reduce((s, v, i) => s + Math.sqrt(v * q[i]), 0);
  out.push(['A9', { iou: r(iou([0, 0, 4, 3], [2, 0, 4, 3])), hist: bc([0.5, 0.3, 0.2], [0.5, 0.3, 0.2]), drop: 'b' }]);
}

// --- A11: Voronoi partition ---
{
  const seeds = [[2, 2], [5, 2]]; let area = [0, 0];
  for (let y = 1; y <= 3; y++) for (let x = 1; x <= 6; x++) {
    const d = seeds.map(([sx, sy]) => (x - sx) ** 2 + (y - sy) ** 2);
    area[d[0] <= d[1] ? 0 : 1]++;
  }
  out.push(['A11', { areas: area, ratios: area.map(a => r(a / 6)), pass: area.every(a => a / 6 >= 0.35 && a / 6 <= 1.8) }]);
}

// --- A12: elongation ---
{
  const ok = (w, tw, vx, span) => (w - tw) <= Math.abs(vx) * span + 0.3 * tw;
  out.push(['A12', { v3: ok(9, 4, 3, 2), v1: ok(9, 4, 1, 2) }]); // true, false
}

// --- B1: sim predict/correct ---
{
  let x = 10, y = 10, vx = 2, vy = 0; const beta = 0.5; const meas = [null, [14, 10], [16, 11]];
  const trace = [];
  for (const m of meas) {
    x += vx; y += vy; // predict
    if (m) { vx = beta * (m[0] - x) + (1 - beta) * vx; vy = beta * (m[1] - y) + (1 - beta) * vy; x = m[0]; y = m[1]; }
    trace.push([r(x), r(y), r(vx), r(vy)]);
  }
  out.push(['B1', { trace }]); // f2: x14 vx2 ; f3: x16,y11,vx1,vy0.5
}

// --- B2: decay ---
{
  const v = [0.1, 0.25, 0.4, 0.5].map(a => a > 0.4 ? 'anchor' : r(4 * Math.exp(-a / 0.25), 2));
  out.push(['B2', { v }]);
}

// --- B3: gate ---
{
  const gate = (speed, inv) => Math.min(180, Math.max(Math.max(24, 0.5 * 40), speed * (inv + 1) * 1.5 + 0.5 * 40));
  out.push(['B3', { inv2: r(gate(5, 2)), inv0: r(gate(5, 0)) }]); // 42.5, 27.5
}

// --- B4/B5 ---
{
  const iou = (a, b) => {
    const iw = Math.max(0, Math.min(a[0] + a[2], b[0] + b[2]) - Math.max(a[0], b[0]));
    const ih = Math.max(0, Math.min(a[1] + a[3], b[1] + b[3]) - Math.max(a[1], b[1]));
    const i = iw * ih; return i / (a[2] * a[3] + b[2] * b[3] - i);
  };
  const cost = 0.45 * (30 / 180) + 0.25 * (1 - 0.4) + 0.2 * 0.1 + 0.1 * 0;
  out.push(['B4B5', { iou: r(iou([0, 0, 4, 4], [2, 0, 4, 4])), cost: r(cost) }]); // .3333, .245
}

// --- B7 margin ---
{
  const costs = [[0.30, 0.32], [0.60, 0.31]], margin = 0.05;
  const ok = (r_, c) => costs.every((row, i) => i === r_ || row[c] === 10 || costs[r_][c] <= row[c] - margin)
    && costs[r_].every((v, j) => j === c || v === 10 || costs[r_][c] <= v - margin);
  out.push(['B7', { r0c0: ok(0, 0), r1c1: ok(1, 1) }]); // false, true
}

// --- B11 gallery distance ---
{
  const bc = (p, q) => 1 - p.reduce((s, v, i) => s + Math.sqrt(v * q[i]), 0);
  const ga = [[1, 0, 0], [1, 0, 0], [0.9, 0.1, 0]], gb = [[0, 1, 0], [0, 1, 0]];
  const nn = ga.map(a => Math.min(...gb.map(b => bc(a, b)))).concat(gb.map(b => Math.min(...ga.map(a => bc(b, a)))));
  const nnMed = nn.sort((a, b) => a - b)[Math.floor(nn.length / 2)];
  const agg = g => g[0].map((_, i) => g.reduce((s, v) => s + v[i], 0) / g.length);
  const d = r(0.5 * nnMed + 0.2 * 1 + 0.2 * bc(agg(ga), agg(gb)) + 0.1 * 1);
  out.push(['B11', { nnMed, dAgg: r(bc(agg(ga), agg(gb))), distance: d, support: 0 }]);
}

// --- C1 raster counts ---
{
  // polygon [[1,1],[6,1],[6,6],[1,6]] filled on 8x8: x∈[1..6],y∈[1..6] = 36
  const roi = 36, boundary = 36 - 16, core = 4;
  out.push(['C1', { roi, boundary, core }]);
}

// --- C2 votes ---
{
  const ratios = [0.30, 0.28, 0.31, 0.05, 0.04, 0.06, 0.29, 0.30, 0.02];
  out.push(['C2', { votes: ratios.filter(x => x >= 0.12).length, occupied: 6 >= 5 }]);
}

// --- D1 overlap score ---
{
  const inter = 16, vo = 16 / 16, so = 16 / 64, prox = 1 - 0;
  out.push(['D1', { vo, so, score: r(0.7 * vo + 0.2 * so + 0.1 * prox) }]); // .85
}

// --- D3 inward ---
{
  const d1 = Math.hypot(9 - 5, 5 - 5), d2 = Math.hypot(5.5 - 5, 5 - 5);
  out.push(['D3', { inwardGain: r(d1 - d2), need: Math.max(2, 0.05 * 10), pass: (d1 - d2) >= Math.max(2, 0.05 * 10) }]);
}

// --- D5 r95 drift ---
{
  const pts = [[5, 5], [5.5, 5], [5, 5.5], [5.2, 5], [5, 5], [5.4, 5.1], [5, 5], [5.1, 5]];
  const ds = pts.map(p => Math.hypot(p[0] - 5, p[1] - 5)).sort((a, b) => a - b);
  const r95 = ds[Math.ceil(0.95 * ds.length) - 1];
  const drift = Math.hypot(pts[7][0] - pts[0][0], pts[7][1] - pts[0][1]);
  out.push(['D5', { r95: r(r95), drift: r(drift), stopped: r95 <= 3 && drift <= 5 }]);
}

// --- D7 token radius ---
{
  const rad = a => r(100 * (0.05 + Math.min(1, a / 1.0) * 0.8));
  out.push(['D7', { r: [0, 0.5, 1.0].map(rad) }]); // 5,45,85
}

// --- D9 recovery gates ---
{
  const dEnd = Math.hypot(75 - 50, 50 - 50);
  out.push(['D9', { dEnd, inRadius: dEnd <= 30, qualified: 3 >= 3 && 0.55 <= 0.62 && 1.2 >= 0.4 && 1.2 <= 2.5 }]);
}

// --- E2 outward edge ---
{
  const t = (100 - 95) / 4; out.push(['E2', { t, pass: t <= 16 }]);
}

// --- E3 cosine ---
{
  const cos = (18 * 20 + 2 * 0) / (Math.hypot(18, 2) * 20);
  out.push(['E3', { cos: r(cos), pred: [110, 50] }]);
}

// --- E7 reachable limit ---
{
  out.push(['E7', { limit: 20 + 10 * 2, d: Math.hypot(118 - 100, 100 - 100) }]);
}

// --- E8 trajectory match ---
{
  const radius = 15, gap = 2.0, recentWin = 4.0, app = 0.8, size = 0.9, topo = 1.0;
  const src = { pos: [0, 0], vel: [10, 0] }, frag = { origin: [20, 3], vel: [9, 1], obs: 4 };
  const pred = [src.pos[0] + src.vel[0] * gap, src.pos[1] + src.vel[1] * gap];
  // point-segment distance frag.origin to seg src.pos->pred
  const seg = [pred[0] - src.pos[0], pred[1] - src.pos[1]];
  const tStar = Math.max(0, Math.min(1, ((frag.origin[0] - src.pos[0]) * seg[0] + (frag.origin[1] - src.pos[1]) * seg[1]) / (seg[0] ** 2 + seg[1] ** 2)));
  const proj = [src.pos[0] + tStar * seg[0], src.pos[1] + tStar * seg[1]];
  const corridor = Math.hypot(frag.origin[0] - proj[0], frag.origin[1] - proj[1]);
  const dScore = Math.max(0, Math.min(1, 1 - corridor / radius));
  const sSpeed = Math.hypot(...src.vel), cSpeed = Math.hypot(...frag.vel);
  const cos = (src.vel[0] * frag.vel[0] + src.vel[1] * frag.vel[1]) / (sSpeed * cSpeed);
  const dirScore = Math.max(0, Math.min(1, (cos + 1) * 0.5));
  const ratio = cSpeed / sSpeed;
  const spdScore = Math.max(0, Math.min(1, 1 - Math.abs(Math.log(Math.max(ratio, 1e-6))) / Math.log(4)));
  const timeScore = Math.max(0, Math.min(1, 1 - gap / recentWin));
  const score = 0.35 * dScore + 0.25 * app + 0.15 * dirScore + 0.10 * spdScore + 0.10 * Math.min(timeScore, topo) + 0.05 * size;
  out.push(['E8', { pred, corridor: r(corridor), dScore: r(dScore), cos: r(cos), dirScore: r(dirScore), spdScore: r(spdScore), timeScore: r(timeScore), score: r(score), match: score >= 0.78 }]);
}

// --- F5 aspect check ---
{
  const sx = 1280 / 640, sy1 = 720 / 360, sy2 = 760 / 360;
  const dev = (sy) => Math.abs(sx - sy) / sx;
  out.push(['F5', { dev720: r(dev(sy1)), dev760: r(dev(sy2)), reject760: dev(sy2) > 0.005 }]);
}

// --- F1 homography trivial case ---
{
  // px(5,5) with H=diag(10,20) -> (50,100)
  out.push(['F1', { world: [5 * 10, 5 * 20] }]);
}

for (const [k, v] of out) console.log(k, JSON.stringify(v));
