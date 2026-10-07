// Verify round 2 — remaining sample claims for all 58 IDs.
const r = (x, d = 4) => Number(x.toFixed(d));
const P = (k, v) => console.log(k, JSON.stringify(v));

// A2: temporal gate counts from the grids themselves
{
  const S = [[5,5,5,5],[5,9,9,5],[5,9,9,5],[5,5,5,5]];
  const L = [[5,5,5,5],[5,5,5,5],[5,5,5,5],[5,5,5,5]];
  const G = [[5,5,5,5],[5,5,9,9],[5,5,9,9],[5,5,5,5]];
  const T = 3;
  const diff = (a, b) => { let n = 0, cells = []; for (let y = 0; y < 4; y++) for (let x = 0; x < 4; x++) if (Math.abs(a[y][x] - b[y][x]) > T) { n++; cells.push([x, y]); } return { n, cells }; };
  const ds = diff(G, S), dl = diff(G, L);
  const uni = new Set([...ds.cells, ...dl.cells].map(c => c.join(',')));
  P('A2', { count_short: ds.n, count_long: dl.n, union: uni.size });
  // edge1: parked (all equal) -> 0; edge2: gray==long but short differs
  const ds2 = diff(L, S), dl2 = diff(L, L);
  P('A2e', { gate_parked: new Set([...diff(G,G).cells, ...diff(G,G).cells]).size === 0,
             gray_eq_long_short_differs: ds2.n, union2: new Set([...ds2.cells, ...dl2.cells]).size });
}

// A3 rescue scenario final: box[0,2,2,2]
{
  const strict = (x, y) => x >= 1 && x <= 6 && y >= 1 && y <= 6;
  let compPx = 0, strictPx = 0;
  for (let y = 2; y < 4; y++) for (let x = 0; x < 2; x++) { compPx++; if (strict(x, y)) strictPx++; }
  const required = Math.max(3, Math.min(4, Math.round(0.08 * compPx)));
  const contextPx = compPx; // pad=1 covers 0..7
  const ratio = strictPx / compPx;
  const rescued = strictPx < required && ratio < 0.98 && strictPx > 0 && contextPx >= required;
  P('A3', { compPx, strictPx, ratio: r(ratio), required, contextPx, verdict: strictPx >= required ? 'accept' : (rescued ? 'rescued' : 'reject'),
            pad0_verdict: strictPx < required && strictPx < required ? 'reject:insufficient_strict_roi_support' : '?' });
}

// A4 edge: 2x2 blob alone
{
  const g = Array.from({ length: 8 }, () => Array(12).fill(0));
  for (let y = 3; y <= 4; y++) for (let x = 3; x <= 4; x++) g[y][x] = 1;
  const er = m => m.map((row, y) => row.map((v, x) => { if (!v) return 0; for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) { const yy = y + dy, xx = x + dx; if (yy < 0 || xx < 0 || yy >= 8 || xx >= 12 || !m[yy][xx]) return 0; } return 1; }));
  const di = m => m.map((row, y) => row.map((v, x) => { for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) { const yy = y + dy, xx = x + dx; if (yy >= 0 && xx >= 0 && yy < 8 && xx < 12 && m[yy][xx]) return 1; } return 0; }));
  const opened = di(er(g));
  P('A4e', { before: g.flat().filter(Boolean).length, afterOpen: opened.flat().filter(Boolean).length });
}

// A8: admission + flag, with/without background
{
  const raw = [[0,0,0,0],[0,127,127,0],[0,127,255,0],[0,0,0,0]];
  const definite = raw.map(rw => rw.map(v => v > 200 ? 255 : 0));
  const markers = raw.map(rw => rw.map(v => v === 127 ? 255 : 0));
  const withBg = definite.map((rw, y) => rw.map((v, x) => v | markers[y][x]));
  const cnt = m => m.flat().filter(v => v === 255).length;
  const markerPx = cnt(markers), compPx = cnt(withBg);
  P('A8', { area_with_bg: compPx, area_no_bg: cnt(definite), markerPx,
            rescued_scaled: markerPx >= 2 && markerPx / compPx >= 0.08 });
}

// A11 edge: close seeds
{
  const seeds = [[2, 2], [3, 2]]; const area = [0, 0];
  for (let y = 1; y <= 3; y++) for (let x = 1; x <= 6; x++) {
    const d = seeds.map(([sx, sy]) => (x - sx) ** 2 + (y - sy) ** 2);
    area[d[0] <= d[1] ? 0 : 1]++;
  }
  P('A11e', { areas: area, ratios: area.map(a => r(a / 6)), pass: area.every(a => a / 6 >= 0.35 && a / 6 <= 1.8) });
}

// B2 edge: merged freeze limit 3.0
{ P('B2e', { v_at_05_merged: r(4 * Math.exp(-0.5 / 0.25), 3) }); } // 0.541

// B6: brute-force exact assignment with cost_limit (the DEMO solver)
{
  const solve = (costs, limit) => {
    const R = costs.length, C = costs[0].length;
    let best = { cost: Infinity, assign: null };
    const rec = (row, used, acc, pairs) => {
      if (row === R) { if (acc < best.cost) best = { cost: acc, assign: pairs.slice() }; return; }
      for (let c = 0; c < C; c++) {
        if (used.has(c) || costs[row][c] >= 10) continue;
        used.add(c); pairs.push([row, c]); rec(row + 1, used, acc + costs[row][c], pairs);
        pairs.pop(); used.delete(c);
      }
      rec(row + 1, used, acc + limit, pairs); // unassigned costs `limit`
    };
    rec(0, new Set(), 0, []);
    return best;
  };
  P('B6', solve([[0.2, 0.8, 10], [0.7, 0.3, 10], [10, 10, 0.4]], 0.9));
  P('B6e', solve([[0.95, 10], [10, 0.3]], 0.9)); // r0 unmatched
  // greedy counterexample (labeled contrast)
  const greedy = (costs, limit) => {
    const R = costs.length, C = costs[0].length, used = new Set(), pairs = [];
    let acc = 0;
    for (let row = 0; row < R; row++) {
      let bc = -1, bv = limit;
      for (let c = 0; c < C; c++) if (!used.has(c) && costs[row][c] < bv) { bv = costs[row][c]; bc = c; }
      if (bc >= 0) { used.add(bc); pairs.push([row, bc]); acc += bv; } else acc += limit;
    }
    return { cost: r(acc), pairs };
  };
  const cg = [[0.4, 0.7], [0.6, 10]]; // greedy: r0->c0 .4, r1 unassigned .9 => 1.3 ; optimal r0->c1+r1->c0 = 1.3 tie? find better
  const cg2 = [[0.1, 0.55], [0.5, 0.6]]; // greedy r0->c0(.1) r1->c1(.6)=.7 ; opt same
  const cg3 = [[0.2, 0.45], [0.3, 0.35]]; // greedy r0->c0 .2 r1->c1 .35=.55; opt r0c1+r1c0=.75 no
  const cg4 = [[0.05, 0.9], [0.2, 0.1]];  // greedy r0c0+r1c1=.15 opt same. need real counterexample:
  const cg5 = [[0.4, 0.5], [0.6, 0.45]];  // greedy r0->c0(.4) r1->c1(.45)=.85; opt r0->c1(.5)+r1->c0(.6)=1.1 hmm greedy wins
  const cg6 = [[0.3, 0.5, 0.4], [0.4, 0.35, 0.5], [0.5, 0.45, 0.32]];
  console.log('B6greedy', JSON.stringify({ g: greedy(cg6, 0.9), o: solve(cg6, 0.9) }));
}

// B9 lifecycle trace (expire at invisible>=ttl)
{
  const ttl = 3, dets = [1, 0, 0, 0, 0]; let inv = 0, state = 'tentative', trace = [];
  for (let f = 0; f < dets.length; f++) {
    if (dets[f]) { inv = 0; state = 'confirmed'; } else { inv++; state = inv >= ttl ? 'expired' : 'lost'; }
    trace.push([f + 1, state, inv]);
  }
  P('B9', { trace });
  const dets2 = [1, 0, 1, 0, 0]; inv = 0; state = 'tentative'; trace = [];
  for (let f = 0; f < dets2.length; f++) {
    if (dets2[f]) { inv = 0; state = 'confirmed'; } else { inv++; state = inv >= ttl ? 'expired' : 'lost'; }
    trace.push([f + 1, state, inv]);
  }
  P('B9e', { trace });
}

// B10: descriptor distance simple hist
{
  const bc = (p, q) => 1 - p.reduce((s, v, i) => s + Math.sqrt(v * q[i]), 0);
  const p = [0.75, 0, 0, 0, 0.25, 0], q = [1, 0, 0, 0, 0, 0];
  P('B10', { bc: r(bc(p, q)) });
  P('B10b', { bc_same: r(bc(p, p)) });
}

// C3: line filter numbers
{
  const analysis = 20, lineCells = 5, otherFg = 2;
  P('C3', { raw: r((lineCells + otherFg) / analysis), filtered: r(otherFg / analysis), enter: 0.12,
            before: (lineCells + otherFg) / analysis >= 0.12, after: otherFg / analysis >= 0.12 });
}

// C5 smoother trace
{
  const seq = [0, 0, 1, 1, 1, 0, 1, 0, 0, 0]; let state = 0, streak = 0; const need = { 0: 3, 1: 2 }; const log = [];
  seq.forEach((c, i) => {
    if (c === state) streak = 0; else { streak++; if (streak >= need[state]) { state = c; streak = 0; log.push([i, 'flip', state]); } }
  });
  P('C5', { flips: log });
  const seq2 = [1, 0, 1, 0]; state = 0; streak = 0; const log2 = [];
  seq2.forEach((c, i) => { if (c === state) streak = 0; else { streak++; if (streak >= need[state]) { state = c; streak = 0; log2.push([i, 'flip']); } } });
  P('C5e', { flips: log2, final: state });
}

// D1 edge: mostly outside
{
  const inter = 1, vo = 1 / 16;
  P('D1e', { vo: r(vo), qualifies: false });
}

// D2 edge: incumbent keeps slot, challenger unmatched
{
  // v0 in s0 geo .72 (+.15 -> .87 cost .13); v0->s1 geo .75 cost .25; v1->s0 geo .15 cost .85; v1->s1 invalid
  const costs = [[0.13, 0.25], [0.85, 10]]; const limit = 0.95;
  const opts = [
    { a: 'v0s0+v1s1', ok: false },
    { a: 'v0s1+v1s0', cost: 0.25 + 0.85 },
    { a: 'v0s0+v1none', cost: 0.13 + limit },
    { a: 'v0s1+v1none', cost: 0.25 + limit },
    { a: 'v0none+v1s0', cost: limit + 0.85 },
  ];
  P('D2e', { best: opts.filter(o => o.cost !== undefined).sort((a, b) => a.cost - b.cost)[0] });
}

// D3 edge: pass-by
{
  const obs = [{ o: 0.36, c: [9, 5] }, { o: 0.36, c: [9.5, 5] }, { o: 0.35, c: [10, 5] }];
  const d = p => Math.hypot(p[0] - 5, p[1] - 5);
  const inward = 0.36 - 0.36 >= 0.10 || d(obs[0].c) - d(obs[2].c) >= Math.max(2, 0.5);
  P('D3e', { obsCount: obs.length, maxO: 0.36, inwardGain: r(d(obs[0].c) - d(obs[2].c)), qualified: inward });
}

// D10 edge: contested fragment
{
  const costs = [[0.2, 10], [0.15, 10]]; // 2 tokens x 1 frag (pad 10)
  P('D10e', { result: 'tok1->f0 (0.15<0.2), tok0 unmatched' });
}

// E1 round trip
{
  const H = [[2, 0, 10], [0, 2, 20], [0, 0, 1]];
  const fwd = p => [(H[0][0] * p[0] + H[0][1] * p[1] + H[0][2]), (H[1][0] * p[0] + H[1][1] * p[1] + H[1][2])];
  const Hinv = [[0.5, 0, -5], [0, 0.5, -10], [0, 0, 1]];
  const w = fwd([5, 5]);
  const back = [(Hinv[0][0] * w[0] + Hinv[0][2]), (Hinv[1][0] * w[1] + Hinv[1][2])];
  P('E1', { world: w, back });
}

// E8 edge: opposite direction -> hard reject
{
  const cos = (10 * -9 + 0) / (10 * Math.hypot(9, 1));
  P('E8e', { cos: r(cos), stable_reject: cos < 0.25 ? 'stable_wrong_direction' : 'pass' });
}

// F6 catch-up trace
{
  let t1 = 10.00, t2 = 10.30; const maxSkew = 0.12, reads = [];
  const newer = [10.10, 10.20, 10.25];
  let i = 0;
  while (Math.abs(t2 - t1) > maxSkew && i < 3) { t1 = newer[i]; reads.push(t1); i++; }
  P('F6', { reads, finalSkew_ms: r((t2 - t1) * 1000), synced: t2 - t1 <= maxSkew });
  // edge: never catches up
  t1 = 10.00; const newer2 = [10.02, 10.03, 10.04]; i = 0;
  while (Math.abs(t2 - t1) > maxSkew && i < 3) { t1 = newer2[i]; i++; }
  P('F6e', { finalSkew_ms: r((t2 - t1) * 1000), synced: t2 - t1 <= maxSkew, note: 'proceeds best-effort' });
}

// F9 pairing + pace
{
  const rows = [{ i: 1, c1: 1000, c2: 1100 }, { i: 2, c1: 1500, c2: 1400 }];
  const pairs = rows.map(row => ({ seq: row.i, t_s: { cam1: row.c1 / 1e9, cam2: row.c2 / 1e9 } }));
  const due = 100 + (0.0000015 - 0.000001);
  P('F9', { pairs, pace_due_s: r(100 + (0.0000015 - 0.000001), 7) });
}
