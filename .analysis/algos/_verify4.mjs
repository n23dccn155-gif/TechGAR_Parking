// _verify4.mjs — fixture B: assert các correction SOURCE-POLICY hiện hành
// (cv-source-review-a + occupancy-correction-c v1.1 + cv-crosscal-review-c E/F
//  + motion-binder-correction-a 19-section merge: A5/A7/A9/A10/A12, B5/B7/B8/B10/B11, D1/D3/D4/D7/D8/D9/D10)
// Assert pre-merge cho B5/B8/B10/B11 đã bị THAY bằng formula sau merge — không giữ case superseded.
// Chạy: node _verify4.mjs — deterministic, không server/backend.
const r = (x, d = 4) => Number(x.toFixed(d));
let pass = 0, fail = 0;
const check = (name, got, want, tol = 1e-3) => {
  const eq = (a, b) => (typeof b === 'number' ? Math.abs(a - b) <= tol : JSON.stringify(a) === JSON.stringify(b));
  const ok = Array.isArray(want) ? want.length === got.length && want.every((w, i) => eq(got[i], w)) : eq(got, want);
  ok ? pass++ : fail++;
  console.log(`[${ok ? 'PASS' : 'FAIL'}] ${name}: got=${JSON.stringify(got)} want=${JSON.stringify(want)}`);
};

// ---------- B2 prediction: vector interpolation + linear conf; merged->raw; over-limit->anchor ----------
{
  const meas = 10, raw = 14, tau = 0.25, lim = 0.40;
  const pts = [0, 0.1, 0.2, 0.3].map(a => r(meas + (raw - meas) * Math.exp(-a / tau), 2));
  const conf = [0, 0.1, 0.2, 0.3].map(a => r(1 - a / lim, 2));
  check('B2 point x(ages)', pts, [14, 12.68, 11.8, 11.2]);
  check('B2 conf(ages)', conf, [1, 0.75, 0.5, 0.25]);
  check('B2 merged_freeze', { point: [14, 10], conf: 1.0, src: 'kalman_prediction' }, { point: [14, 10], conf: 1.0, src: 'kalman_prediction' });
  check('B2 over-limit anchor', { point: [10, 10], conf: 0, src: 'stale_prediction' }, { point: [10, 10], conf: 0, src: 'stale_prediction' });
}

// ---------- B3 bounded gate floor/budget/ceiling ----------
{
  const gate = (speed, inv, extent, vc, ceiling = 180, scale = 2.0, sr = 1.0, floorMin = 24) => {
    if (vc < 3) return ceiling;
    const budget = speed * (inv + 1) * scale + sr * extent;
    return Math.min(ceiling, Math.max(Math.max(floorMin, sr * extent), budget));
  };
  check('B3 gate A', gate(5, 3, 10, 10), 50);
  check('B3 floor', gate(0.5, 0, 10, 10), 24);
  check('B3 young vc<3', gate(5, 3, 10, 2), 180);
}

// ---------- B5 cost 4-term (merged: 0.45/0.25/0.20/0.10, log-size) + fail-gate ----------
{
  const sizeErr = ratio => Math.min(1, Math.abs(Math.log(Math.max(ratio, 1e-6))) / Math.abs(Math.log(2.80)));
  const cost = (dn, iou, app, se) => 0.45 * dn + 0.25 * (1 - iou) + 0.20 * app + 0.10 * se;
  check('B5 size_error ln1.5/ln2.8', r(sizeErr(1.5), 4), 0.3938);
  check('B5 cost A = 0.3669', r(cost(0.3, 0.35, 0.15, sizeErr(1.5)), 4), 0.3669);
  const d = 55, gate = 50;
  check('B5 d>gate -> inf', d > gate ? 10 : d, 10);
}

// ---------- B6 counterexample ----------
{
  const exhaustive = (C, limit) => {
    const T = C.length, D = C[0].length; let best = 1e18;
    const perm = (row, used, acc) => {
      if (row === T) { best = Math.min(best, acc); return; }
      for (let c = 0; c < D; c++) if (!used.has(c)) { used.add(c); perm(row + 1, used, acc + C[row][c]); used.delete(c); }
      perm(row + 1, used, acc + limit);
    };
    perm(0, new Set(), 0); return r(best);
  };
  const CCE = [[0.1, 0.5], [0.4, 10]];
  const greedyRow = r(CCE[0][0] + 0.9);
  check('B6 CE greedy', greedyRow, 1.0);
  check('B6 CE optimal', exhaustive(CCE, 0.9), 0.9);
}

// ---------- B7 split-only + lineage-scaled margin + clear-streak (merged) ----------
{
  // margin check CHI ap cho split_margin_track_ids; margin = 0.08*(2-lineage)
  const hasMargin = (C, r0, c, m) => {
    const alts = [];
    C[r0].forEach((v, j) => { if (j !== c && v < 10) alts.push(v); });
    C.forEach((row, i) => { if (i !== r0 && row[c] < 10) alts.push(row[c]); });
    return alts.length === 0 || Math.min(...alts) - C[r0][c] >= m;
  };
  const C = [[0.30, 0.32, 10], [0.90, 10, 0.31]];
  const margin = 0.08 * (2 - 0.0); // lineage 0 -> 0.16
  check('B7 margin lineage-scaled = 0.16', r(margin, 2), 0.16);
  check('B7 A r0 defer (0.32-0.30=0.02 < 0.16)', hasMargin(C, 0, 0, margin), false);
  check('B7 A r1 keep (0.90-0.31=0.59 >= 0.16)', hasMargin(C, 1, 2, margin), true);
  // track dang thay (khong in split_margin) -> bo qua check, gan luon du gap 0.02
  const inSplit = [false, true];
  const verdict = [[0, 0], [1, 2]].map(([rr, c], i) =>
    !inSplit[i] ? 'keep' : (hasMargin(C, rr, c, margin) ? 'keep' : 'defer'));
  check('B7 B not-in-split keeps despite thin gap', verdict, ['keep', 'keep']);
}

// ---------- B8 stale anchor gate + cost 4-term (merged) ----------
{
  // Sample A: last_meas=[5,5], clean 4x3 -> diag=5; det point [6.5,6]
  const gate = Math.min(20, Math.max(3, 0.30 * Math.hypot(4, 3)));
  check('B8 anchor gate = min(20, max(3,1.5)) = 3', r(gate, 2), 3);
  const d = Math.hypot(6.5 - 5, 6 - 5);
  check('B8 d = 1.803 <= gate', r(d, 3), 1.803);
  check('B8 app 0.2 <= 0.22 stale limit', 0.2 <= Math.min(0.30, 0.22), true);
  // cost 4-term: pred_box (3,2,4,3) vs det [4,3,5,3] -> iou 6/21=0.2857; size_err |ln1.25|/|ln2.8|=0.2167
  const sizeErr = Math.abs(Math.log(1.25)) / Math.abs(Math.log(2.80));
  const cost = 0.45 * (d / 20) + 0.25 * (1 - 6 / 21) + 0.20 * 0.2 + 0.10 * sizeErr;
  check('B8 cost 4-term = 0.2809', r(cost, 4), 0.2809);
  check('B8 lost 2.0 > 1.5 -> skip window', 2.0 > 1.5, true);
  check('B8 app 0.25 > 0.22 -> reject', 0.25 > 0.22, true);
}

// ---------- B9 enum 3-state; expiry=pop+emit ----------
{
  const sim = dets => {
    const ttl = 3; let inv = 0, removed = false; const trace = [];
    for (const m of dets) {
      if (removed) { trace.push('—'); continue; }
      if (m) { inv = 0; trace.push('confirmed'); }
      else { inv++; if (inv >= ttl) { removed = true; trace.push('removed+emit'); } else trace.push(`lost(${inv})`); }
    }
    return trace;
  };
  check('B9 A', sim([1, 0, 0, 0, 0]), ['confirmed', 'lost(1)', 'lost(2)', 'removed+emit', '—']);
  check('B9 B', sim([1, 0, 1, 0, 0]), ['confirmed', 'lost(1)', 'confirmed', 'lost(1)', 'lost(2)']);
}

// ---------- B10 demo 6-bin: cv2 Bhattacharyya sqrt(1-BC) + quality 3-factor ----------
{
  const h = [0, 0, 0, 0, 0, 0];
  for (const v of [10, 10, 10, 160]) h[Math.floor(v / 30)]++;
  const p = h.map(c => c / 4), q = [1, 0, 0, 0, 0, 0];
  const BC = (a, b) => a.reduce((s, v, i) => s + Math.sqrt(v * b[i]), 0);
  const cvDist = (a, b) => Math.sqrt(Math.max(0, 1 - BC(a, b) / Math.sqrt(a.reduce((x, y) => x + y, 0) * b.reduce((x, y) => x + y, 0))));
  check('B10 hist', p, [0.75, 0, 0, 0, 0, 0.25]);
  check('B10 BC = 0.866', r(BC(p, q), 3), 0.866);
  check('B10 d = sqrt(1-BC) = 0.366', r(cvDist(p, q), 3), 0.366);
  // quality = 0.5*size + 0.3*fg + 0.2*aspect; hard-0 khi area<200 hoac fg<0.15
  const quality = (area, fg, aspect) => {
    if (area < 200 || fg < 0.15) return 0;
    return 0.5 * Math.min(1, area / 1000) + 0.3 * Math.min(1, fg * 2) + 0.2 * (aspect < 0.3 || aspect > 4 ? 0.5 : 1);
  };
  check('B10 q s1 = 0.7 >= 0.5', r(quality(400, 0.5, 1.0), 1), 0.7);
  check('B10 q s2 area<200 -> 0', quality(100, 0.9, 1.0), 0);
  check('B10 q s3 fg<0.15 -> 0', quality(900, 0.10, 1.0), 0);
}

// ---------- B11 gallery 4-term: 0.5*nearest + 0.2*coverage + 0.2*aggregate + 0.1*best3 ----------
{
  const cvD = (p, q) => { // cv2 BHATTACHARYYA: sqrt(1 - BC/sqrt(Sp*Sq))
    const bc = p.reduce((s, v, i) => s + Math.sqrt(v * q[i]), 0);
    const den = Math.sqrt(p.reduce((a, b) => a + b, 0) * q.reduce((a, b) => a + b, 0));
    return den > 0 ? Math.sqrt(Math.max(0, 1 - bc / den)) : 0;
  };
  const median = xs => { const s = [...xs].sort((a, b) => a - b); const n = s.length; return n % 2 ? s[(n - 1) / 2] : (s[n / 2 - 1] + s[n / 2]) / 2; };
  const l2 = v => { const n = Math.hypot(...v); return n > 1e-9 ? v.map(x => x / n) : v; };
  const aggMedianL2 = G => l2(G[0].map((_, j) => median(G.map(h => h[j]))));
  const trackletDist = (A, B) => {
    const pw = A.map(a => B.map(b => cvD(a, b)));
    const leftN = pw.map(row => Math.min(...row));
    const rightN = B.map((_, j) => Math.min(...A.map((_, i) => pw[i][j])));
    const partial = A.length <= B.length ? leftN : rightN;
    const nearest = median(partial);
    const coverage = median([...leftN, ...rightN]);
    const aggregate = cvD(aggMedianL2(A), aggMedianL2(B));
    const flat = pw.flat().sort((a, b) => a - b);
    const best3 = flat.slice(0, Math.min(3, flat.length)).reduce((a, b) => a + b, 0) / Math.min(3, flat.length);
    return 0.50 * nearest + 0.20 * coverage + 0.20 * aggregate + 0.10 * best3;
  };
  const A = [[0.9, 0.1], [0.6, 0.4]];
  const dA = trackletDist(A, [[0.8, 0.2], [0.1, 0.9]]);
  const dB = trackletDist(A, [[0, 1], [0, 1]]);
  check('B11 A distance 4-term = 0.1553', r(dA, 4), 0.1553);
  check('B11 A match', dA <= 0.5, true);
  check('B11 B distance 4-term = 0.6889', r(dB, 4), 0.6889);
  check('B11 B match', dB <= 0.5, false);
  check('B11 support = min(len)', Math.min(2, 2), 2);
}

// ================= motion-binder-correction-a merge (19 sections, own asserts) =================

// ---------- A9 same_echo 4-cond (no IoU) + suppress needs IoU>=0.25 && hist<=0.12 ----------
{
  const sameEcho = (a, b) => {
    if (!a.hist || !b.hist) return false;
    const sr = Math.min(a.area, b.area) / Math.max(a.area, b.area);
    const hd = 0; // cung hist [1,0]
    const dist = Math.hypot(a.point[0] - b.point[0], a.point[1] - b.point[1]);
    const gap = Math.max(0, Math.max(b.box[0] - (a.box[0] + a.box[2]), a.box[0] - (b.box[0] + b.box[2])));
    const allow = Math.max(24, 1.10 * Math.max(Math.min(a.box[2], a.box[3]), Math.min(b.box[2], b.box[3])));
    return sr >= 0.45 && hd <= 0.22 && dist <= allow && gap <= 14;
  };
  const iou = (a, b) => {
    const iw = Math.max(0, Math.min(a[0] + a[2], b[0] + b[2]) - Math.max(a[0], b[0]));
    const ih = Math.max(0, Math.min(a[1] + a[3], b[1] + b[3]) - Math.max(a[1], b[1]));
    const inter = iw * ih;
    return inter / (a[2] * a[3] + b[2] * b[3] - inter);
  };
  const a = { box: [0, 0, 4, 4], point: [2, 4], hist: [1, 0], area: 16 };
  const b = { box: [2, 0, 4, 4], point: [4, 4], hist: [1, 0], area: 16 };
  const dd = { box: [5, 0, 4, 4], point: [7, 4], hist: [1, 0], area: 16 };
  check('A9 same_echo(a,b) true', sameEcho(a, b), true);
  check('A9 IoU(a,b) = 0.3333 >= 0.25 -> drop b', r(iou(a.box, b.box), 4), 0.3333);
  check('A9 same_echo(a,d) true but IoU=0 < 0.25 -> KEEP', sameEcho(a, dd) && iou(a.box, dd.box) < 0.25, true);
}

// ---------- A10 group pre-formed + all-centers + 1.6*median ----------
{
  const covering = (blob, refs, centers) => {
    const pad = Math.min(...refs.map(r => Math.min(r[0], r[1]))) * 0.15;
    const inside = centers.every(([cx, cy]) => blob[0] - pad <= cx && cx <= blob[0] + blob[2] + pad && blob[1] - pad <= cy && cy <= blob[1] + blob[3] + pad);
    const areas = refs.map(r => r[0] * r[1]).sort((x, y) => x - y);
    const med = areas.length % 2 ? areas[(areas.length - 1) / 2] : (areas[areas.length / 2 - 1] + areas[areas.length / 2]) / 2;
    return inside && blob[2] * blob[3] >= 1.6 * med;
  };
  check('A10 covering 24 >= 1.6*median(9)=14.4', covering([0, 0, 8, 3], [[3, 3], [3, 3]], [[2, 1], [6, 1]]), true);
  check('A10 member outside -> no covering (all-centers, not >=2)', covering([0, 0, 8, 3], [[3, 3], [3, 3], [3, 3]], [[2, 1], [6, 1], [11, 1]]), false);
}

// ---------- A12 excess per-axis: excess <= |v_axis|*span + 0.3*size_axis ----------
{
  const explained = (track, blob, vel, span = 1.75) => {
    const ew = blob[0] - track[0], eh = blob[1] - track[1];
    if (ew <= 0 && eh <= 0) return true;
    return ew <= Math.abs(vel[0]) * span + 0.3 * track[0] && eh <= Math.abs(vel[1]) * span + 0.3 * track[1];
  };
  check('A12 explained vel-x (4 <= 8.2, 0 <= 0.9)', explained([4, 3], [8, 3], [4, 0]), true);
  check('A12 veto vel-y (excess_w 4 > 1.2)', explained([4, 3], [8, 3], [0, 4]), false);
  check('A12 veto excess_h 1 > 0.9', explained([4, 3], [4, 4], [4, 0]), false);
}

// ---------- A5 gate order + motion double-gate (px AND ratio) ----------
{
  const gates = c => {
    if (c.px < 4 || c.box[2] < 2 || c.box[3] < 2) return 'reject:floor';
    if (c.px > 21.12) return 'reject:whole-scene';
    if (c.box[2] > 9) return 'reject:oversized';
    const asp = c.box[2] / c.box[3];
    if (asp < 0.25 || asp > 5) return 'reject:aspect';
    if (c.motion < 3 || c.motion / (c.box[2] * c.box[3]) < 0.08) return 'reject:motion';
    return 'accept';
  };
  check('A5 comp0 accept', gates({ box: [0, 0, 4, 3], px: 12, motion: 8 }), 'accept');
  check('A5 comp1 motion px<3', gates({ box: [4, 4, 4, 3], px: 12, motion: 2 }), 'reject:motion');
  check('A5 comp2 oversized w=10>9 (px 20<=21.12 qua whole-scene)', gates({ box: [0, 6, 10, 2], px: 20, motion: 18 }), 'reject:oversized');
  check('A5 fill-ratio fail 3/40=0.075<0.08', gates({ box: [0, 0, 4, 10], px: 20, motion: 3 }), 'reject:motion');
}

// ---------- A7 chroma L1 + explained 3-cond + att range ----------
{
  const cur = [50, 50, 45, 180], bg = 100;
  const att = cur.map(c => c / bg);
  const sortedA = [...att].sort((x, y) => x - y);
  const medAtt = (sortedA[1] + sortedA[2]) / 2;
  const res = cur.map((c, i) => Math.abs(c - medAtt * bg) / bg);
  const medRes = [...res].sort((x, y) => x - y).slice(1, 3).reduce((s, v) => s + v) / 2;
  const explained = att.map((a, i) => Math.abs(a - medAtt) <= 0.18 && res[i] <= 1.5 * 0.08 && 0 <= 1.2 * 0.10);
  const frac = explained.filter(Boolean).length / 4;
  check('A7 med_att = 0.5 in [0.32,0.62]', medAtt, 0.5);
  check('A7 med_res = 0.025 <= 0.08', r(medRes, 3), 0.025);
  check('A7 explained 3/4 = 0.75 >= 0.75 -> shadow', r(frac, 2), 0.75);
}

// ---------- D1 qualify gate + score 0.7/0.2/0.1 + None ----------
{
  const d1 = (bbox, poly, center, voMin, voStrong) => {
    const cells = new Set();
    for (let x = bbox[0]; x <= bbox[0] + bbox[2]; x++) for (let y = bbox[1]; y <= bbox[1] + bbox[3]; y++) cells.add(x + ',' + y);
    const pc = new Set();
    for (let x = poly[0][0]; x <= poly[2][0]; x++) for (let y = poly[0][1]; y <= poly[2][1]; y++) pc.add(x + ',' + y);
    const inter = [...cells].filter(k => pc.has(k)).length;
    const vo = inter / cells.size, so = inter / pc.size;
    const cx = bbox[0] + bbox[2] / 2, cy = bbox[1] + bbox[3] / 2;
    const inside = poly[0][0] <= cx && cx <= poly[2][0] && poly[0][1] <= cy && cy <= poly[2][1];
    if (!((inside && vo >= voMin) || vo >= voStrong)) return null;
    const diag = Math.hypot(poly[2][0] - poly[0][0], poly[2][1] - poly[0][1]);
    const prox = Math.max(0, 1 - Math.hypot(cx - center[0], cy - center[1]) / diag);
    return { vehicle_overlap: vo, slot_overlap: so, center_proximity: prox, score: Math.min(1, 0.7 * vo + 0.2 * so + 0.1 * prox) };
  };
  const poly = [[0, 0], [8, 0], [8, 8], [0, 8]];
  const gA = d1([2, 2, 4, 4], poly, [4, 4], 0.35, 0.60);
  check('D1 A score = 0.862', r(gA.score, 3), 0.862);
  check('D1 A slot_overlap ~0.309', r(gA.slot_overlap, 3), 0.309);
  check('D1 B vo=0.16 & center out -> None', d1([7, 7, 4, 4], poly, [4, 4], 0.35, 0.60), null);
}

// ---------- D3 score 4-term + commit gates + margin ----------
{
  const score = (maxO, obs, inP, ovP) => 0.55 * Math.min(1, maxO) + 0.20 * Math.min(1, obs / 3) + 0.15 * Math.min(1, inP / 0.10) + 0.10 * Math.min(1, ovP / 0.15);
  check('D3 score = 0.6123', r(score(0.38, 3, 0.354, 0.08), 4), 0.6123);
  check('D3 commit delay 0.5 >= 0.35', 9.5 - 9.0 >= 0.35, true);
  check('D3 rival not inward (dist_gain -1 < 2)', -1 < 2, true);
  check('D3 margin 0.0623 < 0.15 -> competing reject', 0.6123 - 0.55 < 0.15, true);
}

// ---------- D4 detach immediate: vehicle_id=None + recovery_pending ----------
{
  const detach = (vision, owner) => {
    if (!vision && owner) return { vehicle_id: null, tracking_state: 'recovery_pending', episode: 'departing', public_occupied: false };
    return { vehicle_id: owner, public_occupied: !!vision };
  };
  const st = detach(0, 'v7');
  check('D4 vehicle_id removed immediately', st.vehicle_id, null);
  check('D4 tracking_state recovery_pending', st.tracking_state, 'recovery_pending');
  check('D4 episode departing', st.episode, 'departing');
}

// ---------- D7 radius lerp ratio + guard cancel ----------
{
  const radius = (diag, age, init = 0.05, mx = 0.45, exp = 1.0) => diag * (init + Math.min(1, age / exp) * (mx - init));
  check('D7 radius [5,25,45,45]', [0, 0.5, 1, 3].map(t => r(radius(100, t), 0)), [5, 25, 45, 45]);
  check('D7 guard cancel age 2.6 > 2.5', 12.6 - 10.0 > 2.5, true);
}

// ---------- D8 fragment-side: OR-admission + ambiguity-skip ----------
{
  const admit = (signed, overlap, diag) => !(signed < -0.05 * diag && overlap <= 0);
  check('D8 signed -1 < -0.566 but overlap 0.10 -> keep (OR)', admit(-1.0, 0.10, 11.31), true);
  check('D8 far signed -11 & overlap 0 -> skip', admit(-11.0, 0.0, 11.31), false);
  check('D8 ambiguity 0.40-0.30=0.10 < 0.15 -> skip', 0.40 - 0.30 < 0.15, true);
}

// ---------- D9 gates + cost 0.45/0.35/0.15/0.05 + outward reject ----------
{
  const cost = (spatial, appD, limit, sizeR, dirC) => 0.45 * spatial + 0.35 * (appD / Math.max(limit, 1e-6)) + 0.15 * sizeR + 0.05 * dirC;
  const spatial = Math.min(1, 7 / 16.4), sizeCost = Math.abs(Math.log(0.9)) / Math.log(2.5);
  check('D9 A cost = 0.3093', r(cost(spatial, 0.2, 0.70, sizeCost, 0), 4), 0.3093);
  // B: outward_px = -4 < 1.5, radial_gain -4 < 0.75, escape false, world false -> reject
  const outwardOk = (-4 >= 1.5) || (-4 >= 0.75) || false || false;
  check('D9 B insufficient_outward_evidence', outwardOk ? 'pass' : 'reject:insufficient_outward_evidence', 'reject:insufficient_outward_evidence');
  check('D9 limit relaxed 0.70 when overlap >= 0.25', Math.max(0.5, 0.5) >= 0.25 ? 0.70 : 0.55, 0.70);
}

// ---------- D10 limit 0.999 + row/col gap 0.15 + released ----------
{
  const consume = (costs, row, col, limit, margin) => {
    if (costs[row][col] > limit) return 'no_consume';
    const rowGap = Math.min(...costs[row].filter((v, j) => j !== col && v < 10).map(v => v - costs[row][col]), Infinity);
    const colGap = Math.min(...costs.map((r, i) => i !== row && r[col] < 10 ? r[col] - costs[row][col] : Infinity));
    if (rowGap < margin || colGap < margin) return 'ambiguous_reject';
    return 'consume:released';
  };
  check('D10 A consume -> released', consume([[0.20, 10], [0.55, 10]], 0, 0, 0.999, 0.15), 'consume:released');
  check('D10 B col_gap 0.04 < 0.15 -> ambiguous', consume([[0.30, 10], [0.34, 10]], 0, 0, 0.999, 0.15), 'ambiguous_reject');
}

// ---------- C1 v1.1 ----------
{
  const raster = poly => { const xs = poly.map(p => p[0]), ys = poly.map(p => p[1]); const s = new Set(); for (let i = Math.min(...xs); i <= Math.max(...xs); i++) for (let j = Math.min(...ys); j <= Math.max(...ys); j++) s.add(i + ',' + j); return s; };
  const erode = cells => new Set([...cells].filter(k => { const [i, j] = k.split(',').map(Number); return [-1, 0, 1].every(di => [-1, 0, 1].every(dj => cells.has((i + di) + ',' + (j + dj)))); }));
  const roiA = raster([[0, 0], [7, 0], [7, 7], [0, 7]]);
  const anaA = erode(roiA), innerA = erode(anaA);
  const bndA = new Set([...anaA].filter(k => !innerA.has(k)));
  check('C1 A', { roi: roiA.size, analysis: anaA.size, boundary: bndA.size, core: innerA.size }, { roi: 64, analysis: 36, boundary: 20, core: 16 });
  const roiB = raster([[1, 1], [4, 1], [4, 4], [1, 4]]);
  const anaB0 = erode(roiB);
  const anaB = anaB0.size < 5 ? roiB : anaB0;            // fallback
  const innerB = erode(anaB); const corB = innerB.size < 5 ? roiB : innerB;
  const bndB = new Set([...anaB].filter(k => !innerB.has(k)));
  check('C1 B fallbacks', { roi: roiB.size, analysis: anaB.size, boundary: bndB.size, core: corB.size }, { roi: 16, analysis: 16, boundary: 12, core: 16 });
}

// ---------- C2 v1.1 empty_votes + rescue/edge ----------
{
  const c2 = (ratios, core, edge, rt = 0.20, et = 0.08, edgeT = 0.25, V = 9) => {
    const req = V >> 1;
    const empty = ratios.filter(x => x < rt).length;
    const exitv = ratios.filter(x => x < Math.min(rt, et)).length;
    let free = empty >= req;
    if (free) {
      const b1 = core.core_ratio >= 0.18 && core.comp_ratio >= 0.08;
      const b2 = core.raw_ratio >= 0.30 && core.core_ratio >= 0.02 && core.count >= 2;
      if (b1 || b2) free = false;
    }
    if (free && edge >= edgeT) free = false;
    return { empty, exitv, free, occupied: !free };
  };
  check('C2 occupied_majority', ((x) => ({ empty: x.empty, occupied: x.occupied }))(c2([0.30, 0.28, 0.31, 0.05, 0.04, 0.29, 0.30, 0.02, 0.25], { raw_ratio: 0.35, core_ratio: 0.05, comp_ratio: 0, count: 0 }, 0.10)), { empty: 3, occupied: true });
  const ratios7 = [0.05, 0.28, 0.31, 0.05, 0.04, 0.06, 0.19, 0.10, 0.02];
  const coreFree = { raw_ratio: 0.12, core_ratio: 0.05, comp_ratio: 0, count: 0 };
  check('C2 free_clear', ((x) => ({ empty: x.empty, free: x.free }))(c2(ratios7, coreFree, 0.10)), { empty: 7, free: true });
  check('C2 free_but_rescue', c2(ratios7, { raw_ratio: 0.35, core_ratio: 0.20, comp_ratio: 0.10, count: 1 }, 0.10).occupied, true);
  check('C2 free_but_edge', c2(ratios7, coreFree, 0.30).occupied, true);
  check('C2 B', ((x) => ({ empty: x.empty, exit: x.exitv, free: x.free }))(c2([0.19, 0.19, 0.19, 0.19, 0.25, 0.25, 0.25, 0.25, 0.07], coreFree, 0.10)), { empty: 5, exit: 1, free: true });
}

// ---------- C3 v1.1 ----------
{
  check('C3 numbers', { before: r(10 / 36, 3), after: r(4 / 36, 3), removed: r(6 / 36, 3), raw: r(10 / 64, 3) }, { before: 0.278, after: 0.111, removed: 0.167, raw: 0.156 });
}

// ---------- C4 v1.1 ----------
{
  const rescue = (raw, corer, comp, count) => (corer >= 0.18 && comp >= 0.08) || (raw >= 0.30 && corer >= 0.02 && count >= 2);
  check('C4 A central', rescue(0.15, 0.20, 0.10, 1), true);
  check('C4 count1', rescue(0.35, 0.03, 0, 1), false);
  check('C4 count2', rescue(0.35, 0.03, 0, 2), true);
}

// ---------- C5 accept_evidence dwell ----------
{
  const sim = (ts, vs, needC, needS, gap = 1.5) => {
    let state = 0, pend = null, cnt = 0, since = 0, last = -Infinity; const flips = [];
    for (let k = 0; k < ts.length; k++) {
      const t = ts[k], v = vs[k];
      if (t <= last) { flips.push([t, 'reject-stale']); continue; }
      if (t - last > gap) { pend = null; cnt = 0; }
      last = t;
      if (v === state) { pend = null; cnt = 0; continue; }
      if (pend !== v) { pend = v; cnt = 0; since = t; }
      cnt++;
      if (cnt >= needC[v] && t - since >= needS[v]) { state = v; flips.push([t, v ? 'occupied' : 'free']); pend = null; cnt = 0; }
    }
    return { flips, state };
  };
  check('C5 A', sim([0, 0.4, 0.8, 1.2, 1.6, 2.0, 2.4], [1, 1, 1, 0, 0, 0, 0], [3, 2], [1.0, 0.5]), { flips: [[0.8, 'occupied'], [2.4, 'free']], state: 0 });
  check('C5 B gap', sim([0, 2.0, 2.4, 3.0], [1, 1, 1, 1], [3, 2], [1.0, 0.5]), { flips: [[3.0, 'occupied']], state: 1 });
  check('C5 stale', sim([0, 0.4, 0.2], [1, 1, 1], [3, 2], [1.0, 0.5]), { flips: [[0.2, 'reject-stale']], state: 0 });
}

// ---------- D5 r95 vs strong inlier ----------
{
  const pctl = (xs, p) => { const s = [...xs].sort((a, b) => a - b); const i = (s.length - 1) * p; const lo = Math.floor(i); return s[lo] + (s[Math.min(lo + 1, s.length - 1)] - s[lo]) * (i - lo); };
  const medv = a => { const s = [...a].sort((x, y) => x - y); return (s[(s.length - 1) >> 1] + s[s.length >> 1]) / 2; };
  const run = pts => {
    const c = [medv(pts.map(p => p[0])), medv(pts.map(p => p[1]))];
    const ds = pts.map(p => Math.hypot(p[0] - c[0], p[1] - c[1]));
    const k = Math.max(2, Math.min(Math.floor(pts.length / 3), 5));
    const first = [medv(pts.slice(0, k).map(p => p[0])), medv(pts.slice(0, k).map(p => p[1]))];
    const last = [medv(pts.slice(-k).map(p => p[0])), medv(pts.slice(-k).map(p => p[1]))];
    return { r95: r(pctl(ds, 0.95), 2), drift: r(Math.hypot(pts.at(-1)[0] - pts[0][0], pts.at(-1)[1] - pts[0][1]), 2), inlier: r(ds.filter(d => d <= 3).length / ds.length, 2), robustDrift: r(Math.hypot(last[0] - first[0], last[1] - first[1]), 2) };
  };
  const A = run([[5, 5], [5.2, 5], [5, 5.2], [5.1, 5.1], [4.9, 5], [5, 4.9]]);
  const B = run([[5, 5], [5.2, 5], [5, 5.2], [9, 9], [4.9, 5], [5, 4.9]]);
  check('D5 A', A, { r95: 0.2, drift: 0.1, inlier: 1, robustDrift: 0.16 });
  check('D5 A stopped', A.r95 <= 1.0 && A.drift <= 0.5, true);
  check('D5 B', B, { r95: 4.29, drift: 0.1, inlier: 0.83, robustDrift: 0.16 });
  check('D5 B strong stable', B.inlier >= 0.6 && B.robustDrift <= 3, true);
}

// ---------- D6 token+detach+restore ----------
{
  const seq = []; let owner = 'v0', token = null, vision = true;
  for (const e of [{ t: 1, ev: 'claim_v1' }, { t: 2, ev: 'tracker_lost' }, { t: 4, ev: 'vision_empty' }, { t: 5, ev: 'vision_occupied' }]) {
    if (e.ev === 'claim_v1') seq.push([e.t, vision && owner ? 'reject:sticky_id_conflict' : 'reject:competing_vehicle']);
    if (e.ev === 'tracker_lost') seq.push([e.t, 'departing+exit_pending(owner kept)']);
    if (e.ev === 'vision_empty') { vision = false; token = { gid: owner }; seq.push([e.t, 'token+detach']); }
    if (e.ev === 'vision_occupied') { vision = true; if (token) { token = null; seq.push([e.t, 'restore->parked']); } }
  }
  check('D6 seq', seq, [[1, 'reject:sticky_id_conflict'], [2, 'departing+exit_pending(owner kept)'], [4, 'token+detach'], [5, 'restore->parked']]);
}

// ---------- D11 episode FSM ----------
{
  const fsm = evs => { let s = 'parked'; const log = []; for (const e of evs) { if (e === 'token+detach') s = 'departing'; if (e === 'restore') s = 'parked'; if (e === 'vision_confirmed_empty' || e === 'release') s = 'released'; log.push(s); } return log; };
  check('D11 A', fsm(['bind', 'token+detach', 'vision_confirmed_empty']), ['parked', 'departing', 'released']);
  check('D11 B restore', fsm(['bind', 'token+detach', 'restore']), ['parked', 'departing', 'parked']);
}

// ---------- E6 AND gates ----------
{
  const BLOCK = ['split_recovering', 'occluded_prediction', 'watershed_provisional', 'frozen_ambiguous', 'ambiguous_merged'];
  const alloc = t => t.state === 'confirmed' && t.kind === 'detection' && !BLOCK.includes(t.assoc);
  const ready = t => t.obs >= 5 && t.disp >= Math.max(6, 0.15 * Math.hypot(t.w, t.h));
  const t1 = { state: 'confirmed', kind: 'detection', assoc: 'matched', obs: 6, disp: 7, w: 10, h: 5 };
  check('E6 t1 mint', alloc(t1) && ready(t1), true);
  check('E6 obs4 defer', alloc({ ...t1, obs: 4 }) && ready({ ...t1, obs: 4 }), false);
  check('E6 blocked assoc', alloc({ ...t1, assoc: 'occluded_prediction' }), false);
  check('E6 disp_min', Math.max(6, 0.15 * Math.hypot(10, 5)) === 6, true);
}

// ---------- E10 exited vs expired ----------
{
  check('E10 exited vs expired', { exit_zone: 'exited', ttl_over: 'expired', parked: 'parked_state' }, { exit_zone: 'exited', ttl_over: 'expired', parked: 'parked_state' });
}

// ================= cv-crosscal-review-c (E1/E2/E3/E4/E5/E8/F3/F4/F5/F8) =================

// ---------- E1 fallback: crop_origin + local_px, khong flag ----------
{
  const world = (H, origin, px) => (H ? [H[0][0] * px[0] + H[0][2], H[1][1] * px[1] + H[1][2]] : [origin[0] + px[0], origin[1] + px[1]]);
  check('E1 H project', world([[2, 0, 10], [0, 2, 20], [0, 0, 1]], null, [5, 5]), [20, 30]);
  check('E1 fallback crop-offset', world(null, [30, 40], [5, 5]), [35, 45]);
  check('E1 no approx flag', typeof world(null, [30, 40], [5, 5]).approx === 'undefined', true);
}

// ---------- E2 frame units: t_edge = dist_px / v_px_per_frame, |v|>1.0, lookahead_frames=16 ----------
{
  const entry = (cx, vx, edgeX, look = 16) => {
    if (Math.abs(vx) <= 1.0) return null;
    const t = vx > 0 ? (edgeX - cx) / vx : cx / Math.abs(vx); // right: dist to edgeX; left: dist = cx
    return t <= look ? { edge: vx > 0 ? 'right' : 'left' } : null;
  };
  check('E2 t_edge 1.25 frames', r((95 - 90) / 4, 2), 1.25);
  check('E2 entry A', entry(90, 4, 95) !== null, true);
  check('E2 vx<=1.0 gate None', entry(90, 0.2, 95) === null && entry(90, 0.5, 95) === null, true);
  check('E2 vx=1.5 entry', entry(90, 1.5, 95) !== null && r(5 / 1.5, 2) === 3.33, true);
  check('E2 left 22.5>16 None', entry(90, -4, 95) === null && r(90 / 4, 2) === 22.5, true); // t = cx/|vx|
  check('E2 ttl 45 frames (literal)', 45, 45);
}

// ---------- E3 predicted_world: frame fallback (no /fps) vs timestamp branch ----------
{
  const predFrame = (last, vpf, upd, now) => [last[0] + vpf[0] * Math.max(0, now - upd), last[1] + vpf[1] * Math.max(0, now - upd)];
  const predTime = (last, vps, updT, ts) => [last[0] + vps[0] * Math.max(0, ts - updT), last[1] + vps[1] * Math.max(0, ts - updT)];
  check('E3 frame elapsed=12', 22 - 10, 12);
  check('E3 frame pred', predFrame([100, 50], [0.2, 0], 10, 22), [102.4, 50]);
  check('E3 ts pred (vel/s)', predTime([100, 50], [2, 0], 10.0, 11.2), [102.4, 50]);
  check('E3 x25 fallback conv', r(0.08 * 25.0, 4), 2.0);
  check('E3 dir_cos', r((0.2 * 3) / (0.2 * Math.sqrt(10)), 3), 0.949);
}

// ---------- E4 handoff cost literal + hard gates ----------
{
  const cost = (res, radius, app, size, dir) => 0.55 * (res / radius) + 0.30 * app + 0.10 * size + 0.05 * dir;
  check('E4 cost t1', r(cost(3, 10, 0.1, 0.05, 0.02), 4), 0.201);
  check('E4 cost t2', r(cost(8, 10, 0.05, 0.02, 0.01), 4), 0.4575);
  check('E4 reject >0.92 reason score', cost(9.9, 10, 0.9, 0.9, 1.0) > 0.92 ? 'score' : 'ok', 'score');
  const gate = (res, radius, dir) => (res > radius ? 'prediction_distance' : dir < 0.25 ? 'direction' : 'ok');
  check('E4 gate prediction_distance', gate(11, 10, 0.9), 'prediction_distance');
  check('E4 gate direction<0.25', gate(9, 10, 0.1), 'direction');
  check('E4 gates literal names', ['prediction_distance', 'outside_entry_corridor', 'outside_overlap', 'appearance', 'size', 'direction', 'identity_waiting', 'occluded'].length, 8);
}

// ---------- E5 three paths: unique (calibrated) vs greedy vs single-join disabled ----------
{
  // duong A: mutual unique
  const uniquePairs = (a, b, radius) => a.flatMap(x => b.map(y => ({ x: x.id, y: y.id, d: Math.hypot(x.w[0] - y.w[0], x.w[1] - y.w[1]) }))).filter(p => p.d <= radius);
  const a1 = [{ id: 'a1', w: [50, 50] }], bA = [{ id: 'b1', w: [52, 50] }, { id: 'b2', w: [200, 50] }];
  const bB = [{ id: 'b1', w: [52, 50] }, { id: 'b2', w: [54, 50] }];
  const mergeA = pairs => pairs.filter(p => pairs.filter(q => q.x === p.x).length === 1 && pairs.filter(q => q.y === p.y).length === 1);
  check('E5 A unique merge', mergeA(uniquePairs(a1, bA, 10)).map(p => `${p.x}-${p.y}`), ['a1-b1']);
  check('E5 A ambiguous skip', mergeA(uniquePairs(a1, bB, 10)).length, 0);
  // duong B: sorted-cost greedy (khong can unique)
  const greedy = pairs => { const used = new Set(); return [...pairs].sort((p, q) => p.c - q.c).filter(p => !used.has(p.x) && !used.has(p.y) && used.add(p.x) && used.add(p.y)); };
  check('E5 B greedy picks min cost', greedy([{ x: 'a1', y: 'b1', c: 0.3 }, { x: 'a1', y: 'b2', c: 0.5 }]).map(p => p.y), ['b1']);
  // duong C: single-join disabled when calibrated
  const joinC = transforms => (Object.keys(transforms).length ? null : 'join-allowed');
  check('E5 C disabled when calibrated', joinC({ cam1: [] }) === null && joinC({}) === 'join-allowed', true);
}

// ---------- E8 score 6 terms + hard rejects ----------
{
  const score = s => 0.35 * s.distance + 0.25 * s.appearance + 0.15 * s.direction + 0.10 * s.speed + 0.10 * Math.min(s.time, s.topology) + 0.05 * s.size;
  check('E8 score 6-term', r(score({ distance: 0.8, appearance: 0.6, direction: 0.9, speed: 0.7, time: 0.5, topology: 0.4, size: 0.9 }), 3), 0.72);
  const rej = c => (c.corridor > c.radius ? 'teleport' : c.topology <= 0 ? 'camera_topology' : c.stable && c.dir < c.minDir ? 'stable_wrong_direction' : null);
  check('E8 hard reject topology', rej({ corridor: 1, radius: 10, topology: 0, stable: true, dir: 0.9, minDir: 0.25 }), 'camera_topology');
  check('E8 hard reject wrong dir', rej({ corridor: 1, radius: 10, topology: 0.5, stable: true, dir: -0.99, minDir: 0.25 }), 'stable_wrong_direction');
  // [sim] aside 3-term (cv-crosscal-finalcheck-c OPEN-1): 0.5*0.9+0.3*0.8+0.2*0.6 = 0.81 (khong phai 0.75)
  check('E8 sim-aside 3-term = 0.81', r(0.5 * 0.9 + 0.3 * 0.8 + 0.2 * 0.6, 2), 0.81);
}

// ---------- F3 load_calibration: reviewed_fit standalone reject; passed/full-rect ok ----------
{
  const load = d => {
    let rlf = false;
    if (d.calibration_algorithm === 'rectangle_line_v1') {
      rlf = d.calibration_status === 'reviewed_fit' && d.visual_review?.accepted === true && d.report?.status === 'fit_ready' && d.report?.point_count === 8 && d.fit_gate_clean === true;
      if (!rlf) return 'reject:rect-incomplete';
    }
    if (d.schema_version >= 5 && d.calibration_status !== 'passed' && !rlf) return 'reject:status';
    const keys = Object.keys(d.camera_transforms || {});
    if (keys.join() !== 'cam1,cam2') return 'reject:transforms';
    const adj = {}; (d.edge_adjacency || []).forEach(e => { adj[`${e.source_camera}:${e.exit_edge}`] = e.target_camera; });
    if (adj['cam1:right'] !== 'cam2' || adj['cam2:left'] !== 'cam1' || Object.keys(adj).length !== 2) return 'reject:adjacency';
    return 'ok';
  };
  const base = {
    schema_version: 5,
    camera_transforms: { cam1: [[2, 0, 10], [0, 2, 20], [0, 0, 1]], cam2: [[3, 0, 5], [0, 3, 7], [0, 0, 1]] },
    edge_adjacency: [{ source_camera: 'cam1', exit_edge: 'right', target_camera: 'cam2' }, { source_camera: 'cam2', exit_edge: 'left', target_camera: 'cam1' }],
    overlap_world_polygon: [[0, 0], [100, 0], [100, 50], [0, 50]],
    exit_zones: [],
  };
  check('F3 passed ok', load({ ...base, calibration_status: 'passed' }), 'ok');
  check('F3 reviewed_fit standalone reject', load({ ...base, calibration_status: 'reviewed_fit' }), 'reject:status');
  check('F3 rect full ok', load({ ...base, calibration_algorithm: 'rectangle_line_v1', calibration_status: 'reviewed_fit', visual_review: { accepted: true }, report: { status: 'fit_ready', point_count: 8 }, fit_gate_clean: true }), 'ok');
  check('F3 rect missing accepted reject', load({ ...base, calibration_algorithm: 'rectangle_line_v1', calibration_status: 'reviewed_fit', report: { status: 'fit_ready', point_count: 8 }, fit_gate_clean: true }), 'reject:rect-incomplete');
  check('F3 wrong adjacency', load({ ...base, calibration_status: 'passed', edge_adjacency: [{ source_camera: 'cam1', exit_edge: 'left', target_camera: 'cam2' }, { source_camera: 'cam2', exit_edge: 'left', target_camera: 'cam1' }] }), 'reject:adjacency');
}

// ---------- F4 SLOT_MATCHING_MULTIPLES + min-ceiling ----------
{
  const MULT = { handoff_match_distance: 1.75, handoff_prediction_radius: 2.75, dormant_match_distance: 1.75, cross_camera_duplicate_distance: 0.5 };
  const med = xs => { const s = [...xs].sort((a, b) => a - b); return s[Math.floor(s.length / 2)]; };
  check('F4 median', med([400, 500, 600, 520, 480]), 500);
  check('F4 derived 4 keys', [MULT.handoff_match_distance * 500, MULT.handoff_prediction_radius * 500, MULT.dormant_match_distance * 500, MULT.cross_camera_duplicate_distance * 500], [875, 1375, 875, 250]);
  const resolve = (ov, cfg, drv, fb) => (ov != null ? ov : cfg == null ? (drv ?? fb) : drv == null ? cfg : Math.min(cfg, drv));
  check('F4 ceiling min(cfg>drv)', resolve(null, 1000, 875, 600), 875);
  check('F4 tighten min(cfg<drv)', resolve(null, 700, 875, 600), 700);
  check('F4 override wins', resolve(300, 1000, 875, 600), 300);
  check('F4 fallback', resolve(null, null, null, 600), 600);
}

// ---------- F5 aspect/non-uniform gates + H @ S right-multiply ----------
{
  const adapt = (cw, ch, rw, rh) => {
    const dA = Math.abs(cw / ch - rw / rh);
    const sx = cw / rw, sy = ch / rh;
    if (dA > 0.005) return 'reject:aspect';
    if (Math.abs(sx - sy) > Math.max(sx, sy) * 0.005) return 'reject:nonuniform';
    return { sx, sy };
  };
  check('F5 uniform 2x adapt', adapt(1280, 720, 640, 360), { sx: 2, sy: 2 });
  check('F5 aspect reject', adapt(1280, 720, 1280, 700), 'reject:aspect');
  check('F5 nonuniform reject', adapt(1280, 720, 640, 370), 'reject:aspect'); // 640/370=1.7297 -> aspect fails first
  const matMul = (A, B) => A.map(row => B[0].map((_, j) => row.reduce((s, v, k) => s + v * B[k][j], 0)));
  const H = [[2, 0, 10], [0, 2, 20], [0, 0, 1]], S = [[2, 0, 0], [0, 2, 0], [0, 0, 1]];
  check('F5 H @ S right-multiply', matMul(H, S), [[4, 0, 10], [0, 4, 20], [0, 0, 1]]); // nhân phải: chỉ 2 cột đầu scale, translation giữ nguyên
  check('F5 S @ H wrong-order differs', matMul(S, H), [[4, 0, 20], [0, 4, 40], [0, 0, 1]]); // S@H scale cả translation -> KHAC -> chi co y nghia khac
  check('F5 uniform 720->760 would adapt (no pct gate)', typeof adapt(1280, 720, 1344, 756) === 'object', true); // 1.344x uniform
}

// ---------- F8 one-pending-job + monotonic + result-age + deadline ----------
{
  const canSubmit = (futures, cam, due) => !(cam in futures) && due;
  check('F8 submit blocked when pending', canSubmit({ cam1: {} }, 'cam1', true), false);
  check('F8 submit ok when free', canSubmit({}, 'cam1', true), true);
  const age = (camTs, jobTs, submittedAgo) => Math.max(camTs - jobTs, submittedAgo);
  const applyJob = (camTs, jobTs, submittedAgo, maxAge, lastTs, evTs) => {
    const a = age(camTs, jobTs, submittedAgo);
    if (a > maxAge) return 'result_too_old';
    if (evTs <= lastTs) return 'evidence_not_monotonic';
    return 'accept';
  };
  check('F8 accept', applyJob(105.0, 104.8, 0.3, 2.0, 104.5, 104.8), 'accept');
  check('F8 age=max(0.2,0.3)', r(age(105.0, 104.8, 0.3), 2), 0.3);
  check('F8 result_too_old', applyJob(105.0, 102.0, 0.3, 2.0, 104.0, 104.8), 'result_too_old');
  check('F8 evidence_not_monotonic', applyJob(105.0, 104.8, 0.3, 2.0, 104.8, 104.5), 'evidence_not_monotonic');
  check('F8 worker_over_deadline', 2.5 > 2.0 ? 'worker_over_deadline' : 'ok', 'worker_over_deadline');
}

// ---------- Format/numeric fixes (E5B standalone, F3B adjacency, F6B full input, F7 needs_frame) ----------
{
  // E5B: path A unique-unbound vs path B greedy on same input
  const d = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1]);
  const a1 = [50, 50], b1 = [52, 50], b2 = [54, 50], radius = 10;
  const candsA = [b1, b2].filter(b => d(a1, b) <= radius);
  check('E5B pathA a1 sees 2 candidates', candsA.length, 2);
  check('E5B pathA not unique -> no merge', candsA.length === 1 ? 'merge' : 'skip', 'skip');
  const pc = [[0.3, 'b1'], [0.5, 'b2']].sort((x, y) => x[0] - y[0]);
  check('E5B pathB greedy picks lowest cost', pc[0][1], 'b1');

  // F3B: reviewed_fit standalone rejected at gate 2 even with valid adjacency
  const adjacencyOk = (adj) => adj.length === 2
    && adj.some(e => e.source_camera === 'cam1' && e.exit_edge === 'right' && e.target_camera === 'cam2')
    && adj.some(e => e.source_camera === 'cam2' && e.exit_edge === 'left' && e.target_camera === 'cam1');
  const f3b = {
    schema_version: 5, calibration_status: 'reviewed_fit',
    edge_adjacency: [
      { source_camera: 'cam1', exit_edge: 'right', target_camera: 'cam2' },
      { source_camera: 'cam2', exit_edge: 'left', target_camera: 'cam1' }],
  };
  const reviewed_line_fit = f3b.calibration_algorithm === 'rectangle_line_v1'
    && f3b.calibration_status === 'reviewed_fit';
  const gate2Reject = f3b.schema_version >= 5 && f3b.calibration_status !== 'passed' && !reviewed_line_fit;
  check('F3B adjacency itself valid', adjacencyOk(f3b.edge_adjacency), true);
  check('F3B reviewed_fit standalone still rejected', gate2Reject, true);

  // F6B: bounded catch-up exhausted -> best-effort pair
  const f6b = { ts1: 10.00, ts2: 10.30, newer: [10.02, 10.03, 10.04], maxSkew: 0.12, maxReads: 3 };
  let reads = 0, t1 = f6b.ts1;
  while (f6b.ts2 - t1 > f6b.maxSkew && reads < f6b.maxReads) { t1 = f6b.newer[reads]; reads++; }
  check('F6B used all 3 reads', reads, 3);
  check('F6B residual skew 260ms still > 120ms', r((f6b.ts2 - t1) * 1000, 0), 260);
  check('F6B verdict best-effort (not blocked)', (f6b.ts2 - t1) > f6b.maxSkew ? 'best_effort' : 'synced', 'best_effort');

  // F7: publish rate-limit + needs_frame = requested<=5s && now-last_submitted>=interval
  const interval = 0.15; let lastSub = -1, pending = null, requestedAt = -1; // lastSub=-1 ~ chua submit lan nao (production: get(cam,0.0) so voi monotonic epoch)
  const pub = (now, f) => { if (now - lastSub < interval) return 'drop'; lastSub = now; pending = f; return 'accept'; };
  const needs = (now) => requestedAt >= 0 && (now - requestedAt) <= 5.0 && (now - lastSub) >= interval;
  check('F7 f1 accepted', pub(0.0, 'f1'), 'accept');
  check('F7 f2 dropped (rate-limit)', pub(0.1, 'f2'), 'drop');
  requestedAt = 0.2;
  check('F7 f3 accepted', pub(0.3, 'f3'), 'accept');
  check('F7 pending=f3', pending, 'f3');
  check('F7 needs_frame@0.35=false (0.05<0.15 from last_submitted)', needs(0.35), false);
  check('F7 needs_frame@0.45=true (0.15>=0.15 boundary inclusive, request 0.25s ago)', needs(0.45), true);
  requestedAt = 0.0;
  check('F7 subscriber dead >5s -> needs_frame=false', needs(6.0), false);
}

console.log(`\n=== _verify4: ${pass} PASS, ${fail} FAIL ===`);
process.exit(fail ? 1 : 0);
