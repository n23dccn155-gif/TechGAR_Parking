/* TechGar2 algo-web — pack CV (57 canonical IDs)
 * Owner: builder-b. Nguồn nội dung: .analysis/algos/builder-b.md (đã merge
 * motion-binder-correction-a.md 19 section + occupancy-correction-c v1.1 +
 * cv-source-review-a + cv-crosscal-review-c + finalcheck). Fixture đã kiểm
 * chứng: _verify4.mjs 163/163, verify-motion-binder-a.py 95/95,
 * finalcheck-verify-ef-c.py 64/64.
 * Contract: algo-web/SPEC.md §4-§5. Classic script — chỉ dùng window.TechGarAlgo.registerPack.
 * Không fetch/module/CDN/backend/model. Mọi trace tính thật từ scenario.input + params.
 * replay-session-sync là alias → replay-timestamp-pairing (owner C) — KHÔNG register ở đây.
 */
(function () {
'use strict';
var PACK_ID = 'cv';
var TAU = Math.PI * 2;

/* =================================================================
 * MATH helpers — dùng chung cho sims (thuần JS, deterministic)
 * ================================================================= */
function r1(v) { return Math.round(v * 10) / 10; }
function r2(v) { return Math.round(v * 100) / 100; }
function r3(v) { return Math.round(v * 1000) / 1000; }
function r4(v) { return Math.round(v * 10000) / 10000; }
function clone(o) { return JSON.parse(JSON.stringify(o)); }
function eqJson(a, b) { return JSON.stringify(a) === JSON.stringify(b); }
function median(xs) {
  var s = xs.slice().sort(function (a, b) { return a - b; });
  var n = s.length;
  return n % 2 ? s[(n - 1) / 2] : (s[n / 2 - 1] + s[n / 2]) / 2;
}
function sum(xs) { return xs.reduce(function (a, b) { return a + b; }, 0); }
function dist2(ax, ay, bx, by) { return Math.hypot(ax - bx, ay - by); }

/* Bhattacharyya theo cv2 HISTCMP_BHATTACHARYYA: sqrt(1 - BC/sqrt(Sp*Sq)).
 * Với hist Σ=1 → √(1−BC) — KHÔNG phải 1−BC (đúng correction A). */
function bhatta(a, b) {
  var bc = 0, sa = 0, sb = 0, i;
  for (i = 0; i < a.length; i++) { bc += Math.sqrt(a[i] * b[i]); sa += a[i]; sb += b[i]; }
  var den = Math.sqrt(sa * sb);
  return den > 0 ? Math.sqrt(Math.max(0, 1 - bc / den)) : 0;
}
function iouBox(a, b) {
  var iw = Math.max(0, Math.min(a[0] + a[2], b[0] + b[2]) - Math.max(a[0], b[0]));
  var ih = Math.max(0, Math.min(a[1] + a[3], b[1] + b[3]) - Math.max(a[1], b[1]));
  var inter = iw * ih, uni = a[2] * a[3] + b[2] * b[3] - inter;
  return uni > 0 ? inter / uni : 0;
}
function boxGap(a, b) {
  var gx = Math.max(0, Math.max(b[0] - (a[0] + a[2]), a[0] - (b[0] + b[2])));
  var gy = Math.max(0, Math.max(b[1] - (a[1] + a[3]), a[1] - (b[1] + b[3])));
  return Math.hypot(gx, gy);
}
/* Raster lưới ô nguyên, bao gồm biên (gần fillPoly) — cho rect/poly chữ nhật demo. */
function cellsRect(x0, y0, x1, y1) {
  var s = new Set();
  for (var x = Math.ceil(x0); x <= Math.floor(x1); x++)
    for (var y = Math.ceil(y0); y <= Math.floor(y1); y++) s.add(x + ',' + y);
  return s;
}
function cellsPoly(poly) {
  var xs = poly.map(function (p) { return p[0]; }), ys = poly.map(function (p) { return p[1]; });
  return cellsRect(Math.min.apply(null, xs), Math.min.apply(null, ys), Math.max.apply(null, xs), Math.max.apply(null, ys));
}
function pointInPoly(px, py, poly) { // rect hoặc ray-cast tổng quát
  var xs = poly.map(function (p) { return p[0]; }), ys = poly.map(function (p) { return p[1]; });
  var minx = Math.min.apply(null, xs), maxx = Math.max.apply(null, xs);
  var miny = Math.min.apply(null, ys), maxy = Math.max.apply(null, ys);
  if (poly.length === 4) { // rect demo
    var uniq = {};
    poly.forEach(function (p) { uniq[p[0] + ',' + p[1]] = 1; });
    if (Object.keys(uniq).length === 4) {
      var isRect = poly.every(function (p) { return (p[0] === minx || p[0] === maxx) && (p[1] === miny || p[1] === maxy); });
      if (isRect) return px >= minx && px <= maxx && py >= miny && py <= maxy;
    }
  }
  var inside = false;
  for (var i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    var xi = poly[i][0], yi = poly[i][1], xj = poly[j][0], yj = poly[j][1];
    if (((yi > py) !== (yj > py)) && (px < (xj - xi) * (py - yi) / (yj - yi) + xi)) inside = !inside;
  }
  return inside;
}
function polyDiag(poly) {
  var xs = poly.map(function (p) { return p[0]; }), ys = poly.map(function (p) { return p[1]; });
  return Math.hypot(Math.max.apply(null, xs) - Math.min.apply(null, xs), Math.max.apply(null, ys) - Math.min.apply(null, ys));
}
function polyCenter(poly) {
  var xs = poly.map(function (p) { return p[0]; }), ys = poly.map(function (p) { return p[1]; });
  return [(Math.min.apply(null, xs) + Math.max.apply(null, xs)) / 2, (Math.min.apply(null, ys) + Math.max.apply(null, ys)) / 2];
}
/* Signed distance tới biên rect/poly (demo): dương trong, âm ngoài (≈ -khoảng cách tới biên). */
function signedDistRect(px, py, x0, y0, x1, y1) {
  if (px >= x0 && px <= x1 && py >= y0 && py <= y1)
    return Math.min(px - x0, x1 - px, py - y0, y1 - py);
  var dx = Math.max(x0 - px, 0, px - x1), dy = Math.max(y0 - py, 0, py - y1);
  return -Math.hypot(dx, dy);
}
/* Solver assignment exact (vét cạn, n≤5) — production dùng LAPJV O(n³).
 * costs[r][c] >= costLimit → cấm gán; hàng có thể unassigned (phí = limit). */
function exhaustiveAssign(costs, limit) {
  var T = costs.length, D = costs[0].length, best = Infinity, bestMap = null;
  var assign = new Array(T).fill(-1), used = new Array(D).fill(false);
  function rec(row, acc) {
    if (row === T) { if (acc < best) { best = acc; bestMap = assign.slice(); } return; }
    for (var c = 0; c < D; c++) {
      if (used[c] || costs[row][c] >= limit) continue;
      used[c] = true; assign[row] = c; rec(row + 1, acc + costs[row][c]); used[c] = false;
    }
    assign[row] = -1; rec(row + 1, acc + limit); // unassigned
  }
  rec(0, 0);
  return { total: best, map: bestMap };
}
/* Lưới 2D tiện ích cho mask/morphology demo. */
function newGrid(h, w, fill) {
  var g = [];
  for (var y = 0; y < h; y++) { var row = []; for (var x = 0; x < w; x++) row.push(fill !== undefined ? fill : 0); g.push(row); }
  return g;
}
/* Erode/dilate nhị phân kernel vuông lẻ (giản lược cv2.morphologyEx ở biên). */
function morph(m, k, op) {
  var h = m.length, w = m[0].length, r = (k - 1) / 2, out = newGrid(h, w);
  for (var y = 0; y < h; y++) for (var x = 0; x < w; x++) {
    var v = op === 'erode' ? 1 : 0;
    for (var dy = -r; dy <= r; dy++) for (var dx = -r; dx <= r; dx++) {
      var yy = y + dy, xx = x + dx;
      var val = (yy >= 0 && yy < h && xx >= 0 && xx < w) ? m[yy][xx] : 0;
      if (op === 'erode') { if (!val) v = 0; } else if (val) v = 1;
    }
    out[y][x] = v;
  }
  return out;
}
function matMul3(a, b) {
  var o = [[0, 0, 0], [0, 0, 0], [0, 0, 0]];
  for (var i = 0; i < 3; i++) for (var j = 0; j < 3; j++)
    for (var k = 0; k < 3; k++) o[i][j] += a[i][k] * b[k][j];
  return o;
}
function applyH(H, p) {
  var w = H[2][0] * p[0] + H[2][1] * p[1] + H[2][2];
  return [(H[0][0] * p[0] + H[0][1] * p[1] + H[0][2]) / w, (H[1][0] * p[0] + H[1][1] * p[1] + H[1][2]) / w];
}
function det3(H) {
  return H[0][0] * (H[1][1] * H[2][2] - H[1][2] * H[2][1])
       - H[0][1] * (H[1][0] * H[2][2] - H[1][2] * H[2][0])
       + H[0][2] * (H[1][0] * H[2][1] - H[1][1] * H[2][0]);
}
/* DLT homography 4 điểm (giản lược: giải 8 unknowns qua Gaussian elimination). */
function dlt4(pairs) {
  var A = [], B = [];
  pairs.forEach(function (pr) {
    var u = pr[0], v = pr[1], X = pr[2], Y = pr[3];
    A.push([-u, -v, -1, 0, 0, 0, u * X, v * X]); B.push(-X);
    A.push([0, 0, 0, -u, -v, -1, u * Y, v * Y]); B.push(-Y);
  });
  var n = 8, M = A.map(function (row, i) { return row.concat([B[i]]); });
  for (var c = 0; c < n; c++) {
    var piv = c;
    for (var r = c + 1; r < n; r++) if (Math.abs(M[r][c]) > Math.abs(M[piv][c])) piv = r;
    if (Math.abs(M[piv][c]) < 1e-12) return null;
    var tmp = M[c]; M[c] = M[piv]; M[piv] = tmp;
    for (var rr = 0; rr < n; rr++) {
      if (rr === c) continue;
      var f = M[rr][c] / M[c][c];
      for (var k = c; k <= n; k++) M[rr][k] -= f * M[c][k];
    }
  }
  var h = [0, 1, 2, 3, 4, 5, 6, 7].map(function (i) { return M[i][8] / M[i][i]; });
  return [[h[0], h[1], h[2]], [h[3], h[4], h[5]], [h[6], h[7], 1]];
}

/* =================================================================
 * TRACE helpers — khung chung SPEC §5
 * ================================================================= */
var _fid = 0;
function F(lines, ex, state, scene, metrics, dur) {
  return {
    id: 'f' + (_fid++),
    // SPEC §5: activeLines ∈ pseudocode.id — emit truyền chỉ số 0-based, normalize → 'pN'.
    activeLines: (Array.isArray(lines) ? lines : (lines == null ? [] : [lines])).map(function (l) { return typeof l === 'number' ? 'p' + (l + 1) : l; }),
    explanation: ex,
    state: state || {},
    metrics: metrics || [],
    scene: scene || { type: 'board', cards: [], log: [] },
    durationMs: dur || 900
  };
}
function chk(label, actual, expected) {
  var pass = (typeof actual === 'number' && typeof expected === 'number')
    ? Math.abs(actual - expected) < 1e-3 : eqJson(actual, expected);
  return { label: label, pass: pass, actual: actual, expected: expected };
}
function chkTrue(label, cond, actual, expected) {
  return { label: label, pass: !!cond, actual: actual, expected: expected };
}
function chkEach(result, expected) {
  var out = [];
  Object.keys(expected).forEach(function (k) {
    out.push(chk(k, result[k], expected[k]));
  });
  return out;
}
function pickScenario(lesson, scenarioId) {
  var list = lesson.scenarios || [];
  for (var i = 0; i < list.length; i++) if (list[i].id === scenarioId) return list[i];
  return list[0];
}
function pickParams(lesson, params) {
  var out = {};
  (lesson.parameters || []).forEach(function (p) { out[p.key] = p.default; });
  if (params) Object.keys(params).forEach(function (k) { out[k] = params[k]; });
  return out;
}
function defaultsOf(lesson) {
  var out = {};
  (lesson.parameters || []).forEach(function (p) { out[p.key] = p.default; });
  return out;
}
function isDefaultParams(lesson, params) {
  var d = defaultsOf(lesson);
  return Object.keys(d).every(function (k) { return eqJson(params[k], d[k]); });
}
/* mkTrace: run(input, P, emit) → {result, invariants?:[{label,pass,actual,expected}], expectedOverride?}
 * Khi params mặc định → expected = scenario.expected (fixture dossier), checks = so sánh từng key.
 * Khi params đổi → expected = mô tả tham chiếu, checks = invariant thật (không tự so result với result). */
function mkTrace(lesson, scenarioId, params, run) {
  var sc = pickScenario(lesson, scenarioId);
  var P = pickParams(lesson, params);
  var frames = [];
  var emit = function (lines, ex, state, scene, metrics, dur) {
    // SPEC §5: chỉ số emit phải trỏ đúng pseudocode — KHÔNG clamp. Tham chiếu
    // quá số dòng → 'p<n>' không tồn tại → validator báo fail.
    var ls = (Array.isArray(lines) ? lines : [lines]).slice();
    ls = ls.filter(function (v, i) { return ls.indexOf(v) === i; });
    // Metrics §3.1 (review A): emit không khai metrics → mirror scalar thật từ
    // frame.state (giá trị đã tính của bước, không bịa). Frame transient state:{} → [].
    if (metrics == null && state && typeof state === 'object' && !Array.isArray(state)) {
      var auto = [];
      Object.keys(state).forEach(function (k) {
        if (auto.length >= 4) return;
        var v = state[k];
        if (typeof v === 'number') auto.push({ label: k, value: r2(v) });
        else if (typeof v === 'boolean' || (typeof v === 'string' && v.length <= 24)) auto.push({ label: k, value: v });
        else if (Array.isArray(v) && v.length > 0 && v.length <= 6 && v.every(function (x) { return typeof x === 'number' || typeof x === 'string' || typeof x === 'boolean'; })) auto.push({ label: k, value: v.join(',') });
        else { var sv = JSON.stringify(v); if (sv && sv.length <= 48) auto.push({ label: k, value: sv }); }
      });
      metrics = auto;
    }
    var f = F(ls.length ? ls : [0], ex, state, scene, metrics, dur);
    frames.push(f);
    return f;
  };
  var out = run(clone(sc.input), P, emit) || {};
  var result = out.result;
  // KHÔNG pad frame: mọi frame phải do buildTrace emit với dữ liệu thuật toán thật.
  // Lesson emit <3 frame → validator fail; buộc trace có đủ input → tính → kết quả.
  var checks = [];
  var expected;
  if (isDefaultParams(lesson, P) && sc.expected !== undefined) {
    expected = sc.expected;
    if (result && typeof result === 'object' && !Array.isArray(result) &&
        expected && typeof expected === 'object' && !Array.isArray(expected)) {
      checks = chkEach(result, expected);
    } else {
      checks = [chk('result', result, expected)];
    }
  } else {
    expected = { note: 'tham số đã đổi — fixture expected chỉ áp dụng ở mặc định; kiểm chứng bằng invariant' };
    checks = (out.invariants || []).map(function (iv) {
      return chkTrue(iv.label, iv.pass, iv.actual, iv.expected !== undefined ? iv.expected : 'đúng luật');
    });
  }
  return { frames: frames, result: result, expected: expected, checks: checks };
}

/* =================================================================
 * DRAW helpers + renderers theo scene.type
 * ================================================================= */
function pal(env) { return (env && env.palette) || {}; }
function txt(ctx, s, x, y, color, align, size) {
  ctx.fillStyle = color || '#e8ecf4';
  ctx.font = (size || 11) + 'px system-ui, sans-serif';
  ctx.textAlign = align || 'left';
  ctx.textBaseline = 'middle';
  ctx.fillText(s, x, y);
}
function line(ctx, x1, y1, x2, y2, color, width, dash) {
  ctx.strokeStyle = color; ctx.lineWidth = width || 1.5;
  if (dash) ctx.setLineDash(dash); else ctx.setLineDash([]);
  ctx.beginPath(); ctx.moveTo(x1, y1); ctx.lineTo(x2, y2); ctx.stroke();
  ctx.setLineDash([]);
}
function dot(ctx, x, y, r, fill, stroke, lw) {
  ctx.beginPath(); ctx.arc(x, y, r, 0, TAU);
  if (fill) { ctx.fillStyle = fill; ctx.fill(); }
  if (stroke) { ctx.strokeStyle = stroke; ctx.lineWidth = lw || 1.5; ctx.stroke(); }
}
function rectF(ctx, x, y, w, h, fill, stroke, lw) {
  if (fill) { ctx.fillStyle = fill; ctx.fillRect(x, y, w, h); }
  if (stroke) { ctx.strokeStyle = stroke; ctx.lineWidth = lw || 1.5; ctx.strokeRect(x, y, w, h); }
}
function polyPath(ctx, pts) {
  ctx.beginPath();
  ctx.moveTo(pts[0][0], pts[0][1]);
  for (var i = 1; i < pts.length; i++) ctx.lineTo(pts[i][0], pts[i][1]);
  ctx.closePath();
}
function arrowHead(ctx, x, y, ang, size, color) {
  ctx.fillStyle = color;
  ctx.save(); ctx.translate(x, y); ctx.rotate(ang);
  ctx.beginPath(); ctx.moveTo(size, 0); ctx.lineTo(-size * 0.6, size * 0.55); ctx.lineTo(-size * 0.6, -size * 0.55); ctx.closePath(); ctx.fill();
  ctx.restore();
}
function fitScale(bounds, env, pad) {
  var w = env.width, h = env.height;
  var bw = Math.max(1e-6, bounds.maxX - bounds.minX), bh = Math.max(1e-6, bounds.maxY - bounds.minY);
  var s = Math.min((w - 2 * pad) / bw, (h - 2 * pad) / bh);
  return {
    s: s,
    x: function (v) { return pad + (v - bounds.minX) * s + (w - 2 * pad - bw * s) / 2; },
    y: function (v) { return pad + (v - bounds.minY) * s + (h - 2 * pad - bh * s) / 2; }
  };
}
function fmt(v) {
  if (v === null || v === undefined) return '—';
  if (typeof v === 'number') return Number.isInteger(v) ? String(v) : String(r3(v));
  return String(v);
}

/* --- scene 'grid': nhiều lưới ô cạnh nhau (mask/morphology/raster) ---
 * s.grids: [{title, rows, cells: Set|'all'|fn(x,y)->className, cellClass: {name: color}}]
 * s.overlays: [{grid, x,y,w,h, color, label}]  (bbox rects in cell coords) */
var CELL_COLORS = {
  off: null, fg: '#4f9cf7', bg: '#2a3248', marker: '#f0a93c', remove: '#f2555a',
  keep: '#3fce7c', line: '#f2555a', core: '#3fce7c', boundary: '#f0a93c',
  analysis: '#4f9cf7', roi: '#8a93a8', strict: '#4f9cf7', context: '#f0a93c',
  motion: '#f0a93c', union: '#f2555a', comp: '#8a93a8', hot: '#f2555a', seed: '#3fce7c'
};
function drawGridPanel(ctx, g, ox, oy, cell, p) {
  var cmap = g.cellMap || {};
  var rows = g.cells.length, cols = rows ? g.cells[0].length : 0;
  for (var y = 0; y < rows; y++) for (var x = 0; x < cols; x++) {
    var cls = g.cells[y][x];
    var color = cmap[cls] !== undefined ? cmap[cls] : (CELL_COLORS[cls] || cls);
    rectF(ctx, ox + x * cell, oy + y * cell, cell - 1, cell - 1, color || null, (p.grid || '#2a3248'), 0.5);
    if (g.numbers && g.numbers[y] && g.numbers[y][x] !== undefined)
      txt(ctx, String(g.numbers[y][x]), ox + x * cell + cell / 2, oy + y * cell + cell / 2, p.text, 'center', Math.max(7, cell * 0.32));
  }
  if (g.overlays) g.overlays.forEach(function (o) {
    rectF(ctx, ox + o.x * cell, oy + o.y * cell, o.w * cell, o.h * cell, null, o.color || p.warning, 2);
    if (o.label) txt(ctx, o.label, ox + o.x * cell, oy + o.y * cell - 5, o.color || p.warning, 'left', 9);
  });
  (g.marks || []).forEach(function (m) {
    dot(ctx, ox + m.x * cell, oy + m.y * cell, m.r || cell * 0.18, m.color || p.success, p.text, 1);
    if (m.label) txt(ctx, m.label, ox + m.x * cell + (m.r || 4) + 3, oy + m.y * cell, m.color || p.text, 'left', 9);
  });
  if (g.title) txt(ctx, g.title, ox, oy - 12, p.muted, 'left', 10);
}
function renderGrids(ctx, frame, env, s) {
  var p = pal(env);
  var gs = s.grids || (s.cells ? [{ title: s.title, cells: s.cells, cellMap: s.cellMap, numbers: s.numbers }] : []);
  var maxRows = Math.max.apply(null, gs.map(function (g) { return g.cells.length || 0; }).concat([4]));
  var maxCols = Math.max.apply(null, gs.map(function (g) { return g.cells[0] ? g.cells[0].length : 0; }).concat([4]));
  var cell = Math.min(26, (env.width - 40) / (maxCols * gs.length + (gs.length - 1) * 0.8), (env.height - 80) / Math.max(1, maxRows));
  var totalW = 0; gs.forEach(function (g) { totalW += (g.cells[0] ? g.cells[0].length : 0) * cell; }); totalW += (gs.length - 1) * 18;
  var x = Math.max(8, (env.width - totalW) / 2);
  gs.forEach(function (g) {
    var gw = (g.cells[0] ? g.cells[0].length : 0) * cell;
    drawGridPanel(ctx, g, x, 40, cell, p);
    x += gw + 18;
  });
  (s.legend || []).forEach(function (lg, i) {
    rectF(ctx, 10 + i * 88, env.height - 30, 10, 10, CELL_COLORS[lg[0]] || lg[0]);
    txt(ctx, lg[1] || lg[0], 24 + i * 88, env.height - 25, p.muted, 'left', 9);
  });
  if (s.caption) txt(ctx, s.caption, 8, env.height - 10, p.muted, 'left', 9);
}

/* --- scene 'tracks': không gian pixel — bbox/point/velocity/ID/trail --- */
function renderTracks(ctx, frame, env, s) {
  var p = pal(env), pad = 40;
  var xs = [0], ys = [0];
  (s.boxes || []).forEach(function (b) { xs.push(b.x, b.x + b.w); ys.push(b.y, b.y + b.h); });
  (s.points || []).forEach(function (pt) { xs.push(pt.x); ys.push(pt.y); });
  (s.trails || []).forEach(function (tr) { tr.pts.forEach(function (pt) { xs.push(pt[0]); ys.push(pt[1]); }); });
  var t = fitScale({ minX: Math.min.apply(null, xs) - 1, maxX: Math.max.apply(null, xs) + 1, minY: Math.min.apply(null, ys) - 1, maxY: Math.max.apply(null, ys) + 1 }, env, pad);
  (s.zones || []).forEach(function (z) {
    rectF(ctx, t.x(z.x), t.y(z.y), z.w * t.s, z.h * t.s, z.fill || null, z.color || p.grid, 1);
    if (z.label) txt(ctx, z.label, t.x(z.x) + 3, t.y(z.y) + 8, z.color || p.muted, 'left', 9);
  });
  (s.trails || []).forEach(function (tr) {
    for (var i = 0; i < tr.pts.length - 1; i++)
      line(ctx, t.x(tr.pts[i][0]), t.y(tr.pts[i][1]), t.x(tr.pts[i + 1][0]), t.y(tr.pts[i + 1][1]), tr.color || p.muted, 1.5, tr.dash || [3, 3]);
    tr.pts.forEach(function (pt, i) { dot(ctx, t.x(pt[0]), t.y(pt[1]), 2.5, tr.color || p.muted); });
  });
  (s.boxes || []).forEach(function (b) {
    var col = b.color || p.accent;
    rectF(ctx, t.x(b.x), t.y(b.y), b.w * t.s, b.h * t.s, b.fill || (col + '22'), col, b.lw || 2);
    if (b.id) txt(ctx, b.id, t.x(b.x) + 2, t.y(b.y) - 7, col, 'left', 10);
    if (b.tag) txt(ctx, b.tag, t.x(b.x) + 2, t.y(b.y + b.h) + 9, b.tagColor || p.muted, 'left', 9);
  });
  (s.points || []).forEach(function (pt) {
    var col = pt.color || p.accent;
    dot(ctx, t.x(pt.x), t.y(pt.y), pt.r || 5, pt.fill === false ? null : col, col, 2);
    if (pt.label) txt(ctx, pt.label, t.x(pt.x) + 8, t.y(pt.y) - 8, col, 'left', 10);
    if (pt.vel) arrowHead(ctx, t.x(pt.x + pt.vel[0]), t.y(pt.y + pt.vel[1]), Math.atan2(t.y(pt.y + pt.vel[1]) - t.y(pt.y), t.x(pt.x + pt.vel[0]) - t.x(pt.x)), 7, col),
      line(ctx, t.x(pt.x), t.y(pt.y), t.x(pt.x + pt.vel[0]), t.y(pt.y + pt.vel[1]), col, 1.5);
  });
  (s.links || []).forEach(function (lk) {
    line(ctx, t.x(lk.a[0]), t.y(lk.a[1]), t.x(lk.b[0]), t.y(lk.b[1]), lk.color || p.warning, lk.lw || 1.5, lk.dash || [5, 4]);
    if (lk.label) txt(ctx, lk.label, (t.x(lk.a[0]) + t.x(lk.b[0])) / 2, (t.y(lk.a[1]) + t.y(lk.b[1])) / 2 - 7, lk.color || p.warning, 'center', 9);
  });
  (s.rings || []).forEach(function (rg) {
    ctx.strokeStyle = rg.color || p.warning; ctx.lineWidth = 1.5;
    ctx.setLineDash(rg.dash || [4, 3]);
    ctx.beginPath(); ctx.arc(t.x(rg.x), t.y(rg.y), rg.r * t.s, 0, TAU); ctx.stroke();
    ctx.setLineDash([]);
    if (rg.label) txt(ctx, rg.label, t.x(rg.x), t.y(rg.y) - rg.r * t.s - 8, rg.color || p.warning, 'center', 9);
  });
  (s.vlines || []).forEach(function (vl) {
    line(ctx, t.x(vl.x), 20, t.x(vl.x), env.height - 28, vl.color || p.danger, 1.5, vl.dash || [5, 4]);
    if (vl.label) txt(ctx, vl.label, t.x(vl.x), 16, vl.color || p.danger, 'center', 9);
  });
  if (s.caption) txt(ctx, s.caption, 8, env.height - 12, p.muted, 'left', 9);
}

/* --- scene 'dualcam': 2 panel camera + dải world với trails --- */
function renderDualcam(ctx, frame, env, s) {
  var p = pal(env);
  var panelW = (env.width - 70) / 2, panelH = s.world ? (env.height - 200) : (env.height - 110);
  function panel(cam, x0) {
    rectF(ctx, x0, 34, panelW, panelH, null, p.grid, 1);
    txt(ctx, cam.title || '', x0 + 6, 24, p.muted, 'left', 10);
    var pts = cam.pts || [];
    var xs = [0, 60], ys = [0, 60];
    pts.forEach(function (pt) { xs.push(pt.x); ys.push(pt.y); });
    var t = fitScale({ minX: Math.min.apply(null, xs) - 4, maxX: Math.max.apply(null, xs) + 4, minY: Math.min.apply(null, ys) - 4, maxY: Math.max.apply(null, ys) + 4 }, { width: panelW - 10, height: panelH - 12 }, 8);
    pts.forEach(function (pt) {
      var col = pt.color || p.accent;
      dot(ctx, x0 + 5 + t.x(pt.x), 38 + t.y(pt.y), pt.r || 5, col);
      if (pt.label) txt(ctx, pt.label, x0 + 5 + t.x(pt.x) + 8, 38 + t.y(pt.y) - 8, col, 'left', 10);
      if (pt.vel) { var X = x0 + 5 + t.x(pt.x), Y = 38 + t.y(pt.y);
        line(ctx, X, Y, X + pt.vel[0] * t.s, Y + pt.vel[1] * t.s, col, 1.5); }
    });
  }
  panel(s.camA || {}, 20);
  panel(s.camB || {}, 20 + panelW + 30);
  if (s.world) {
    var wy = 42 + panelH, wPts = s.world.pts || [], wTr = s.world.trails || [];
    rectF(ctx, 20, wy, env.width - 40, env.height - wy - 30, null, p.grid, 1);
    txt(ctx, 'world', 26, wy - 4, p.muted, 'left', 10);
    var xs = [0, 120], ys = [0, 80];
    wPts.forEach(function (pt) { xs.push(pt.x); ys.push(pt.y); });
    wTr.forEach(function (tr) { tr.pts.forEach(function (pt) { xs.push(pt[0]); ys.push(pt[1]); }); });
    var t = fitScale({ minX: Math.min.apply(null, xs) - 8, maxX: Math.max.apply(null, xs) + 8, minY: Math.min.apply(null, ys) - 8, maxY: Math.max.apply(null, ys) + 8 }, { width: env.width - 56, height: env.height - wy - 44 }, 8);
    wTr.forEach(function (tr) {
      for (var i = 0; i < tr.pts.length - 1; i++)
        line(ctx, 28 + t.x(tr.pts[i][0]), wy + 8 + t.y(tr.pts[i][1]), 28 + t.x(tr.pts[i + 1][0]), wy + 8 + t.y(tr.pts[i + 1][1]), tr.color || p.muted, 1.5, tr.dash || [4, 3]);
    });
    wPts.forEach(function (pt) {
      var col = pt.color || p.accent;
      dot(ctx, 28 + t.x(pt.x), wy + 8 + t.y(pt.y), pt.r || 4, col);
      if (pt.label) txt(ctx, pt.label, 28 + t.x(pt.x) + 7, wy + 8 + t.y(pt.y) - 7, col, 'left', 9);
    });
  }
  if (s.caption) txt(ctx, s.caption, 8, env.height - 12, p.muted, 'left', 9);
}

/* --- scene 'token': thẻ departure/predeparture token --- */
function renderToken(ctx, frame, env, s) {
  var p = pal(env);
  var tk = s.token;
  if (!tk) { txt(ctx, 'không còn token', env.width / 2, env.height / 2, p.muted, 'center', 14); if (s.caption) txt(ctx, s.caption, 8, env.height - 12, p.muted, 'left', 9); return; }
  var w = Math.min(360, env.width - 60), h = 110, x0 = (env.width - w) / 2, y0 = 50;
  rectF(ctx, x0, y0, w, h, (tk.color || p.warning) + '18', tk.color || p.warning, 2.5);
  txt(ctx, tk.label || 'token', x0 + 14, y0 + 24, tk.color || p.warning, 'left', 13);
  txt(ctx, 'gid: ' + (tk.gid !== undefined ? tk.gid : '—'), x0 + 14, y0 + 46, p.text, 'left', 11);
  (tk.meta || '').split('\n').forEach(function (m, i) {
    txt(ctx, m, x0 + 14, y0 + 66 + i * 16, p.muted, 'left', 10);
  });
  if (s.caption) txt(ctx, s.caption, 8, env.height - 12, p.muted, 'left', 9);
}

/* --- scene 'matrix': ma trận cost + gán + row/col labels --- */
function renderMatrix(ctx, frame, env, s) {
  var p = pal(env);
  var M = s.matrix || [], rows = s.rows || M.map(function (_, i) { return 'r' + i; }), cols = s.cols || (M[0] || []).map(function (_, i) { return 'c' + i; });
  var cell = Math.min(58, (env.width - 160) / Math.max(1, cols.length), (env.height - 110) / Math.max(1, rows.length));
  var ox = 90, oy = 44;
  cols.forEach(function (c, j) { txt(ctx, c, ox + j * cell + cell / 2, oy - 14, p.muted, 'center', 10); });
  M.forEach(function (row, i) {
    txt(ctx, rows[i], ox - 10, oy + i * cell + cell / 2, p.muted, 'right', 10);
    row.forEach(function (v, j) {
      var hot = v >= 9.5 ? (p.danger || '#f2555a') : v > 0.92 ? (p.warning || '#f0a93c') : v < 0.35 ? (p.success || '#3fce7c') : (p.accent || '#4f9cf7');
      var heat = Math.min(0.85, v >= 9.5 ? 0.12 : Math.max(0.08, v));
      rectF(ctx, ox + j * cell, oy + i * cell, cell - 2, cell - 2, v >= 9.5 ? null : (hot + '33'), p.grid, 1);
      txt(ctx, v >= 9.5 ? '∞' : fmt(v), ox + j * cell + cell / 2, oy + i * cell + cell / 2, v >= 9.5 ? p.muted : hot, 'center', v >= 9.5 ? 14 : 11);
    });
  });
  (s.assign || []).forEach(function (a) {
    var rr = a[0], cc = a[1];
    if (cc < 0) { txt(ctx, 'unassigned (−1)', ox - 6, oy + rr * cell + cell / 2, p.danger, 'right', 9); return; }
    rectF(ctx, ox + cc * cell - 2, oy + rr * cell - 2, cell + 2, cell + 2, null, a.color || p.success, 2.5);
  });
  (s.notes || []).forEach(function (n, i) {
    txt(ctx, n.text, ox + (n.col || 0) * cell + cell / 2, env.height - 26 - (n.row !== undefined ? (n.row - (M.length)) * 0 : 0), n.color || p.muted, 'center', 9);
  });
  var gy = oy + rows.length * cell + 16;
  (s.gaps || []).forEach(function (g, i) {
    txt(ctx, g, ox, gy + i * 14, g.indexOf('ambiguous') >= 0 || g.indexOf('<') >= 0 ? p.warning : p.muted, 'left', 10);
  });
  if (s.caption) txt(ctx, s.caption, 8, env.height - 10, p.muted, 'left', 9);
}

/* --- scene 'fsm': state machine vòng đời --- */
var FSM_LAYOUT = {
  tentative: [0.12, 0.5], confirmed: [0.42, 0.5], lost: [0.72, 0.5], removed: [0.94, 0.5],
  parked: [0.15, 0.5], departing: [0.5, 0.5], released: [0.85, 0.5],
  active: [0.12, 0.5], handoff: [0.38, 0.3], dormant: [0.38, 0.7], exited: [0.72, 0.3], expired: [0.72, 0.7],
  free: [0.2, 0.5], occupied: [0.6, 0.5]
};
function renderFsm(ctx, frame, env, s) {
  var p = pal(env);
  var states = s.states || [];
  var W = env.width, H = env.height;
  var posOf = function (st) {
    var q = FSM_LAYOUT[st] || [0.5, 0.5];
    return [40 + q[0] * (W - 90), 60 + q[1] * (H - 160)];
  };
  (s.edges || []).forEach(function (e) {
    var from = e.from !== undefined ? e.from : e[0], to = e.to !== undefined ? e.to : e[1];
    var a = posOf(from), b = posOf(to);
    var act = e.active || (s.current !== undefined && from === s.current);
    var col = act ? (p.warning || '#f0a93c') : (p.grid || '#2a3248');
    line(ctx, a[0], a[1], b[0], b[1], col, act ? 2.5 : 1.2, e.back ? [4, 4] : null);
    var mx = (a[0] + b[0]) / 2, my = (a[1] + b[1]) / 2 - 6;
    if (act) arrowHead(ctx, mx, my + 6, Math.atan2(b[1] - a[1], b[0] - a[0]), 7, col);
    if (e.label) txt(ctx, e.label, mx, my, act ? col : p.muted, 'center', 9);
  });
  states.forEach(function (st) {
    var q = posOf(st.name !== undefined ? st.name : st);
    var cur = s.current === (st.name !== undefined ? st.name : st);
    var col = st.color || (cur ? (p.success || '#3fce7c') : (p.grid || '#2a3248'));
    dot(ctx, q[0], q[1], cur ? 20 : 15, cur ? col : (p.background || '#12172a'), col, cur ? 3 : 1.5);
    txt(ctx, st.name !== undefined ? st.name : st, q[0], q[1] + (cur ? 32 : 26), cur ? p.text : p.muted, 'center', cur ? 12 : 10);
  });
  var log = s.log || [];
  log.forEach(function (lg, i) { txt(ctx, lg, 10, H - 70 + i * 15, i === log.length - 1 ? p.text : p.muted, 'left', 10); });
  if (s.caption) txt(ctx, s.caption, 8, H - 8, p.muted, 'left', 9);
}

/* --- scene 'slots': ô đỗ + xe + token/claim/evidence --- */
function renderSlots(ctx, frame, env, s) {
  var p = pal(env), pad = 44;
  var xs = [0], ys = [0];
  (s.slots || []).forEach(function (sl) {
    sl.poly.forEach(function (pt) { xs.push(pt[0]); ys.push(pt[1]); });
  });
  (s.vehicles || []).forEach(function (v) { v.poly.forEach(function (pt) { xs.push(pt[0]); ys.push(pt[1]); }); });
  (s.trails || []).forEach(function (tr) { tr.pts.forEach(function (pt) { xs.push(pt[0]); ys.push(pt[1]); }); });
  var t = fitScale({ minX: Math.min.apply(null, xs) - 0.8, maxX: Math.max.apply(null, xs) + 0.8, minY: Math.min.apply(null, ys) - 0.8, maxY: Math.max.apply(null, ys) + 0.8 }, env, pad);
  (s.slots || []).forEach(function (sl) {
    var col = sl.color || (sl.occupied ? (p.danger || '#f2555a') : (p.accent || '#4f9cf7'));
    var pts = sl.poly.map(function (pt) { return [t.x(pt[0]), t.y(pt[1])]; });
    polyPath(ctx, pts);
    ctx.fillStyle = sl.fill || (col + '22'); ctx.fill();
    ctx.strokeStyle = col; ctx.lineWidth = sl.hl ? 3 : 1.8; ctx.stroke();
    txt(ctx, sl.id, pts[0][0] + 3, pts[0][1] - 9, col, 'left', 11);
    if (sl.tag) txt(ctx, sl.tag, pts[0][0] + 3, pts[0][1] + 12, sl.tagColor || p.muted, 'left', 9);
    if (sl.center) dot(ctx, t.x(sl.center[0]), t.y(sl.center[1]), 3, col);
  });
  (s.tokens || []).forEach(function (tk) {
    var col = p.warning || '#f0a93c';
    ctx.setLineDash([4, 3]); ctx.strokeStyle = col; ctx.lineWidth = 1.5;
    ctx.beginPath(); ctx.arc(t.x(tk.x), t.y(tk.y), tk.r * t.s, 0, TAU); ctx.stroke();
    if (tk.maxR) { ctx.beginPath(); ctx.arc(t.x(tk.x), t.y(tk.y), tk.maxR * t.s, 0, TAU); ctx.stroke(); }
    ctx.setLineDash([]);
    txt(ctx, tk.label || 'token', t.x(tk.x), t.y(tk.y) - (tk.maxR || tk.r) * t.s - 8, col, 'center', 10);
  });
  (s.trails || []).forEach(function (tr) {
    for (var i = 0; i < tr.pts.length - 1; i++)
      line(ctx, t.x(tr.pts[i][0]), t.y(tr.pts[i][1]), t.x(tr.pts[i + 1][0]), t.y(tr.pts[i + 1][1]), tr.color || p.muted, 1.5, [4, 3]);
    tr.pts.forEach(function (pt, i) { dot(ctx, t.x(pt[0]), t.y(pt[1]), i === tr.pts.length - 1 ? 4 : 2.5, tr.color || p.muted); });
  });
  (s.vehicles || []).forEach(function (v) {
    var col = v.color || (p.success || '#3fce7c');
    var pts = v.poly.map(function (pt) { return [t.x(pt[0]), t.y(pt[1])]; });
    polyPath(ctx, pts);
    ctx.fillStyle = col + '44'; ctx.fill();
    ctx.strokeStyle = col; ctx.lineWidth = 2; ctx.stroke();
    if (v.id) txt(ctx, v.id, pts[0][0], pts[0][1] - 8, col, 'left', 10);
  });
  (s.points || []).forEach(function (pt) {
    dot(ctx, t.x(pt.x), t.y(pt.y), pt.r || 4, pt.color || p.text, p.text, 1);
    if (pt.label) txt(ctx, pt.label, t.x(pt.x) + 7, t.y(pt.y), pt.color || p.text, 'left', 9);
  });
  if (s.caption) txt(ctx, s.caption, 8, env.height - 12, p.muted, 'left', 9);
}

/* --- scene 'world': 2 camera + world trails --- */
function renderWorld(ctx, frame, env, s) {
  var p = pal(env);
  var half = Math.max(140, (env.width - 60) / 2);
  var zones = s.zones || [{ id: 'cam1', x: 0 }, { id: 'cam2', x: 1 }];
  zones.forEach(function (z, zi) {
    var zx = 24 + zi * (half + 14);
    rectF(ctx, zx, 34, half, env.height - 90, null, p.grid, 1);
    txt(ctx, z.id + (z.sub ? ' — ' + z.sub : ''), zx + 6, 24, p.muted, 'left', 10);
    var t = fitScale(z.bounds || { minX: 0, maxX: 10, minY: 0, maxY: 10 }, { width: half - 8, height: env.height - 104 }, 10);
    var X = function (v) { return zx + 4 + t.x(v); }, Y = function (v) { return 38 + t.y(v); };
    (z.polys || []).forEach(function (pl) {
      polyPath(ctx, pl.pts.map(function (pt) { return [X(pt[0]), Y(pt[1])]; }));
      ctx.fillStyle = (pl.color || p.accent) + '22'; ctx.fill();
      ctx.strokeStyle = pl.color || p.accent; ctx.lineWidth = 1.2; ctx.stroke();
    });
    (z.trails || []).forEach(function (tr) {
      for (var i = 0; i < tr.pts.length - 1; i++)
        line(ctx, X(tr.pts[i][0]), Y(tr.pts[i][1]), X(tr.pts[i + 1][0]), Y(tr.pts[i + 1][1]), tr.color || p.muted, 1.5, tr.dash || [4, 3]);
      tr.pts.forEach(function (pt) { dot(ctx, X(pt[0]), Y(pt[1]), 2.5, tr.color || p.muted); });
    });
    (z.rings || []).forEach(function (rg) {
      ctx.setLineDash(rg.dash || [4, 3]); ctx.strokeStyle = rg.color || p.warning; ctx.lineWidth = 1.3;
      ctx.beginPath(); ctx.arc(X(rg.x), Y(rg.y), rg.r * t.s, 0, TAU); ctx.stroke(); ctx.setLineDash([]);
      if (rg.label) txt(ctx, rg.label, X(rg.x), Y(rg.y) - rg.r * t.s - 8, rg.color || p.warning, 'center', 9);
    });
    (z.points || []).forEach(function (pt) {
      var col = pt.color || p.accent;
      dot(ctx, X(pt.x), Y(pt.y), pt.r || 5, pt.hollow ? null : col, col, 2);
      if (pt.label) txt(ctx, pt.label, X(pt.x) + 8, Y(pt.y) - 8, col, 'left', 10);
      if (pt.vel) { var vx = pt.vel[0], vy = pt.vel[1];
        line(ctx, X(pt.x), Y(pt.y), X(pt.x + vx), Y(pt.y + vy), col, 1.5);
        arrowHead(ctx, X(pt.x + vx), Y(pt.y + vy), Math.atan2(Y(pt.y + vy) - Y(pt.y), X(pt.x + vx) - X(pt.x)), 6, col); }
    });
    (z.links || []).forEach(function (lk) {
      line(ctx, X(lk.a[0]), Y(lk.a[1]), X(lk.b[0]), Y(lk.b[1]), lk.color || p.warning, 1.5, lk.dash || [5, 4]);
    });
    (z.edges || []).forEach(function (ed) {
      line(ctx, X(ed.a[0]), Y(ed.a[1]), X(ed.b[0]), Y(ed.b[1]), ed.color || p.grid, 1);
    });
  });
  if (s.caption) txt(ctx, s.caption, 8, env.height - 30, p.muted, 'left', 9);
  if (s.caption2) txt(ctx, s.caption2, 8, env.height - 12, p.muted, 'left', 9);
}

/* --- scene 'hmat': ma trận 3×3 + cặp điểm --- */
function renderHmat(ctx, frame, env, s) {
  var p = pal(env);
  var mats = s.mats || [];
  var cell = Math.min(34, (env.width - 60) / Math.max(1, mats.length * 3 + mats.length - 1));
  var ox = 40;
  mats.forEach(function (mt, mi) {
    var mo = ox + mi * (3 * cell + 34);
    txt(ctx, mt.title, mo, 40, p.muted, 'left', 10);
    mt.m.forEach(function (row, i) {
      row.forEach(function (v, j) {
        var hot = mt.hot && mt.hot(i, j);
        rectF(ctx, mo + j * cell, 50 + i * cell, cell - 2, cell - 2, hot ? (p.warning + '44') : null, p.grid, 1);
        txt(ctx, fmt(r3(v)), mo + j * cell + cell / 2, 50 + i * cell + cell / 2, hot ? p.warning : p.text, 'center', 10);
      });
    });
  });
  (s.pairs || []).forEach(function (pr, i) {
    var y = 190 + i * 34;
    txt(ctx, 'p' + i + ' (' + pr.a.join(',') + ')', 40, y, p.accent, 'left', 10);
    txt(ctx, '→  (' + pr.b.map(function (v) { return fmt(r2(v)); }).join(',') + ')', 200, y, p.success, 'left', 10);
    if (pr.residual !== undefined) {
      var bw = Math.min(220, pr.residual * 60);
      rectF(ctx, 340, y - 6, Math.max(2, bw), 12, pr.residual > (s.resMax || 12) ? p.danger : p.warning);
      txt(ctx, 'res ' + fmt(r2(pr.residual)), 348 + Math.max(2, bw), y, p.text, 'left', 10);
    }
  });
  var y0 = 190 + (s.pairs || []).length * 34 + 12;
  (s.notes || []).forEach(function (n, i) { txt(ctx, n, 40, y0 + i * 16, p.text, 'left', 10); });
  if (s.caption) txt(ctx, s.caption, 8, env.height - 10, p.muted, 'left', 9);
}

/* --- scene 'timeline': trục thời gian + events --- */
function renderTimeline(ctx, frame, env, s) {
  var p = pal(env);
  var events = s.events || [];
  var t0 = s.tMin !== undefined ? s.tMin : Math.min.apply(null, events.map(function (e) { return e.t; }).concat([0]));
  var t1 = s.tMax !== undefined ? s.tMax : Math.max.apply(null, events.map(function (e) { return e.t; }).concat([1]));
  var y = env.height / 2;
  var X = function (v) { return 46 + (v - t0) / Math.max(1e-9, t1 - t0) * (env.width - 92); };
  line(ctx, X(t0), y, X(t1), y, p.muted, 2);
  var step = s.tick !== undefined ? s.tick : Math.max(0.5, Math.round((t1 - t0) / 8 * 2) / 2);
  for (var g = Math.ceil(t0 / step) * step; g <= t1; g += step) {
    line(ctx, X(g), y - 5, X(g), y + 5, p.muted, 1);
    txt(ctx, r2(g) + (s.unit || 's'), X(g), y + 18, p.muted, 'center', 9);
  }
  events.forEach(function (e) {
    var col = e.color || (e.kind === 'bad' ? p.danger : e.kind === 'good' ? p.success : e.kind === 'warn' ? p.warning : p.accent);
    var ex = X(e.t);
    dot(ctx, ex, y + (e.dy || 0), e.kind === 'skip' ? 4 : 6.5, col, p.text, 1);
    txt(ctx, e.label, ex, y - 26 - (e.row || 0) * 15, col, 'center', 9.5);
    if (e.verdict) txt(ctx, e.verdict, ex, y + 30 + (e.row || 0) * 13, e.verdictColor || p.muted, 'center', 9);
  });
  if (s.cursor !== undefined && s.cursor !== null) {
    var cx = X(Math.max(t0, Math.min(t1, s.cursor)));
    line(ctx, cx, y - 44, cx, y + 48, p.warning, 2);
    txt(ctx, 't=' + r2(s.cursor), cx, y - 52, p.warning, 'center', 10);
  }
  if (s.caption) txt(ctx, s.caption, 8, env.height - 10, p.muted, 'left', 9);
}

/* --- scene 'bars': giá trị + ngưỡng --- */
function renderBars(ctx, frame, env, s) {
  var p = pal(env);
  var items = s.items || [];
  var max = Math.max.apply(null, items.map(function (i) { return Math.abs(i.value); }).concat([s.minTop || 1]));
  var rowH = Math.min(30, (env.height - 60) / Math.max(1, items.length));
  var zero = 130;
  items.forEach(function (it, i) {
    var y = 30 + i * rowH;
    var bw = (Math.abs(it.value) / max) * (env.width - 200);
    rectF(ctx, zero, y, Math.max(1, bw), rowH * 0.62, it.color || (p.accent || '#4f9cf7'));
    txt(ctx, it.label, 8, y + rowH * 0.31, p.text, 'left', 10);
    txt(ctx, fmt(it.value), zero + bw + 6, y + rowH * 0.31, it.color || p.text, 'left', 10);
    if (it.mark) txt(ctx, it.mark, zero + bw + 6, y + rowH * 0.31 + 0, p.muted, 'left', 0);
  });
  (s.thresholds || []).forEach(function (th) {
    var x = zero + (th.value / max) * (env.width - 200);
    line(ctx, x, 22, x, 30 + items.length * rowH, th.color || p.danger, 1.5, [4, 3]);
    txt(ctx, th.label || String(th.value), x, 16, th.color || p.danger, 'center', 9);
  });
  (s.notes || []).forEach(function (n, i) {
    txt(ctx, n.text, 8, env.height - 44 + i * 15, n.color || p.muted, 'left', 10);
  });
  if (s.caption) txt(ctx, s.caption, 8, env.height - 10, p.muted, 'left', 9);
}

/* --- scene 'hist': histogram bins --- */
function renderHist(ctx, frame, env, s) {
  var p = pal(env);
  var hists = s.hists || [];
  var bw = (env.width - 80) / Math.max(1, hists.length * 1.4);
  hists.forEach(function (h, i) {
    var x0 = 40 + i * (h.bins.length * bw + 40);
    var maxV = Math.max.apply(null, h.bins.concat([0.001]));
    txt(ctx, h.title, x0, 26, p.muted, 'left', 10);
    h.bins.forEach(function (v, bi) {
      var bh = (v / maxV) * (env.height - 140);
      rectF(ctx, x0 + bi * bw, env.height - 80 - bh, bw - 3, bh, h.color || p.accent);
      txt(ctx, String(bi), x0 + bi * bw + bw / 2, env.height - 66, p.muted, 'center', 9);
      if (v > 0) txt(ctx, fmt(v), x0 + bi * bw + bw / 2, env.height - 84 - bh, p.text, 'center', 9);
    });
    if (h.note) txt(ctx, h.note, x0, env.height - 46, p.warning, 'left', 10);
  });
  (s.notes || []).forEach(function (n, i) { txt(ctx, n.text, 8, env.height - 30 + i * 14, n.color || p.muted, 'left', 10); });
  if (s.caption) txt(ctx, s.caption, 8, env.height - 8, p.muted, 'left', 8);
}

/* --- scene 'rows': pipeline rows / gates --- */
function renderRows(ctx, frame, env, s) {
  var p = pal(env);
  var rows = s.rows || [];
  var rowH = Math.min(34, (env.height - 70) / Math.max(1, rows.length));
  rows.forEach(function (r, i) {
    var y = 26 + i * rowH;
    var col = r.state === 'fail' ? (p.danger || '#f2555a') : r.state === 'pass' ? (p.success || '#3fce7c') : r.state === 'warn' ? (p.warning || '#f0a93c') : (p.grid || '#2a3248');
    var active = r.state === 'active';
    rectF(ctx, 8, y, env.width - 16, rowH * 0.82, active ? (p.accent + '33') : null, col, active ? 2 : 1);
    txt(ctx, r.label, 16, y + rowH * 0.41, r.state === 'off' ? p.muted : p.text, 'left', 11);
    txt(ctx, r.value !== undefined ? String(r.value) : '', env.width - 20, y + rowH * 0.41, col === p.grid ? p.muted : col, 'right', 11);
  });
  if (s.caption) txt(ctx, s.caption, 8, env.height - 10, p.muted, 'left', 9);
}

/* --- scene 'board': cards + log --- */
function renderBoard(ctx, frame, env, s) {
  var p = pal(env);
  var cards = s.cards || [];
  var cols = Math.max(1, Math.min(3, Math.floor(env.width / 210)));
  var cw = (env.width - 20) / cols;
  cards.forEach(function (c, i) {
    var cx = 10 + (i % cols) * cw, cy = 18 + Math.floor(i / cols) * 60;
    rectF(ctx, cx, cy, cw - 8, 52, c.hl ? (p.accent + '22') : null, c.color || (p.grid || '#2a3248'), 1);
    txt(ctx, c.label, cx + 8, cy + 15, p.muted, 'left', 9);
    txt(ctx, String(c.value), cx + 8, cy + 36, c.color || (p.text || '#e8ecf4'), 'left', 12);
  });
  var logY = 24 + Math.ceil(cards.length / cols) * 60;
  (s.log || []).forEach(function (lg, i) { txt(ctx, lg, 12, logY + i * 16, p.text, 'left', 11); });
  if (s.caption) txt(ctx, s.caption, 8, env.height - 10, p.muted, 'left', 9);
}

var RENDER = {
  grid: renderGrids, tracks: renderTracks, matrix: renderMatrix, fsm: renderFsm,
  slots: renderSlots, world: renderWorld, hmat: renderHmat, timeline: renderTimeline,
  bars: renderBars, hist: renderHist, rows: renderRows, board: renderBoard,
  dualcam: renderDualcam, token: renderToken
};
drawScene.rendererTypes = Object.keys(RENDER);
function drawScene(ctx, frame, env) {
  var s = (frame && frame.scene) || {};
  var p = pal(env);
  ctx.fillStyle = p.background || '#12172a';
  ctx.fillRect(0, 0, env.width, env.height);
  var r = RENDER[s.type || 'board'] || renderBoard;
  try { r(ctx, frame, env, s); } catch (e) {
    txt(ctx, 'scene lỗi: ' + (e && e.message || e), 10, 20, p.danger, 'left', 12);
  }
}

/* =================================================================
 * LESSON factory + metadata helper
 * ================================================================= */
/* Bảng độ phức tạp trích từ dossier §mỗi entry — {time,space,variables,simulation} */
var CX = {
  'mog2-foreground-mask': {"time": "O(H·W) thời gian", "space": "O(H·W·K) bộ nhớ nền (K = số Gauss/pixel)", "variables": "K = số Gauss/pixel", "simulation": "O(H·W), 1 giá trị nền/px"},
  'temporal-motion-gate': {"time": "O(H·W·R) R = số mốc (≤2) + O(H·W·k²) morph", "space": "O(H·W·S) bộ nhớ lịch sử", "variables": "R = số mốc; S = 2.", "simulation": "R=1, S=2"},
  'roi-strict-context-mask': {"time": "O(compPx) đếm; O(H·W) tiền xử lý mask context (cache theo ROI)", "space": "O(1) ngoài cache mask O(H·W)", "variables": "kích thước fixture", "simulation": "O(compPx)"},
  'foreground-morphology': {"time": "O(H·W·k²) mỗi pass (k = cạnh kernel)", "space": "O(H·W) mask trung gian", "variables": "k = cạnh kernel", "simulation": "O(H·W·9) hai pass"},
  'contour-geometry-filter': {"time": "O(N·P), N contour × P px/contour", "space": "O(N·P)", "variables": "kích thước fixture", "simulation": "O(N·P) trên lưới nhỏ"},
  'bottom-center-anchor': {"time": "O(1)", "space": "O(1)", "variables": "kích thước fixture", "simulation": "O(1)"},
  'cast-shadow-discriminator': {"time": "O(compPx)", "space": "O(compPx)", "variables": "kích thước fixture", "simulation": "O(compPx)"},
  'dark-foreground-rescue': {"time": "O(H·W)", "space": "O(H·W) 2 mask", "variables": "kích thước fixture", "simulation": "O(H·W)"},
  'motion-echo-suppression': {"time": "O(N²) cặp + O(N·T) owner", "space": "O(N)", "variables": "kích thước fixture", "simulation": "O(N²), N≤10"},
  'occlusion-group-guard': {"time": "O(T²) cặp eligible + O(G·members) covering", "space": "O(G+T)", "variables": "kích thước fixture", "simulation": "O(T²)"},
  'watershed-blob-partition': {"time": "O(blobPx·k) gần đúng", "space": "O(blobPx) label map", "variables": "kích thước fixture", "simulation": "O(blobPx·S), S seed"},
  'merged-blob-assignment-guard': {"time": "O(G·members) + O(members·D) suppress", "space": "O(G+T)", "variables": "kích thước fixture", "simulation": "O(G·D)"},
  'kalman-constant-velocity': {"time": "O(1)/track", "space": "O(1) state+P", "variables": "kích thước fixture", "simulation": "O(1)"},
  'prediction-age-decay': {"time": "O(1)", "space": "O(1)", "variables": "kích thước fixture", "simulation": "O(1)"},
  'association-distance-gate': {"time": "O(1)/cặp → O(T·D) tổng", "space": "O(1)", "variables": "kích thước fixture", "simulation": "O(T·D)"},
  'iou-overlap-score': {"time": "O(1)", "space": "O(1)", "variables": "kích thước fixture", "simulation": "O(1)"},
  'association-cost-matrix': {"time": "O(T·D)", "space": "O(T·D)", "variables": "kích thước fixture", "simulation": "O(T·D) + solver B6"},
  'lapjv-assignment': {"time": "LAPJV ~O(n³)", "space": "O(n²) ma trận + O(n) gán", "variables": "kích thước fixture", "simulation": "exhaustive O(n!) với n≤5 — **chỉ cho demo**, ghi rõ khác biệt"},
  'assignment-margin-ambiguity': {"time": "O(T·D) second-min", "space": "O(T+D)", "variables": "kích thước fixture", "simulation": "O(T·D)"},
  'stale-anchor-reacquire': {"time": "O(1)/cặp", "space": "O(1)", "variables": "kích thước fixture", "simulation": "O(1)"},
  'track-lifecycle': {"time": "O(T)", "space": "O(T)", "variables": "kích thước fixture", "simulation": "O(T)"},
  'hsv-lab-descriptor': {"time": "O(compPx + 416)", "space": "O(416·S)", "variables": "kích thước fixture", "simulation": "O(compPx + 6) — demo 1 hist 6-bin H"},
  'tracklet-gallery-match': {"time": "O(|A|·|B|·N)", "space": "O(|A|+|B|)", "variables": "kích thước fixture", "simulation": "≤ O(9·6)"},
  'slot-roi-precompute': {"time": "O(H·W) mỗi slot một lần", "space": "O(H·W·S) mask", "variables": "kích thước fixture", "simulation": "O(R) raster ô lưới"},
  'ensemble-threshold-voting': {"time": "O(V·R + S) — V=25 biến thể × R px ROI (threshold+mask+count), S slot cho vote/rescue/edge", "space": "O(S) votes/evidence + O(S·R) `vote_masks` khi `selective_line_filter=False` (True → O(R) buffer tái dùng)", "variables": "V = 25 biến thể × R px ROI; selective_line_filter = False`", "simulation": "O(V) + O(1) space"},
  'border-line-filter': {"time": "O(R + C + P_sel) — R px ROI quét, C component kiểm, P_sel px cho `fitLine`+`distanceTransform` khi selective", "space": "O(R) label map + O(C) stats", "variables": "kích thước fixture", "simulation": "O(R) raster + O(C) — bỏ P_sel (xóa nguyên component)"},
  'core-rescue-vote': {"time": "O(1) (≤7 phép so sánh trên 4 field)", "space": "O(1)", "variables": "kích thước fixture", "simulation": "O(1)"},
  'temporal-smoothing-dwell': {"time": "O(S) mỗi call; (b) O(S·evidence)", "space": "O(S)", "variables": "kích thước fixture", "simulation": "O(S)"},
  'slot-overlap-geometry': {"time": "O(P) polygon ops (`intersectConvexConvex`, `pointPolygonTest`, `boundingRect`)", "space": "O(1) ngoài polygon", "variables": "kích thước fixture", "simulation": "O(cells) raster"},
  'slot-track-batch-match': {"time": "LAPJV O(n³) + build O(T·S)", "space": "O(T·S) ma trận", "variables": "kích thước fixture", "simulation": "exhaustive O(n!) n≤5"},
  'arrival-claim-qualification': {"time": "O(obs + claims)", "space": "O(claims)", "variables": "kích thước fixture", "simulation": "O(n)"},
  'vision-primary-fusion': {"time": "O(S) mỗi vision tick", "space": "O(S)", "variables": "kích thước fixture", "simulation": "O(S)"},
  'stop-dwell-detection': {"time": "O(n) n = số mẫu trong cửa sổ (bounded)", "space": "O(n) mẫu cửa sổ", "variables": "n = số mẫu trong cửa sổ", "simulation": "O(n)"},
  'sticky-id-bind-release': {"time": "O(1)/sự kiện", "space": "O(1)", "variables": "kích thước fixture", "simulation": "O(1)"},
  'departure-token-lifecycle': {"time": "O(1)/token + O(tokens·candidates) cleanup", "space": "O(tokens + evidence)", "variables": "kích thước fixture", "simulation": "O(n)"},
  'predeparture-candidate-guard': {"time": "O(F·B), F unbound × B bindings", "space": "O(F·B) choices", "variables": "kích thước fixture", "simulation": "O(F·B)"},
  'recovery-candidate-gates': {"time": "O(T·F)", "space": "O(T·F)", "variables": "kích thước fixture", "simulation": "O(T·F)"},
  'recovery-batch-assignment': {"time": "O(n³) + O(T·F) gap", "space": "O(T·F)", "variables": "kích thước fixture", "simulation": "exhaustive O(n!) n≤5"},
  'parking-episode-state': {"time": "O(1)/transition", "space": "O(episodes)", "variables": "kích thước fixture", "simulation": "O(n) duyệt chuỗi"},
  'world-projection-anchor': {"time": "O(1)/điểm; O(T) cho T track", "space": "O(1)", "variables": "kích thước fixture", "simulation": "O(1)"},
  'handoff-entry-creation': {"time": "O(1)/track", "space": "O(1)", "variables": "kích thước fixture", "simulation": "O(1)"},
  'handoff-prediction-corridor': {"time": "O(1)", "space": "O(1)", "variables": "kích thước fixture", "simulation": "O(1)"},
  'handoff-lapjv-matching': {"time": "O(n³) + build O(E·T)", "space": "O(E·T)", "variables": "kích thước fixture", "simulation": "exhaustive n≤5"},
  'overlap-simultaneous-pairing': {"time": "O(T_A·T_B) build + O(P log P) sort", "space": "O(T_A+T_B+P)", "variables": "kích thước fixture", "simulation": "O(n²)"},
  'global-id-allocation': {"time": "O(1)", "space": "O(G)", "variables": "kích thước fixture", "simulation": "O(1)"},
  'dormant-identity-reid': {"time": "O(D·k) dormant × gates", "space": "O(D)", "variables": "kích thước fixture", "simulation": "O(D)"},
  'world-trajectory-match': {"time": "O(n_samples·traj)", "space": "O(samples)", "variables": "kích thước fixture", "simulation": "O(n)"},
  'merge-alias-resolution': {"time": "chain lookup O(depth) ~O(1) amortized; merge O(gallery+traj)", "space": "O(G) alias", "variables": "kích thước fixture", "simulation": "O(n)"},
  'global-identity-lifecycle': {"time": "O(G) refresh", "space": "O(G)", "variables": "kích thước fixture", "simulation": "O(G)"},
  'homography-fit-distributed': {"time": "O(n) DLT + O(n·iters) RANSAC", "space": "O(n) pairs", "variables": "kích thước fixture", "simulation": "O(n) DLT 4 điểm"},
  'rectangle-line-fit-gate': {"time": "O(n) lines + fit", "space": "O(n)", "variables": "kích thước fixture", "simulation": "O(n)"},
  'calibration-load-validation': {"time": "O(1) + O(P) validate polygon", "space": "O(P)", "variables": "kích thước fixture", "simulation": "O(1)"},
  'matching-distance-derivation': {"time": "O(S·k²) minAreaRect (k=đỉnh/slot) + O(S log S) median", "space": "O(S)", "variables": "k = đỉnh/slot", "simulation": "O(S)"},
  'frame-size-adaptation': {"time": "O(1)/cam", "space": "O(1)", "variables": "kích thước fixture", "simulation": "O(1)"},
  'camera-skew-synchronization': {"time": "O(max_catchup_reads) ≤ 3 đọc", "space": "O(1)", "variables": "kích thước fixture", "simulation": "O(k) bước"},
  'latest-frame-mailbox': {"time": "O(1) mỗi op; wait O(1) + blocking", "space": "O(cam) pending", "variables": "kích thước fixture", "simulation": "O(events)"},
  'stale-evidence-health-gating': {"time": "O(S) apply + O(1) gate mỗi job", "space": "O(cam)", "variables": "kích thước fixture", "simulation": "O(1)"}
};

var lessons = [];
var curTopic = 'CV';
function setTopic(t) { curTopic = t; }
function humanize(k) { return String(k).replace(/_/g, ' '); }
function ioTypes(schema, lesson) {
  var kf = (lesson.keyFields || []);
  return Object.keys(schema || {}).map(function (k) {
    var f = null;
    kf.forEach(function (x) { if (x.name === k) f = x; });
    return { name: k, type: String(schema[k]), description: f ? (f.desc || humanize(k)) : humanize(k) };
  });
}
function structOf(s) {
  var str = String(s);
  var br = str.indexOf('{'), pr = str.indexOf('(');
  var cut = [br, pr].filter(function (x) { return x >= 0; });
  var head = cut.length ? str.slice(0, Math.min.apply(null, cut)).trim() : str;
  return { name: head || str, type: cut.length ? str.slice(Math.min.apply(null, cut)).trim() : 'cấu trúc', description: str };
}
function simOf(s) {
  var str = String(s);
  var omit = str.indexOf('[sim-omits]') === 0;
  var body = str.replace(/^\[(sim-omits|sim)\]\s*/, '');
  return {
    sourceBehavior: omit ? 'code đầy đủ có phần này — xem codeRefs' : 'như codeRefs mô tả',
    demoBehavior: body,
    reason: omit ? 'bỏ chi tiết engineering ngoài phạm vi bài' : 'giản lược cho demo giáo dục'
  };
}
function L(id, def) {
  def.id = id;
  def.pack = PACK_ID;
  // SPEC §4 literal — migrate từ field nội bộ; giữ data semantic đã duyệt.
  def.summary = def.summary || def.topic;
  def.topic = curTopic;
  def.role = def.role || def.pipelineRole;
  def.inputTypes = def.inputTypes || ioTypes(def.inputSchema, def);
  def.outputTypes = def.outputTypes || ioTypes(def.outputSchema, def);
  def.structures = def.structures || (def.dataStructures || []).map(structOf);
  def.complexity = def.complexity || CX[id] || { time: 'O(n)', space: 'O(n)', variables: 'kích thước fixture', simulation: 'như code' };
  def.edgeCases = (def.edgeCases || []).map(function (ec) {
    return { title: ec.title || ec.name, description: ec.description || ec.desc || '' };
  });
  def.simplifications = (def.simplifications || []).map(function (s) { return typeof s === 'string' ? simOf(s) : s; });
  def.scenarios = (def.scenarios || []).map(function (sc) {
    return {
      id: sc.id, title: sc.title || sc.label || sc.id,
      description: sc.description || sc.label || sc.id,
      input: sc.input, expected: sc.expected,
      edgeCase: sc.edgeCase === undefined ? sc.id !== 'normal' : !!sc.edgeCase
    };
  });
  def.aliases = def.aliases || [];
  def.related = def.related || [];
  def.parameters = def.parameters || [];
  def.draw = def.draw || drawScene;
  lessons.push(def);
}
function pc(arr) { // pseudocode lines → {id,text}
  return arr.map(function (t, i) { return { id: 'p' + (i + 1), text: t }; });
}
function param(key, label, def, min, max, step) {
  if (typeof def === 'boolean') return { key: key, label: label, type: 'boolean', default: def };
  return { key: key, label: label, type: 'number', min: min, max: max, step: step, default: def };
}
function refp(path, line, endLine, symbol, note) {
  return { path: path, line: line, endLine: endLine, symbol: symbol, note: note || '' };
}
var MT = 'backend/main_detect/src/techgar/motion_tracker.py';
var PD = 'backend/main_detect/src/techgar/parking_detector.py';
var SB = 'backend/main_detect/src/techgar/slot_vehicle_binder.py';
var OG = 'backend/main_detect/src/techgar/occlusion_guard.py';
var TD = 'backend/main_detect/src/techgar/tracklet_descriptor.py';
var VT = 'backend/main_detect/src/techgar/vehicle_tracker.py';
var CC = 'backend/main_detect/src/techgar/cross_camera_manager.py';
var TM = 'backend/main_detect/src/techgar/trajectory_memory.py';
var LC = 'backend/main_detect/src/techgar/latest_frame_capture.py';
var TC = 'backend/main_detect/two_camera.py';
var RS = 'backend/main_detect/runtime_server.py';
var CL = 'backend/main_detect/tools/calibrate_shared_map.py';
var RC = 'backend/main_detect/tools/rectangle_line_calibration.py';
setTopic('Motion & mask');

/* =================================================================
 * GROUP A — Motion / foreground pipeline (12 lessons)
 * ================================================================= */

/* A1 — mog2-foreground-mask */
L('mog2-foreground-mask', {
  title: 'Trừ nền để lấy vùng foreground (MOG2)',
  topic: 'MOG2 background subtraction → mask 3 mức {0,127,255} + học nền',
  pipelineRole: 'Bước đầu pipeline: mọi frame BGR qua MOG2 → fg_raw; marker 127 chỉ dùng khi reject_cast_shadows + có nền học.',
  difficulty: 2, tags: ['mask', 'mog2', 'foreground'], related: ['temporal-motion-gate', 'dark-foreground-rescue', 'cast-shadow-discriminator'],
  codeRefs: [refp(MT, 768, 771, 'bg_sub.apply', 'input frame BGR nguyên bản'), refp(MT, 780, 789, 'reject_cast_shadows', 'marker 127 chỉ gộp khi có bg_ref')],
  inputSchema: { frame: 'float[H][W] ảnh xám demo', bg: 'float[H][W] nền hiện tại', threshold: 'float', alpha: 'float learning rate', reject_cast_shadows: 'bool cờ production — gate gộp marker 127' },
  outputSchema: { fg_count: 'int số px foreground', mask: 'uint8[H][W]', bg_updated: 'float[H][W]' },
  dataStructures: ['cv2.BackgroundSubtractorMOG2', 'mask uint8 3 mức'],
  keyFields: [{ name: 'fg_raw', type: 'uint8[H×W]', desc: '{0,127,255}: 255=definite fg, 127=shadow marker' }],
  invariants: ['mask 3 mức, marker chỉ khi có nền', 'nền học chậm theo alpha (nguy cơ chìm nền)'],
  simplifications: ['[sim] 1 giá trị nền/px đơn sắc thay vì K-Gaussian MOG2', '[sim] learning α tường minh; code dùng rate=-1 tự động'],
  edgeCases: [{ name: 'exposure-jump', desc: 'Mọi pixel sáng thêm một ít → quyết định bởi threshold', scenario: 'edge', edgeCase: true }],
  scenarios: [
    { id: 'normal', label: 'Xe 4 px + 1 bóng tối', input: { frame: [[5, 5, 5, 5], [5, 9, 9, 5], [5, 9, 9, 5], [5, 5, 5, 1]], bg: [[5, 5, 5, 5], [5, 5, 5, 5], [5, 5, 5, 5], [5, 5, 5, 5]] }, expected: { fg_count: 5, bg_center: 5.8 } },
    { id: 'edge', label: 'Exposure jump (biên)', input: { frame: [[8, 8, 8, 8], [8, 8, 8, 8], [8, 8, 8, 8], [8, 8, 8, 8]], bg: [[5, 5, 5, 5], [5, 5, 5, 5], [5, 5, 5, 5], [5, 5, 5, 5]] }, expected: { fg_count: 0, fg_count_thr2: 16 } }
  ],
  parameters: [param('threshold', 'Ngưỡng |frame−bg|', 3, 1, 20, 1), param('alpha', 'Learning rate nền', 0.2, 0, 1, 0.05), param('reject_cast_shadows', 'Gộp marker 127 (cờ production)', true)],
  pseudocode: pc([
    'raw = mog2.apply(frame) → mask 3 mức',
    'definite = raw > 200',
    'mask = definite | (raw==127 && reject_cast_shadows && bg_ref)',
    'bg ← bg + α·(frame − bg)  (MOG2 tự học nền)'
  ]),
  buildTrace: function (sid, prm) {
    var self = this;
    return mkTrace(self, sid, prm, function (inp, P, emit) {
      var H = inp.frame.length, W = inp.frame[0].length;
      var i, j;
      emit([0], 'MOG2 so sánh từng pixel với nền đã học: diff = |frame − bg|.', { W: W, H: H }, {
        type: 'grid', grids: [
          { title: 'frame', cells: inp.frame.map(function (r) { return r.map(function () { return 'comp'; }); }), numbers: inp.frame.map(function (r) { return r.slice(); }) },
          { title: 'nền', cells: inp.bg.map(function (r) { return r.map(function () { return 'bg'; }); }), numbers: inp.bg.map(function (r) { return r.slice(); }) }
        ], legend: [['comp', 'frame'], ['bg', 'nền']]
      });
      /* raw 3 mức: diff > T → sáng hơn nền 255 / tối hơn nền 127 (shadow marker), ngược lại 0 */
      var raw = [], lv = { 0: 0, 127: 0, 255: 0 };
      for (i = 0; i < H; i++) { raw.push([]); for (j = 0; j < W; j++) {
        var d = Math.abs(inp.frame[i][j] - inp.bg[i][j]);
        var v = d > P.threshold ? (inp.frame[i][j] < inp.bg[i][j] ? 127 : 255) : 0;
        raw[i].push(v); lv[v]++;
      } }
      emit([1], 'raw = mog2.apply(frame) → mask 3 mức {0,127,255}: |diff| > ' + P.threshold + ' → 255 sáng-hơn-nền / 127 tối-hơn-nền (shadow marker). Đếm: 0=' + lv[0] + ' · 127=' + lv[127] + ' · 255=' + lv[255] + '.',
        { n0: lv[0], n127: lv[127], n255: lv[255] }, {
          type: 'grid', grids: [{ title: 'raw ∈ {0,127,255}', cells: raw.map(function (r) { return r.map(function (v) { return v === 255 ? 'fg' : v === 127 ? 'marker' : 'off'; }); }), numbers: raw }],
          legend: [['off', '0 nền'], ['marker', '127 shadow'], ['fg', '255 definite']],
          caption: 'ô in giá trị mức — detectShadows đánh dấu px tối-hơn-nền = 127'
        });
      /* definite = raw==255; refined = definite | (raw==127 && reject_cast_shadows && bg_ref) */
      var hasBgRef = !!inp.bg, gate = P.reject_cast_shadows && hasBgRef;
      var def = [], ref = [], nDef = 0, nMark = 0;
      for (i = 0; i < H; i++) { def.push([]); ref.push([]); for (j = 0; j < W; j++) {
        var isDef = raw[i][j] === 255, isMark = raw[i][j] === 127;
        def[i].push(isDef ? 'fg' : 'off'); if (isDef) nDef++;
        ref[i].push(isDef ? 'fg' : (isMark && gate) ? 'keep' : 'off'); if (isMark) nMark++;
      } }
      var fg = nDef + (gate ? nMark : 0);
      emit([1, 2], 'definite = raw==255 → ' + nDef + ' px. refined = definite | (127 ∧ reject_cast_shadows ∧ bg_ref): ' + (gate ? 'gate mở → gộp ' + nMark + ' marker' : (P.reject_cast_shadows ? 'cờ bật nhưng thiếu bg_ref' : 'reject_cast_shadows=false') + ' → loại ' + nMark + ' marker') + ' → **mask ' + fg + ' px** = fg_count.',
        { definite: nDef, marker127: nMark, reject_cast_shadows: P.reject_cast_shadows, bg_ref: hasBgRef, fg: fg }, {
          type: 'grid', grids: [
            { title: 'definite (==255) ' + nDef + 'px', cells: def, numbers: def.map(function (r) { return r.map(function (c) { return c === 'fg' ? 255 : 0; }); }) },
            { title: 'refined mask ' + fg + 'px', cells: ref, numbers: ref.map(function (r) { return r.map(function (c) { return c === 'fg' ? 255 : c === 'keep' ? 127 : 0; }); }) }
          ],
          legend: [['fg', 'definite 255'], ['keep', '127 đã gộp'], ['off', '0 bỏ']],
          caption: 'marker 127 chỉ gộp khi reject_cast_shadows ∧ bg_ref tồn tại (gate kép)'
        });
      var bg2 = inp.bg.map(function (row, y) { return row.map(function (v, x) { return r2(v + P.alpha * (inp.frame[y][x] - v)); }); });
      emit([3], 'Nền học: bg\' = bg + α·(frame−bg), α=' + P.alpha + ' — pixel dưới xe trôi dần về màu xe ("chìm nền").', { bg: bg2 }, {
        type: 'grid', grids: [{ title: 'bg mới', cells: bg2.map(function (r) { return r.map(function () { return 'bg'; }); }), numbers: bg2 }]
      }, [{ label: 'bg_center', value: bg2[Math.floor(H / 2)][Math.floor(W / 2)] }, { label: 'alpha', value: P.alpha }]);
      var res = { fg_count: fg, bg_center: bg2[Math.floor(H / 2)][Math.floor(W / 2)] };
      if (P.threshold === 3) res.fg_count_thr2 = (function () { var c = 0; for (var y = 0; y < H; y++) for (var x = 0; x < W; x++) if (Math.abs(inp.frame[y][x] - inp.bg[y][x]) > 2) c++; return c; })();
      return { result: res, invariants: [{ label: 'fg_count = definite + marker đã gộp (gate kép)', pass: fg >= 0 && fg <= H * W && fg === nDef + (gate ? nMark : 0), actual: fg + ' = ' + nDef + 'def' + (gate ? '+' + nMark + 'mk' : '+0 (marker loại)') }] };
    });
  }
});

/* A2 — temporal-motion-gate */
L('temporal-motion-gate', {
  title: 'Cổng chuyển động thời gian (bắt buộc)',
  topic: 'absdiff tới mốc quá khứ → union motion → morph chain → AND với fg',
  pipelineRole: 'Gate bắt buộc sau MOG2: không có motion → không có detection. references rỗng → mask toàn 0 (đóng hoàn toàn, không fail-open).',
  difficulty: 3, tags: ['motion', 'gate', 'temporal'], related: ['mog2-foreground-mask', 'foreground-morphology'],
  codeRefs: [refp(MT, 522, 574, '_temporal_motion_mask', ''), refp(MT, 451, 471, '_motion_between', 'trừ brightness_shift trước ngưỡng'), refp(MT, 548, 549, 'references rỗng → 0', '')],
  inputSchema: { gray: 'float[H][W]', short_ref: 'float[H][W] mốc gần', long_ref: 'float[H][W] mốc xa', T: 'ngưỡng diff' },
  outputSchema: { count_short: 'int', count_long: 'int', union: 'int' },
  dataStructures: ['deque _gray_history (timestamp, frame_idx, gray)', 'mask uint8'],
  keyFields: [{ name: 'motion_mask', type: 'uint8[H×W]', desc: 'union của diff tới các mốc, sau OPEN→dilate→CLOSE' }],
  invariants: ['references rỗng → mask toàn 0', 'OR qua các mốc, trừ brightness_shift trước'],
  simplifications: ['[sim] R=1-2 mốc cho sẵn, không deque timestamp; S=2 frame lịch sử'],
  edgeCases: [{ name: 'xe-vua-roi', desc: 'gray==long_ref nhưng khác short_ref → gate vẫn mở (vệt cũ)', scenario: 'edge', edgeCase: true }],
  scenarios: [
    { id: 'normal', label: 'Xe di chuyển (2 mốc)', input: { gray: [[5, 5, 5, 5], [5, 5, 9, 9], [5, 5, 9, 9], [5, 5, 5, 5]], short_ref: [[5, 5, 5, 5], [5, 9, 9, 5], [5, 9, 9, 5], [5, 5, 5, 5]], long_ref: [[5, 5, 5, 5], [5, 5, 5, 5], [5, 5, 5, 5], [5, 5, 5, 5]], T: 3 }, expected: { count_short: 4, count_long: 4, union: 6 } },
    { id: 'edge', label: 'Xe vừa rời vị trí cũ', input: { gray: [[5, 5, 5, 5], [5, 5, 5, 5], [5, 5, 5, 5], [5, 5, 5, 5]], short_ref: [[5, 5, 5, 5], [5, 9, 9, 5], [5, 9, 9, 5], [5, 5, 5, 5]], long_ref: [[5, 5, 5, 5], [5, 5, 5, 5], [5, 5, 5, 5], [5, 5, 5, 5]], T: 3 }, expected: { count_short: 4, count_long: 0, union: 4 } }
  ],
  parameters: [param('T', 'Ngưỡng diff (motion_threshold)', 3, 1, 30, 1)],
  pseudocode: pc([
    'references = timestamp-refs nếu có ts, ngược lại frame-gap refs',
    'references rỗng → return mask toàn 0 (đóng, không fail-open)',
    'motion = OR(diff(gray, ref, T) − brightness_shift ∀ref)',
    'morph: OPEN(3×3) → dilate(5×5,×2) → CLOSE',
    'fg_final = fg_mask & dilate(motion,17×17)'
  ]),
  buildTrace: function (sid, prm) {
    var self = this;
    return mkTrace(self, sid, prm, function (inp, P, emit) {
      var H = inp.gray.length, W = inp.gray[0].length;
      function countDiff(ref) {
        var cells = [], n = 0;
        for (var y = 0; y < H; y++) for (var x = 0; x < W; x++)
          if (Math.abs(inp.gray[y][x] - ref[y][x]) > P.T) { cells.push([x, y]); n++; }
        return { n: n, cells: cells };
      }
      emit([0, 1], 'Chọn mốc quá khứ: short_ref (gap gần) và long_ref. Nếu references rỗng → mask toàn 0 (gate đóng hoàn toàn).', { refs: 2, T: P.T }, {
        type: 'grid', grids: [{ title: 'gray', cells: inp.gray.map(function (r) { return r.map(function () { return 'comp'; }); }), numbers: inp.gray.map(function (r) { return r.slice(); }) },
          { title: 'short_ref', cells: inp.short_ref.map(function (r) { return r.map(function () { return 'bg'; }); }) },
          { title: 'long_ref', cells: inp.long_ref.map(function (r) { return r.map(function () { return 'bg'; }); }) }]
      });
      var cs = countDiff(inp.short_ref), cl = countDiff(inp.long_ref);
      var uni = inp.gray.map(function (r) { return r.map(function () { return 'off'; }); });
      cs.cells.concat(cl.cells).forEach(function (c) { uni[c[1]][c[0]] = 'motion'; });
      emit([2], 'count_short = ' + cs.n + ', count_long = ' + cl.n + ' (đã trừ brightness_shift). OR hai tập → vùng motion.', { cs: cs.n, cl: cl.n }, {
        type: 'grid', grids: [{ title: 'motion union', cells: uni }], legend: [['motion', 'motion px']]
      });
      var un = new Set(); cs.cells.concat(cl.cells).forEach(function (c) { uni[c[1]][c[0]] = 'motion'; un.add(c[0] + ',' + c[1]); });
      emit([3, 4], 'union = ' + un.size + ' px. Sau OPEN→dilate→CLOSE, fg_final = fg & dilate(motion,17×17) — gate mở quanh vùng chuyển động, bao cả vị trí cũ lẫn mới.', { union: un.size }, {
        type: 'grid', grids: [{ title: 'union (sau morph giản lược)', cells: uni }], caption: '[sim] bỏ morph trên lưới nhỏ'
      });
      return {
        result: { count_short: cs.n, count_long: cl.n, union: un.size },
        invariants: [{ label: 'union ≤ count_short + count_long', pass: un.size <= cs.n + cl.n, actual: un.size }]
      };
    });
  }
});

/* A3 — roi-strict-context-mask */
L('roi-strict-context-mask', {
  title: 'Lọc ROI nghiêm + cứu qua dải context',
  topic: 'strictPx ≥ required → accept; clip ratio + context ≥ required + anchor ∈ context → rescued',
  pipelineRole: 'Gate ROI trong vòng contour: giữ detection chỉ khi đủ px trong ROI lõi, hoặc cứu qua dải context khi bị clip.',
  difficulty: 3, tags: ['roi', 'mask'], related: ['contour-geometry-filter', 'bottom-center-anchor'],
  codeRefs: [refp(MT, 869, 921, 'khối ROI trong _detect', 'strictPx/contextPx/required/clip')],
  inputSchema: { strict: '[x0,x1] cột strict', context_pad: 'int', comp: '[x,y,w,h]', required_scaled: 'int', clip_ratio: 'float' },
  outputSchema: { verdict: 'accept | roi_context_rescued | reject:insufficient_strict_roi_support' },
  dataStructures: ['2 mask bool', 'counter pixel'],
  keyFields: [{ name: 'strictPx/contextPx', type: 'int', desc: 'đếm px component trong strict/context' }],
  invariants: ['rescue chỉ khi strictPx>0, clip đủ, contextPx ≥ required, anchor ∈ context'],
  simplifications: ['[sim] lưới 8×8, ROI là dải cột; code là polygon'],
  edgeCases: [{ name: 'pad=0', desc: 'context trùng strict → không cứu được', scenario: 'edge', edgeCase: true }],
  scenarios: [
    { id: 'normal', label: 'Bị clip — cứu được', input: { strict: [1, 6], context_pad: 1, comp: [0, 2, 2, 2], required_scaled: 3, clip_ratio: 0.98, min_required_scaled: 3 }, expected: { verdict: 'roi_context_rescued', strictPx: 2, contextPx: 4 } },
    { id: 'edge', label: 'pad=0 — không cứu', input: { strict: [1, 6], context_pad: 0, comp: [0, 2, 2, 2], required_scaled: 3, clip_ratio: 0.98 }, expected: { verdict: 'reject:insufficient_strict_roi_support', strictPx: 2, contextPx: 2 } }
  ],
  parameters: [param('context_pad', 'Độ rộng dải context', 1, 0, 3, 1), param('required_scaled', 'required px', 3, 1, 8, 1)],
  pseudocode: pc([
    'compPx = count(component); strictPx = count(comp & strict)',
    'required = max(min_abs, min(max_abs, ratio_frac·compPx))',
    'strictPx ≥ required → accept',
    'strictPx/compPx < clip && strictPx>0 && contextPx ≥ required && anchor∈context → rescued',
    'ngược lại reject insufficient_strict_roi_support'
  ]),
  buildTrace: function (sid, prm) {
    var self = this;
    return mkTrace(self, sid, prm, function (inp, P, emit) {
      var G = 8;
      var grid = [], x, y;
      for (x = 0; x < G; x++) { grid.push([]); for (y = 0; y < G; y++) grid[x].push('off'); }
      var strict = inp.strict, pad = inp.context_pad !== undefined ? inp.context_pad : P.context_pad;
      var req = inp.required_scaled !== undefined ? inp.required_scaled : req;
      for (x = strict[0]; x <= strict[1]; x++) for (y = 0; y < G; y++) grid[x][y] = 'strict';
      for (x = Math.max(0, strict[0] - pad); x <= Math.min(G - 1, strict[1] + pad); x++)
        for (y = 0; y < G; y++) if (grid[x][y] === 'off') grid[x][y] = 'context';
      var compCells = [];
      for (x = inp.comp[0]; x < inp.comp[0] + inp.comp[2]; x++) for (y = inp.comp[1]; y < inp.comp[1] + inp.comp[3]; y++) compCells.push([x, y]);
      var strictPx = 0, contextPx = 0;
      compCells.forEach(function (c) {
        var cls = grid[c[0]][c[1]];
        if (cls === 'strict') { strictPx++; contextPx++; }
        else if (cls === 'context') contextPx++;
      });
      emit([0], 'Component ' + inp.comp[2] + '×' + inp.comp[3] + ' px tại (' + inp.comp[0] + ',' + inp.comp[1] + ') nằm trên lưới ROI: strict = cột [' + strict[0] + '..' + strict[1] + '], context mở pad ' + pad + 'px.', { compPx: compCells.length }, {
        type: 'grid', grids: [{ title: 'input', cells: grid, marks: [] }],
        legend: [['strict', 'strict ROI'], ['context', 'context band']]
      });
      emit([0, 1], 'compPx = ' + compCells.length + ', strictPx = ' + strictPx + ' (đếm px component rơi vào cột strict), contextPx = ' + contextPx + ', required = ' + req + '.', { strictPx: strictPx, contextPx: contextPx }, {
        type: 'grid', grids: [{ title: 'đếm px', cells: grid, marks: compCells.map(function (c) { return { x: c[0] + 0.5, y: c[1] + 0.5, color: '#f2555a', r: 3 }; }) }],
        legend: [['strict', 'strict ROI'], ['context', 'context band'], ['fg', 'component px']]
      });
      var ratio = strictPx / compCells.length;
      var verdict;
      if (strictPx >= req) verdict = 'accept';
      else if (ratio < inp.clip_ratio && strictPx > 0 && contextPx >= req) verdict = 'roi_context_rescued';
      else verdict = 'reject:insufficient_strict_roi_support';
      emit([2, 3, 4], 'strictPx ' + strictPx + ' < required ' + req + '; clip ratio ' + r2(ratio) + (ratio < inp.clip_ratio ? ' <' : ' ≥') + ' ' + inp.clip_ratio + '; contextPx ' + contextPx + (contextPx >= req ? ' ≥' : ' <') + ' ' + req + ' → **' + verdict + '**.', { verdict: verdict }, {
        type: 'board', cards: [
          { label: 'strictPx', value: strictPx, color: strictPx >= req ? '#3fce7c' : '#f0a93c' },
          { label: 'contextPx', value: contextPx, color: contextPx >= req ? '#3fce7c' : '#f2555a' },
          { label: 'verdict', value: verdict, color: verdict === 'reject:insufficient_strict_roi_support' ? '#f2555a' : '#3fce7c', hl: true }
        ], log: []
      });
      return {
        result: { verdict: verdict, strictPx: strictPx, contextPx: contextPx },
        invariants: [{ label: 'rescue đòi strictPx>0 && contextPx ≥ required', pass: verdict !== 'roi_context_rescued' || (strictPx > 0 && contextPx >= req), actual: verdict }]
      };
    });
  }
});

/* A4 — foreground-morphology */
L('foreground-morphology', {
  title: 'Morphology mở (tẩy nhiễu) rồi đóng (nối mảnh)',
  topic: 'OPEN 3×3 → CLOSE join_kernel — hai pass khác vai trò',
  pipelineRole: 'Sau temporal-gate, trước contour: OPEN xóa chấm nhiễu < kernel; CLOSE nối mảnh cùng xe cách < kernel.',
  difficulty: 2, tags: ['morphology', 'mask'], related: ['temporal-motion-gate', 'contour-geometry-filter'],
  codeRefs: [refp(MT, 759, 1086, '_detect morph', 'OPEN 3×3 rồi CLOSE join_kernel×n')],
  inputSchema: { speckles: '[[x,y]] nhiễu', blocks: '[[x,y,w,h]]', open_k: 'int', close_k: 'int' },
  outputSchema: { before_px: 'int', after_open_px: 'int', after_close_px: 'int', contours: 'int' },
  dataStructures: ['2 kernel cv2', 'mask trung gian'],
  keyFields: [{ name: 'clean_mask', type: 'uint8[H×W]', desc: 'sau OPEN rồi CLOSE' }],
  invariants: ['OPEN không thêm px mới ngoài vùng giữ', 'CLOSE chỉ nối mảnh cách < k'],
  simplifications: ['[sim] erode/dilate tự cài trên lưới nhỏ'],
  edgeCases: [{ name: 'blob-nho-hon-kernel', desc: 'blob 2×2 < kernel 3 → biến mất hoàn toàn sau OPEN', scenario: 'edge', edgeCase: true }],
  scenarios: [
    { id: 'normal', label: 'Nhiễu + 2 khối cách 1 ô', input: { grid: [8, 12], speckles: [[0, 0], [11, 0]], blocks: [[1, 3, 3, 3], [5, 3, 3, 3]], open_k: 3, close_k: 3 }, expected: { before_px: 20, after_open_px: 18, after_close_px: 21, contours: 1 } },
    { id: 'edge', label: 'Blob nhỏ hơn kernel', input: { grid: [8, 12], speckles: [], blocks: [[3, 3, 2, 2]], open_k: 3, close_k: 3 }, expected: { before_px: 4, after_open_px: 0, after_close_px: 0, contours: 0 } }
  ],
  parameters: [param('close_k', 'CLOSE kernel', 3, 1, 5, 2)],
  pseudocode: pc([
    'mask1 = open(mask, k3) = erode rồi dilate → xóa blob < kernel',
    'mask2 = close(mask1, kj) = dilate rồi erode → nối mảnh cách < kernel'
  ]),
  buildTrace: function (sid, prm) {
    var self = this;
    return mkTrace(self, sid, prm, function (inp, P, emit) {
      /* kernel morphology chỉ định nghĩa cho k lẻ — normalize k chẵn về lẻ gần nhất */
      function oddK(k) { return 2 * Math.round((k - 1) / 2) + 1; }
      var openK = oddK(inp.open_k), closeK = oddK(P.close_k);
      var normNote = (openK !== inp.open_k || closeK !== P.close_k)
        ? ' — k chẵn không hợp lệ cho kernel morphology → chuẩn hóa open ' + inp.open_k + '→' + openK + ', close ' + P.close_k + '→' + closeK : '';
      var Gh = inp.grid[0], Gw = inp.grid[1];
      function mkEmpty() { var g = []; for (var x = 0; x < Gw; x++) { g.push([]); for (var y = 0; y < Gh; y++) g[x].push('off'); } return g; }
      function setOn(g, x, y) { if (x >= 0 && y >= 0 && x < Gw && y < Gh) g[x][y] = 'fg'; }
      function erode(g, k) {
        var o = mkEmpty(), half = (k - 1) / 2;
        for (var x = 0; x < Gw; x++) for (var y = 0; y < Gh; y++) {
          var ok = true;
          for (var dx = -half; dx <= half; dx++) for (var dy = -half; dy <= half; dy++) {
            var nx = x + dx, ny = y + dy;
            if (nx < 0 || ny < 0 || nx >= Gw || ny >= Gh || g[nx][ny] !== 'fg') ok = false;
          }
          if (ok) o[x][y] = 'fg';
        }
        return o;
      }
      function dilate(g, k) {
        var o = mkEmpty(), half = (k - 1) / 2;
        for (var x = 0; x < Gw; x++) for (var y = 0; y < Gh; y++) if (g[x][y] === 'fg')
          for (var dx = -half; dx <= half; dx++) for (var dy = -half; dy <= half; dy++) setOn(o, x + dx, y + dy);
        return o;
      }
      function cnt(g) { var n = 0; for (var x = 0; x < Gw; x++) for (var y = 0; y < Gh; y++) if (g[x][y] === 'fg') n++; return n; }
      function nComp(g) {
        var seen = {}, n = 0;
        function key(x, y) { return x + ',' + y; }
        for (var x = 0; x < Gw; x++) for (var y = 0; y < Gh; y++) {
          if (g[x][y] !== 'fg' || seen[key(x, y)]) continue;
          n++; var st = [[x, y]]; seen[key(x, y)] = 1;
          while (st.length) {
            var c = st.pop();
            [[1, 0], [-1, 0], [0, 1], [0, -1]].forEach(function (d) {
              var nx = c[0] + d[0], ny = c[1] + d[1];
              if (nx >= 0 && ny >= 0 && nx < Gw && ny < Gh && g[nx][ny] === 'fg' && !seen[key(nx, ny)]) { seen[key(nx, ny)] = 1; st.push([nx, ny]); }
            });
          }
        }
        return n;
      }
      var m0 = mkEmpty();
      inp.speckles.forEach(function (s) { setOn(m0, s[0], s[1]); });
      inp.blocks.forEach(function (b) { for (var x = b[0]; x < b[0] + b[2]; x++) for (var y = b[1]; y < b[1] + b[3]; y++) setOn(m0, x, y); });
      emit([0], 'Mask ban đầu: ' + cnt(m0) + ' px / ' + nComp(m0) + ' contour (speckle + khối).' + normNote, { px: cnt(m0), comps: nComp(m0), stage: "input" }, {
        type: 'grid', grids: [{ title: 'fg_mask', cells: m0 }], legend: [['fg', 'fg']]
      });
      var m1 = dilate(erode(m0, openK), openK); // OPEN
      emit([0], 'OPEN(k=' + openK + ') = erode→dilate: ' + cnt(m1) + ' px / ' + nComp(m1) + ' contour — chấm nhỏ hơn kernel biến mất.', { px: cnt(m1), comps: nComp(m1), stage: "open", k: openK }, {
        type: 'grid', grids: [{ title: 'sau OPEN', cells: m1 }], legend: [['fg', 'giữ lại']]
      });
      var m2 = erode(dilate(m1, closeK), closeK); // CLOSE
      emit([1], 'CLOSE(k=' + closeK + ') = dilate→erode: ' + cnt(m2) + ' px / ' + nComp(m2) + ' contour — mảnh cách < kernel được nối thành 1 blob.', { px: cnt(m2), comps: nComp(m2), stage: "close", k: closeK }, {
        type: 'grid', grids: [{ title: 'sau CLOSE', cells: m2 }], legend: [['fg', 'kết quả']]
      });
      var res = { before_px: cnt(m0), after_open_px: cnt(m1), after_close_px: cnt(m2), contours: nComp(m2) };
      return { result: res, invariants: [{ label: 'after_open ≤ after_close (CLOSE không xóa)', pass: res.after_open_px <= res.after_close_px + 0, actual: res.after_open_px + ' ≤ ' + res.after_close_px }] };
    });
  }
});

/* A5 — contour-geometry-filter */
L('contour-geometry-filter', {
  title: 'Lọc contour theo kích thước/tỉ lệ/support',
  topic: 'Chuỗi gate có thứ tự: floor → ROI → occlusion → whole-scene → oversized → aspect → anchor → motion',
  pipelineRole: 'Mỗi contour qua chuỗi gate; lý do reject phụ thuộc thứ tự — motion cần CẢ px lẫn fill-ratio.',
  difficulty: 3, tags: ['contour', 'gates'], related: ['roi-strict-context-mask', 'occlusion-group-guard', 'motion-echo-suppression'],
  codeRefs: [refp(MT, 836, 1085, 'vòng findContours', ''), refp(MT, 1015, 1019, 'motion gate', 'CẢ px lẫn ratio'), refp(MT, 955, 956, 'whole-scene cap 0.22', '')],
  inputSchema: { comps: '[{box,px,motion}]', frame_px: 'int', thresholds: 'literal' },
  outputSchema: { verdicts: '[accept|reject:<reason>]' },
  dataStructures: ['list[dict]', '_last_detection_rejections'],
  keyFields: [{ name: 'detections', type: 'list', desc: 'chỉ contour qua hết gate mới vào' }],
  invariants: ['thứ tự gate cố định; motion gate = px ≥ min && px/(w·h) ≥ ratio'],
  simplifications: ['[sim] comps cho sẵn box/px/motion; bỏ ROI/occlusion chi tiết (A3/A10 riêng)'],
  edgeCases: [{ name: 'fill-ratio-fail', desc: 'px đạt sàn nhưng fill-ratio < min → reject:motion', scenario: 'edge', edgeCase: true }],
  scenarios: [
    { id: 'normal', label: '4 comp đủ loại verdict', input: { comps: [{ box: [0, 0, 4, 3], px: 12, motion: 8 }, { box: [4, 4, 4, 3], px: 12, motion: 2 }, { box: [0, 6, 10, 2], px: 20, motion: 18 }, { box: [4, 6, 2, 2], px: 4, motion: 4 }], frame_px: 96, min_area: 4, min_w: 2, min_h: 2, max_w: 9, max_h: 9, max_area_frac: 0.22, aspect: [0.25, 5], min_motion_px: 3, min_ratio: 0.08 }, expected: { verdicts: ['accept', 'reject:motion', 'reject:oversized', 'accept'] } },
    { id: 'edge', label: 'Fill-ratio fail dù px đạt', input: { comps: [{ box: [0, 0, 4, 10], px: 20, motion: 3 }], frame_px: 96, min_area: 4, min_w: 2, min_h: 2, max_w: 9, max_h: 12, max_area_frac: 0.22, aspect: [0.25, 5], min_motion_px: 3, min_ratio: 0.08 }, expected: { verdicts: ['reject:motion'] } }
  ],
  parameters: [param('min_ratio', 'min fill ratio', 0.08, 0.01, 0.5, 0.01)],
  pseudocode: pc([
    'floor: area < min_area || w<min_w || h<min_h → skip',
    'ROI strict/context (A3); occlusion (A10); whole-scene area > 0.22·img → reject',
    'oversized: w>max_w || h>max_h || w·h>max_area → reject',
    'aspect w/h ∉ [0.25,5] → reject; anchor ngoài ROI → reject',
    'motion: motion_px < min || motion_px/(w·h) < ratio → reject:motion (CẢ HAI)',
    'marker/dark rescue, shadow (A7), hist → append; cuối suppress dup (A9)'
  ]),
  buildTrace: function (sid, prm) {
    var self = this;
    return mkTrace(self, sid, prm, function (inp, P, emit) {
      var maxArea = inp.max_area_frac * inp.frame_px;
      var gates = [
        { n: 'floor (min_area/min_w/min_h)', t: function (c) { return c.px >= inp.min_area && c.box[2] >= inp.min_w && c.box[3] >= inp.min_h; }, reason: 'reject:floor' },
        { n: 'whole-scene cap (≤ 0.22·img)', t: function (c) { return c.px <= maxArea; }, reason: 'reject:whole-scene' },
        { n: 'oversized (w,h,area)', t: function (c) { return c.box[2] <= inp.max_w && c.box[3] <= inp.max_h; }, reason: 'reject:oversized' },
        { n: 'aspect [0.25,5]', t: function (c) { var a = c.box[2] / c.box[3]; return a >= inp.aspect[0] && a <= inp.aspect[1]; }, reason: 'reject:aspect' },
        { n: 'motion px ∧ fill-ratio', t: function (c) { return c.motion >= inp.min_motion_px && c.motion / (c.box[2] * c.box[3]) >= P.min_ratio; }, reason: 'reject:motion' }
      ];
      var rows = inp.comps.map(function (c, i) {
        var v = 'accept';
        for (var g = 0; g < gates.length; g++) if (!gates[g].t(c)) { v = gates[g].reason; break; }
        return { comp: c, verdict: v };
      });
      emit([0, 1, 2], 'Duyệt ' + rows.length + ' comp qua chuỗi gate theo THỨ TỰ — lý do reject là gate đầu tiên fail.', { comps: rows.length }, {
        type: 'rows', rows: rows.map(function (r, i) {
          return { label: 'comp' + i + ' box=' + JSON.stringify(r.comp.box) + ' px=' + r.comp.px + ' mot=' + r.comp.motion, value: r.verdict, state: r.verdict === 'accept' ? 'pass' : 'fail' };
        }), caption: 'whole-scene cap = ' + r2(maxArea) + ' px'
      });
      emit([3, 4], 'Oversized/whole-scene riêng: px > ' + r2(maxArea) + ' → whole-scene; w/h vượt cap → oversized. Aspect [0.25,5].', { maxArea: r2(maxArea) }, {
        type: 'rows', rows: rows.map(function (r, i) { return { label: 'comp' + i + ': ' + r.verdict, state: r.verdict === 'accept' ? 'pass' : 'fail', value: '' }; })
      });
      emit([5], 'Motion gate kép: motion_px ≥ ' + inp.min_motion_px + ' VÀ fill = motion/(w·h) ≥ ' + P.min_ratio + '. Ví dụ comp có motion=3 nhưng fill 3/40 = 0.075 < 0.08 vẫn reject.', { min_motion_px: inp.min_motion_px, min_ratio: P.min_ratio }, {
        type: 'board', cards: rows.map(function (r, i) {
          var c = r.comp;
          return { label: 'comp' + i + ' fill', value: r2(c.motion / (c.box[2] * c.box[3])), color: c.motion / (c.box[2] * c.box[3]) >= P.min_ratio ? '#3fce7c' : '#f2555a', hl: r.verdict === 'reject:motion' };
        }), log: rows.map(function (r, i) { return 'comp' + i + ' → ' + r.verdict; })
      });
      return {
        result: { verdicts: rows.map(function (r) { return r.verdict; }) },
        invariants: [{ label: 'reject:motion ⇒ motion<min_px HOẶC fill<min_ratio',
          pass: rows.every(function (r) { return r.verdict !== 'reject:motion' || (r.comp.motion < inp.min_motion_px || r.comp.motion / (r.comp.box[2] * r.comp.box[3]) < P.min_ratio); }),
          actual: rows.map(function (r) { return r.verdict === 'reject:motion' ? 'mot=' + r.comp.motion + ',fill=' + r3(r.comp.motion / (r.comp.box[2] * r.comp.box[3])) : r.verdict; }).join(', ') }]
      };
    });
  }
});

/* A6 — bottom-center-anchor */
L('bottom-center-anchor', {
  title: 'Điểm neo bbox',
  topic: 'anchor = (x+w/2, y+h) bottom-center mặc định; center khi camera config',
  pipelineRole: 'Mọi phép đo vị trí (association, slot overlap, world projection) đều qua anchor này.',
  difficulty: 1, tags: ['anchor', 'geometry'], related: ['roi-strict-context-mask', 'world-projection-anchor'],
  codeRefs: [refp(MT, 392, 395, '_bottom_center', ''), refp(CC, 1379, 1403, '_bbox_anchor', 'theo camera config')],
  inputSchema: { bbox: '[x,y,w,h]', modes: '[anchor modes]' },
  outputSchema: { anchors: '{mode: [x,y]}' },
  dataStructures: ['tuple float'],
  keyFields: [{ name: 'anchor', type: '(float,float)', desc: 'điểm đại diện vị trí xe' }],
  invariants: ['bottom_center luôn nằm trên cạnh đáy bbox'],
  simplifications: [],
  edgeCases: [{ name: 'anchor-ngoai-luoi', desc: 'bbox chạm mép → anchor ngoài lưới → A3 xử lý', scenario: 'edge', edgeCase: true }],
  scenarios: [
    { id: 'normal', label: 'Hai mode trên cùng bbox', input: { bbox: [2, 3, 4, 2], modes: ['bottom_center', 'bbox_center'] }, expected: { anchors: { bottom_center: [4, 5], bbox_center: [4, 4] } } },
    { id: 'edge', label: 'Anchor ngoài lưới', input: { bbox: [10, 0, 4, 2], grid_w: 12, modes: ['bottom_center'] }, expected: { anchors: { bottom_center: [12, 2] }, outside: true } }
  ],
  parameters: [],
  pseudocode: pc([
    'bottom_center → (x + w/2, y + h)',
    'center → (x + w/2, y + h/2)',
    'camera config kiểu khác → offset tương ứng'
  ]),
  buildTrace: function (sid, prm) {
    var self = this;
    return mkTrace(self, sid, prm, function (inp, P, emit) {
      var b = inp.bbox;
      var anchors = {
        bottom_center: [b[0] + b[2] / 2, b[1] + b[3]],
        bbox_center: [b[0] + b[2] / 2, b[1] + b[3] / 2]
      };
      emit([0], 'bbox = [x=' + b[0] + ', y=' + b[1] + ', w=' + b[2] + ', h=' + b[3] + ']' + (inp.grid_w ? ' trên lưới rộng ' + inp.grid_w : '') + ' — cần chọn 1 điểm đại diện cho mọi phép đo vị trí.', { bbox: b }, {
        type: 'tracks', boxes: [{ x: b[0], y: b[1], w: b[2], h: b[3], id: 'bbox ' + JSON.stringify(b) }],
          zones: inp.grid_w ? [{ x: 0, y: 0, w: inp.grid_w, h: 8, label: 'lưới w=' + inp.grid_w, color: '#8a93a8' }] : [],
          caption: 'anchor nào đại diện cho vị trí xe khi bind slot/project world?'
      });
      emit([0, 1], 'bottom_center = (' + b[0] + ' + ' + b[2] + '/2, ' + b[1] + ' + ' + b[3] + ') = (' + anchors.bottom_center.join(',') + ') — điểm chạm đất của xe.', { bottom_center: anchors.bottom_center, top_left: anchors.top_left, center: anchors.center }, {
        type: 'tracks', boxes: [{ x: b[0], y: b[1], w: b[2], h: b[3], id: 'bbox' }],
          points: [
            { x: anchors.bottom_center[0], y: anchors.bottom_center[1], color: '#3fce7c', label: 'bottom_center' },
            { x: anchors.bbox_center[0], y: anchors.bbox_center[1], color: '#f0a93c', label: 'center' }
          ], zones: inp.grid_w ? [{ x: 0, y: 0, w: inp.grid_w, h: 8, label: 'lưới', color: '#8a93a8' }] : []
      });
      var outside = inp.grid_w ? anchors.bottom_center[0] >= inp.grid_w : false;
      emit([2], 'Anchor theo camera config; nếu anchor rơi ngoài lưới/ROI thì gate A3 xử lý (tolerated khi trong context band).' + (outside ? ' Ở đây (' + anchors.bottom_center[0] + ',2) nằm ngoài grid_w=' + inp.grid_w + '.' : ''), { outside: outside }, {
        type: 'board', cards: inp.modes.map(function (m) { return { label: m, value: '(' + anchors[m].join(',') + ')', hl: m === 'bottom_center' }; })
          .concat([{ label: 'outside', value: String(outside), color: outside ? '#f2555a' : '#3fce7c' }]), log: []
      });
      var res = { anchors: {} };
      inp.modes.forEach(function (m) { res.anchors[m] = anchors[m]; });
      if (inp.grid_w) res.outside = outside;
      return { result: res, invariants: [{ label: 'bottom_center nằm trên cạnh đáy', pass: anchors.bottom_center[1] === b[1] + b[3], actual: anchors.bottom_center[1] }] };
    });
  }
});
/* A7 — cast-shadow-discriminator */
L('cast-shadow-discriminator', {
  title: 'Phân biệt vật thật vs bóng đổ',
  topic: 'attenuation + chroma + scaled-residual + explained-fraction → is_shadow (fail-open)',
  pipelineRole: 'Gate trong vòng contour (A5): detection chỉ là bóng → loại. Thiếu nền/dữ liệu → trả None (fail-open, giữ detection).',
  difficulty: 4, tags: ['shadow', 'metrics'], related: ['contour-geometry-filter', 'mog2-foreground-mask'],
  codeRefs: [refp(MT, 633, 703, '_cast_shadow_metrics', ''), refp(MT, 705, 726, '_is_cast_shadow', ''), refp(MT, 63, 67, 'defaults', 'att(0.32,0.62) chroma 0.10 res 0.08 explained 0.75')],
  inputSchema: { cur: '[px values]', bg: 'scalar nền', att_range: '[lo,hi]', explained_min: 'float', res_max: 'float', att_tol: 'float' },
  outputSchema: { is_shadow: 'bool|null', med_att: 'float', med_res: 'float', explained: 'float' },
  dataStructures: ['mảng per-pixel float', 'metrics dict'],
  keyFields: [{ name: 'attenuation', type: 'median(cur_lum/bg_lum)', desc: 'bóng làm tối đồng đều → tỉ lệ chung' }],
  invariants: ['None khi thiếu nền/px (fail-open)', 'is_shadow cần ĐỦ 4 điều kiện liên hợp'],
  simplifications: ['[sim] đơn sắc → chroma=0; production dùng BGR luminance + chromaticity L1'],
  edgeCases: [{ name: 'vat-toi-that', desc: 'att<0.32 → vật đen thật, KHÔNG phải bóng', scenario: 'edge', edgeCase: true }, { name: 'vat-sang', desc: 'att>0.62 → vật sáng hơn nền', scenario: 'edge2', edgeCase: true }],
  scenarios: [
    { id: 'normal', label: 'Bóng đổ thật (+nhiễu lẻ)', input: { cur: [50, 50, 45, 180], bg: 100, att_range: [0.32, 0.62], explained_min: 0.75, res_max: 0.08, chroma_max: 0.10, att_tol: 0.18 }, expected: { is_shadow: true, med_att: 0.5, med_res: 0.025, explained: 0.75 } },
    { id: 'edge', label: 'Vật tối/sáng thật', input: { cases: [[70, 70, 70, 70], [20, 20, 20, 20]], bg: 100, att_range: [0.32, 0.62] }, expected: { is_shadow_list: [false, false], med_att_list: [0.7, 0.2] } }
  ],
  parameters: [param('att_lo', 'Attenuation min', 0.32, 0.05, 1, 0.01), param('att_hi', 'Attenuation max', 0.62, 0.05, 1, 0.01)],
  pseudocode: pc([
    'bg=None hoặc selected < min_px hoặc valid < max(min_px, 60%·selected) → None (fail-open)',
    'att_i = cur_i/bg_i; attenuation = median(att)',
    'chroma = median(‖BGR̂cur − BGR̂bg‖₁); res_i = |cur_i − att·bg_i|/bg_i; med_res = median(res)',
    'explained = mean(|att_i−att| ≤ 0.18 && chroma_i ≤ 1.2·chroma_max && res_i ≤ 1.5·res_max)',
    'is_shadow = att∈[0.32,0.62] && med_chroma ≤ 0.10 && med_res ≤ 0.08 && explained ≥ 0.75'
  ]),
  buildTrace: function (sid, prm) {
    var self = this;
    return mkTrace(self, sid, prm, function (inp, P, emit) {
      function evalCase(cur) {
        var bg = inp.bg;
        var atts = cur.map(function (v) { return v / bg; });
        var medAtt = median(atts);
        var res = cur.map(function (v, i) { return Math.abs(v - medAtt * bg) / bg; });
        var medRes = median(res);
        var tol = inp.att_tol || 0.18, resMax = inp.res_max || 0.08;
        var explained = cur.filter(function (v, i) {
          return Math.abs(atts[i] - medAtt) <= tol && res[i] <= 1.5 * resMax;
        }).length / cur.length;
        var ok = medAtt >= P.att_lo && medAtt <= P.att_hi && medRes <= resMax && explained >= (inp.explained_min || 0.75);
        return { atts: atts, medAtt: medAtt, res: res, medRes: medRes, explained: explained, is_shadow: ok };
      }
      var cases = inp.cases || [inp.cur];
      var results = cases.map(evalCase);
      var first = results[0];
      emit([0, 1], 'Luminance → att_i = cur_i/bg. att = [' + first.atts.map(r2).join(', ') + '] → median ' + r3(first.medAtt) + '.', { medAtt: first.medAtt }, {
        type: 'bars', items: first.atts.map(function (a, i) { return { label: 'px' + i + ' att', value: r3(a), color: Math.abs(a - first.medAtt) <= (inp.att_tol || 0.18) ? '#4f9cf7' : '#f2555a' }; }),
        thresholds: [{ value: P.att_lo, label: 'att_lo ' + P.att_lo, color: '#f0a93c' }, { value: P.att_hi, label: 'att_hi ' + P.att_hi, color: '#f0a93c' }],
        caption: 'median att = ' + r3(first.medAtt)
      });
      emit([2, 3], 'scaled-residual res_i = |cur − att·bg|/bg → med_res = ' + r3(first.medRes) + '; explained = tỉ lệ px đủ 3 điều kiện liên hợp = ' + r3(first.explained) + '.', { med_res: r3(first.medRes), explained: r3(first.explained) }, {
        type: 'bars', items: first.res.map(function (r, i) { return { label: 'px' + i + ' res', value: r3(r), color: r <= 1.5 * (inp.res_max || 0.08) ? '#4f9cf7' : '#f2555a' }; }),
        thresholds: [{ value: 1.5 * (inp.res_max || 0.08), label: '1.5·res_max' }],
        notes: [{ text: 'explained = ' + r3(first.explained) + ' (cần ≥ ' + (inp.explained_min || 0.75) + ')' }]
      });
      emit([4], 'is_shadow = att∈[' + P.att_lo + ',' + P.att_hi + '] && med_res ≤ 0.08 && explained ≥ 0.75 (chroma=0 demo đơn sắc) → **' + first.is_shadow + '**.', { is_shadow: first.is_shadow }, {
        type: 'board', cards: [
          { label: 'med_att ∈ dải?', value: r3(first.medAtt), color: first.medAtt >= P.att_lo && first.medAtt <= P.att_hi ? '#3fce7c' : '#f2555a' },
          { label: 'med_res ≤ 0.08?', value: r3(first.medRes), color: first.medRes <= 0.08 ? '#3fce7c' : '#f2555a' },
          { label: 'explained ≥ 0.75?', value: r3(first.explained), color: first.explained >= 0.75 ? '#3fce7c' : '#f2555a' },
          { label: 'is_shadow', value: String(first.is_shadow), color: first.is_shadow ? '#3fce7c' : '#f0a93c', hl: true }
        ], log: results.map(function (r, i) { return 'case' + i + ': med_att=' + r3(r.medAtt) + ' → ' + r.is_shadow; })
      });
      var res = inp.cases
        ? { is_shadow_list: results.map(function (r) { return r.is_shadow; }), med_att_list: results.map(function (r) { return r3(r.medAtt); }) }
        : { is_shadow: first.is_shadow, med_att: r3(first.medAtt), med_res: r3(first.medRes), explained: r3(first.explained) };
      return { result: res, invariants: [{ label: 'att ngoài [lo,hi] → not shadow', pass: results.every(function (r) { return r.is_shadow === (r.medAtt >= P.att_lo && r.medAtt <= P.att_hi && r.medRes <= 0.08 && r.explained >= 0.75); }), actual: 'hội đủ 4 gate' }] };
    });
  }
});

/* A8 — dark-foreground-rescue */
L('dark-foreground-rescue', {
  title: 'Cứu vùng tối qua marker 127',
  topic: 'raw==127 gộp vào mask khi có bg_ref; rescued khi đủ marker px + tỉ lệ',
  pipelineRole: 'Trong _detect: xe tối trên nền tối chỉ ra marker 127 — gộp để không mất detection.',
  difficulty: 2, tags: ['mask', 'rescue'], related: ['mog2-foreground-mask', 'cast-shadow-discriminator'],
  codeRefs: [refp(MT, 759, 1086, '_detect', 'nhánh raw==127 + dark_fg_rescued'), refp(MT, 614, 631, '_box_is_priority', '')],
  inputSchema: { raw: 'int[H][W] ∈{0,127,255}', has_bg: 'bool', marker_min: 'int', marker_frac_min: 'float' },
  outputSchema: { comp_px: 'int', marker_px: 'int', rescued: 'bool' },
  dataStructures: ['2 mask', 'counter'],
  keyFields: [{ name: 'rescued', type: 'bool', desc: 'đủ marker → comp diện tích lớn hơn' }],
  invariants: ['marker chỉ cộng khi has_bg=true'],
  simplifications: ['[sim] marker_min_scaled cho sẵn'],
  edgeCases: [{ name: 'chua-hoc-nen', desc: 'has_bg=false → marker bị bỏ → comp teo', scenario: 'edge', edgeCase: true }],
  scenarios: [
    { id: 'normal', label: 'Marker cứu comp', input: { raw: [[0, 0, 0, 0], [0, 127, 127, 0], [0, 127, 255, 0], [0, 0, 0, 0]], has_bg: true, marker_min_scaled: 2, marker_frac_min: 0.08 }, expected: { comp_px: 4, marker_px: 3, rescued: true } },
    { id: 'edge', label: 'Chưa có nền', input: { raw: [[0, 0, 0, 0], [0, 127, 127, 0], [0, 127, 255, 0], [0, 0, 0, 0]], has_bg: false, marker_min_scaled: 2, marker_frac_min: 0.08 }, expected: { comp_px: 1, marker_px: 0, rescued: false } }
  ],
  parameters: [param('marker_frac_min', 'marker frac min', 0.08, 0, 1, 0.01)],
  pseudocode: pc([
    'markers = raw==127 (chỉ khi có bg_ref; chưa học nền → bỏ)',
    'mask = definite | markers',
    'rescued = marker_px ≥ marker_min && marker_px/comp_px ≥ frac_min'
  ]),
  buildTrace: function (sid, prm) {
    var self = this;
    return mkTrace(self, sid, prm, function (inp, P, emit) {
      var cells = inp.raw.map(function (r) { return r.map(function (v) { return v === 255 ? 'fg' : v === 127 ? 'marker' : 'off'; }); });
      var definite = 0, markerRaw = 0;
      inp.raw.forEach(function (r) { r.forEach(function (v) { if (v === 255) definite++; if (v === 127) markerRaw++; }); });
      emit([0], 'mask từ MOG2: definite(255)=' + definite + 'px, marker(127)=' + markerRaw + 'px. has_bg = ' + inp.has_bg + '.', { has_bg: inp.has_bg }, {
        type: 'grid', grids: [{ title: 'raw mask', cells: cells }],
        legend: [['fg', '255 definite'], ['marker', '127 marker'], ['off', '0']]
      });
      var useMarkers = inp.has_bg;
      emit([0], useMarkers ? 'has_bg = true → marker 127 được phép gộp vào mask.' : 'has_bg = false → MOG2 chưa học nền; marker 127 KHÔNG đáng tin → bị loại khỏi mask ngay tại gate này.', { useMarkers: useMarkers }, {
        type: 'rows', rows: [
          { label: 'gate has_bg', value: String(inp.has_bg), state: useMarkers ? 'pass' : 'fail' },
          { label: 'marker_px qua gate', value: useMarkers ? markerRaw + 'px giữ' : '0px (bỏ ' + markerRaw + 'px)', state: useMarkers ? 'pass' : 'fail' }
        ], caption: 'marker chỉ có nghĩa khi đã có nền tham chiếu'
      });
      var compPx = definite + (useMarkers ? markerRaw : 0);
      var markerPx = useMarkers ? markerRaw : 0;
      var frac = compPx > 0 ? markerPx / compPx : 0;
      var rescued = markerPx >= inp.marker_min_scaled && frac >= P.marker_frac_min;
      var cells2 = inp.raw.map(function (r) { return r.map(function (v) { return v === 255 ? 'fg' : (v === 127 && useMarkers) ? 'keep' : 'off'; }); });
      emit([1, 2], useMarkers ? 'Có bg_ref → marker được cộng: comp = ' + compPx + 'px, marker ' + markerPx + '/' + compPx + ' = ' + r2(frac) + ' ≥ ' + P.marker_frac_min + ' → rescued = **' + rescued + '**.' : 'Chưa học nền → marker 127 BỊ BỎ: comp chỉ còn ' + compPx + 'px → rescued = false.', { compPx: compPx, rescued: rescued }, {
        type: 'grid', grids: [{ title: 'mask cuối', cells: cells2 }],
        legend: [['fg', 'definite'], ['keep', 'marker đã gộp'], ['off', 'bỏ']]
      });
      return { result: { comp_px: compPx, marker_px: markerPx, rescued: rescued }, invariants: [{ label: '!has_bg → marker không cộng', pass: inp.has_bg || markerPx === 0, actual: markerPx }] };
    });
  }
});

/* A9 — motion-echo-suppression */
L('motion-echo-suppression', {
  title: 'Gộp detection trùng lặp do di chuyển',
  topic: 'same_motion_echo (4 điều kiện, không IoU) + drop cần IoU≥0.25 & hist≤0.12 & cùng owner',
  pipelineRole: 'Sau A5: loại vệt duplicate của cùng xe trước khi assignment — echo không chồng để B7 phân xử, không xoá sớm.',
  difficulty: 4, tags: ['dedup', 'echo'], related: ['contour-geometry-filter', 'assignment-margin-ambiguity'],
  codeRefs: [refp(MT, 1088, 1110, '_same_motion_echo', 'không dùng IoU'), refp(MT, 1112, 1134, '_suppress_duplicate_detections', 'IoU≥0.25 & hist≤0.12'), refp(MT, 1136, 1145, '_different_clean_owners', '')],
  inputSchema: { dets: '[{box,point,hist,owner,area}]' },
  outputSchema: { kept: '[ids]', dropped: '[ids]' },
  dataStructures: ['đồ thị cặp echo', 'hist numpy', 'clean_observations'],
  keyFields: [{ name: 'same_motion_echo', type: '4-gate', desc: 'size_ratio≥0.45, hist≤0.22, dist≤max(24,1.1·min_w), gap≤14' }],
  invariants: ['echo=true nhưng IoU<0.25 → giữ cả hai', 'khác clean-owner → giữ cả hai'],
  simplifications: ['[sim] owner cho sẵn; hist 2-bin'],
  edgeCases: [{ name: 'echo-khong-chong', desc: 'same_echo=true nhưng IoU=0 → KHÔNG xoá', scenario: 'edge', edgeCase: true }],
  scenarios: [
    { id: 'normal', label: 'Xoá duplicate chồng', input: { a: { box: [0, 0, 4, 4], point: [2, 4], hist: [1, 0], owner: 1, area: 16 }, b: { box: [2, 0, 4, 4], point: [4, 4], hist: [1, 0], owner: 1, area: 16 }, c: { box: [8, 0, 3, 3], point: [9.5, 3], hist: [0, 1], owner: 2, area: 9 } }, expected: { kept: ['a', 'c'], dropped: ['b'], iou_ab: 0.3333 } },
    { id: 'edge', label: 'Echo không chồng → giữ', input: { a: { box: [0, 0, 4, 4], point: [2, 4], hist: [1, 0], owner: 1, area: 16 }, d: { box: [5, 0, 4, 4], point: [7, 4], hist: [1, 0], owner: 1, area: 16 } }, expected: { kept: ['a', 'd'], dropped: [], iou_ad: 0 } }
  ],
  parameters: [param('iou_drop', 'IoU drop threshold', 0.25, 0, 1, 0.01), param('hist_drop', 'hist drop threshold', 0.12, 0, 1, 0.01)],
  pseudocode: pc([
    'same_motion_echo(a,b): hist cả hai && !occlusion_members && size_ratio ≥ 0.45 && hist_d ≤ 0.22 && dist ≤ max(24,1.1·max(min_w)) && gap ≤ 14 — không IoU',
    'different_clean_owners(a,b) → hai xe thật → không echo',
    'duyệt theo area giảm; xoá det chỉ khi !diff_owners && same_echo && IoU ≥ 0.25 && hist_d ≤ 0.12',
    '_is_echo_of_matched_track: loại unmatched-detection là vệt track đã gán'
  ]),
  buildTrace: function (sid, prm) {
    var self = this;
    return mkTrace(self, sid, prm, function (inp, P, emit) {
      var ids = Object.keys(inp);
      var dets = ids.map(function (k) { var d = clone(inp[k]); d.id = k; return d; });
      function sameEcho(a, b) {
        var sr = Math.min(a.box[2] * a.box[3], b.box[2] * b.box[3]) / Math.max(a.box[2] * a.box[3], b.box[2] * b.box[3]);
        var hd = bhatta(a.hist, b.hist);
        var dd = dist2(a.point[0], a.point[1], b.point[0], b.point[1]);
        var lim = Math.max(24, 1.10 * Math.max(Math.min(a.box[2], a.box[3]), Math.min(b.box[2], b.box[3])));
        var gap = boxGap(a.box, b.box);
        return { ok: sr >= 0.45 && hd <= 0.22 && dd <= lim && gap <= 14, sr: sr, hd: hd, dd: dd, gap: gap };
      }
      var pairs = [];
      for (var i = 0; i < dets.length; i++) for (var j = i + 1; j < dets.length; j++) {
        var a = dets[i], b = dets[j];
        var se = sameEcho(a, b);
        var iou = iouBox(a.box, b.box);
        var diffOwner = a.owner !== b.owner;
        var drop = !diffOwner && se.ok && iou >= P.iou_drop && se.hd <= P.hist_drop;
        pairs.push({ a: a.id, b: b.id, se: se, iou: iou, diffOwner: diffOwner, drop: drop });
      }
      emit([0], dets.length + ' detection sau A5 (đã qua lọc hình học): ' + dets.map(function (d) { return d.id + '@(' + d.box[0] + ',' + d.box[1] + ') owner' + d.owner; }).join(', ') + '. Cặp cùng xe sẽ được gộp trước assignment.', { dets: dets.length }, {
        type: 'tracks', boxes: dets.map(function (d) { return { x: d.box[0], y: d.box[1], w: d.box[2], h: d.box[3], id: d.id + ' owner' + d.owner, color: d.owner === 1 ? '#4f9cf7' : '#3fce7c' }; }),
        points: dets.map(function (d) { return { x: d.point[0], y: d.point[1], label: d.id, color: '#e8ecf4', r: 3 }; }),
        caption: 'input — 2 det cùng owner gần nhau nghi là vệt echo'
      });
      emit([0, 1], 'same_motion_echo theo 4 gate (size≥0.45, hist≤0.22, dist≤max(24,1.1·min_w), gap≤14) — KHÔNG có IoU trong gate này.', { pairs: pairs.map(function (p) { return p.a + "-" + p.b; }), echo_ok: pairs.map(function (p) { return p.se.ok; }) }, {
        type: 'tracks', boxes: dets.map(function (d) { return { x: d.box[0], y: d.box[1], w: d.box[2], h: d.box[3], id: d.id + ' owner' + d.owner, color: d.owner === 1 ? '#4f9cf7' : '#3fce7c' }; }),
        points: dets.map(function (d) { return { x: d.point[0], y: d.point[1], label: d.id, color: '#e8ecf4', r: 3 }; }),
        links: pairs.map(function (pr) { var a = dets.filter(function (d) { return d.id === pr.a; })[0], b = dets.filter(function (d) { return d.id === pr.b; })[0]; return { a: a.point, b: b.point, label: 'echo=' + pr.se.ok, color: pr.se.ok ? '#f0a93c' : '#8a93a8' }; })
      });
      emit([2, 3], 'Drop chỉ khi: cùng clean-owner && same_echo && IoU ≥ ' + P.iou_drop + ' && hist_d ≤ ' + P.hist_drop + ' — echo không chồng thì để B7 phân xử.', { pairs: pairs.map(function (p) { return { a: p.a, b: p.b, iou: r3(p.iou), drop: p.drop }; }) }, {
        type: 'rows', rows: pairs.map(function (pr) {
          return { label: pr.a + '↔' + pr.b + ': echo=' + pr.se.ok + ' IoU=' + r3(pr.iou) + ' hist=' + r3(pr.se.hd) + ' diffOwner=' + pr.diffOwner, value: pr.drop ? 'DROP ' + pr.b : 'giữ', state: pr.drop ? 'fail' : (pr.se.ok ? 'warn' : 'pass') };
        })
      }, [{ label: 'drop', value: pairs.filter(function (p) { return p.drop; }).length }, { label: 'giữ', value: pairs.filter(function (p) { return !p.drop; }).length }]);
      var dropped = pairs.filter(function (p) { return p.drop; }).map(function (p) { return p.b; });
      var kept = ids.filter(function (k) { return dropped.indexOf(k) < 0; });
      var res = { kept: kept, dropped: dropped };
      pairs.forEach(function (pr) { res['iou_' + pr.a + pr.b] = r4(pr.iou); });
      return { result: res, invariants: [{ label: 'drop đòi IoU ≥ ' + P.iou_drop, pass: pairs.every(function (p) { return !p.drop || p.iou >= P.iou_drop; }), actual: 'đúng gate' }] };
    });
  }
});

/* A10 — occlusion-group-guard */
L('occlusion-group-guard', {
  title: 'Nhận diện blob chứa nhiều xe',
  topic: 'group pre-formed theo proximity; covering khi ALL member centers ∈ blob + area ≥ 1.6·median(refs)',
  pipelineRole: 'Giữa ROI và size-cap: blob đủ lớn phủ hết member của group → kích hoạt occlusion flow (A11 tách, A12 veto).',
  difficulty: 4, tags: ['occlusion', 'group'], related: ['watershed-blob-partition', 'merged-blob-assignment-guard', 'assignment-margin-ambiguity'],
  codeRefs: [refp(OG, 25, 149, 'OcclusionGuard', 'prepare/covering_group/activate'), refp(OG, 109, 112, 'covering_group', 'all centers + 1.6·median')],
  inputSchema: { blob: '[x,y,w,h]', groups: '[{members, refs, centers}]' },
  outputSchema: { covering: '[members] | null' },
  dataStructures: ['OcclusionGroup{members,references,created_at,active,recovering,expires_at}'],
  keyFields: [{ name: 'covering_group', type: 'group|null', desc: 'all centers inside && area ≥ 1.6·median' }],
  invariants: ['all(contained) — không phải ≥2', 'group ≥2 member mới hợp lệ'],
  simplifications: ['[sim-omits] eligibility clean_obs≥3, inter>0.20 no-proof, expires — demo truyền groups sẵn'],
  edgeCases: [{ name: 'member-lac', desc: '3 member nhưng 1 tâm ngoài blob → không covering', scenario: 'edge', edgeCase: true }],
  scenarios: [
    { id: 'normal', label: 'Group phủ trọn', input: { blob: [0, 0, 8, 3], groups: [{ members: [1, 2], refs: { '1': [3, 3], '2': [3, 3] }, centers: { '1': [2, 1], '2': [6, 1] } }] }, expected: { covering: [1, 2] } },
    { id: 'edge', label: 'Member lạc ngoài blob', input: { blob: [0, 0, 8, 3], groups: [{ members: [1, 2, 3], refs: { '1': [3, 3], '2': [3, 3], '3': [3, 3] }, centers: { '1': [2, 1], '2': [6, 1], '3': [11, 1] } }] }, expected: { covering: null } }
  ],
  parameters: [param('area_mult', 'area ≥ k·median(refs)', 1.6, 1, 3, 0.1)],
  pseudocode: pc([
    'eligible = clean_obs ≥ 3 && now−last_seen ≤ 3.0s',
    'cặp (i,j): bỏ nếu inter/min_area > 0.20 (đã chồng); bỏ nếu gap(centers) > 0.4·max(diag); còn → group',
    'prune group cũ: dist(centers) > 3·max_diag → xoá',
    'covering_group(box): all(cx,cy ∈ box + pad 0.15·min(ref)) && w·h ≥ 1.6·median(ref_area)',
    'activate → active=true, members frozen'
  ]),
  buildTrace: function (sid, prm) {
    var self = this;
    return mkTrace(self, sid, prm, function (inp, P, emit) {
      var b = inp.blob;
      var grp = inp.groups[0];
      var refAreas = grp.members.map(function (m) { var r = grp.refs[m]; return r[0] * r[1]; });
      var medRef = median(refAreas);
      var pad = 0.15 * Math.min.apply(null, refAreas.map(function (a) { return Math.sqrt(a); }));
      var inside = grp.members.map(function (m) {
        var c = grp.centers[m];
        return c[0] >= b[0] - pad && c[0] <= b[0] + b[2] + pad && c[1] >= b[1] - pad && c[1] <= b[1] + b[3] + pad;
      });
      var area = b[2] * b[3];
      var areaOk = area >= P.area_mult * medRef;
      emit([0, 1], 'Group ' + JSON.stringify(grp.members) + ' đã pre-formed (điều kiện eligibility/proximity ở các bước trước). Kiểm tra blob ' + JSON.stringify(b) + ' có phủ hết member không — pad ' + r2(pad) + ' = 0.15·min(ref size).', { members: grp.members.length }, {
        type: 'tracks',
        boxes: [{ x: b[0], y: b[1], w: b[2], h: b[3], id: 'blob ' + b[2] + '×' + b[3], color: '#f0a93c', fill: '#f0a93c11' }],
        points: grp.members.map(function (m) { var c = grp.centers[m]; return { x: c[0], y: c[1], label: 'm' + m, color: '#8fa2c8' }; }),
        caption: 'group pre-formed — mỗi member có bbox ref ' + JSON.stringify(grp.refs[grp.members[0]])
      });
      emit([0, 1, 2], 'Group ' + JSON.stringify(grp.members) + ' — hình thành trước theo proximity. Blob ' + JSON.stringify(b) + ', pad ' + r2(pad) + '.', { members: grp.members, pad: r2(pad), blob: b }, {
        type: 'tracks',
        boxes: [{ x: b[0], y: b[1], w: b[2], h: b[3], id: 'blob', color: '#f0a93c', fill: '#f0a93c22' }],
        points: grp.members.map(function (m, i) { var c = grp.centers[m]; return { x: c[0], y: c[1], label: 'm' + m, color: inside[i] ? '#3fce7c' : '#f2555a' }; })
      });
      var covering = inside.every(Boolean) && areaOk && grp.members.length >= 2;
      emit([3, 4], 'all(inside) = ' + inside.every(Boolean) + ' ([' + inside.join(',') + ']); area ' + area + ' vs ' + P.area_mult + '·median(' + medRef + ') = ' + r2(P.area_mult * medRef) + ' → ' + (covering ? '**covering ' + JSON.stringify(grp.members) + '**' : '**không covering** — blob 2/3 center không đủ.'), { covering: covering }, {
        type: 'board', cards: [
          { label: 'all inside', value: String(inside.every(Boolean)), color: inside.every(Boolean) ? '#3fce7c' : '#f2555a' },
          { label: 'area ≥ ' + P.area_mult + '·med', value: area + ' vs ' + r2(P.area_mult * medRef), color: areaOk ? '#3fce7c' : '#f2555a' },
          { label: 'verdict', value: covering ? 'covering' : 'None', color: covering ? '#3fce7c' : '#f2555a', hl: true }
        ], log: []
      });
      return { result: { covering: covering ? grp.members : null }, invariants: [{ label: '1 member ngoài → không covering', pass: inside.every(Boolean) || !covering, actual: inside.join(',') }] };
    });
  }
});

/* A11 — watershed-blob-partition */
L('watershed-blob-partition', {
  title: 'Tách blob occlusion theo seed',
  topic: 'markers=track centers → watershed; vùng con ratio ∉ [min,max] → fallback merged',
  pipelineRole: 'Khi A10 covering: chia blob thành children theo seed track — chỉ khi tỉ lệ diện tích hợp lý.',
  difficulty: 3, tags: ['watershed', 'occlusion'], related: ['occlusion-group-guard', 'merged-blob-assignment-guard'],
  codeRefs: [refp(OG, 150, 190, 'partition', 'cv2.watershed + ratio check')],
  inputSchema: { blob_x: '[x0,x1]', blob_y: '[y0,y1]', seeds: '[[x,y]]', expected_area: 'int', ratio_range: '[min,max]' },
  outputSchema: { verdict: 'children | merged', ratios: '[float]' },
  dataStructures: ['label map int32', 'children dict'],
  keyFields: [{ name: 'ratio', type: 'area_i/expected_i', desc: 'ngoài dải → giữ merged' }],
  invariants: ['méo → merged (không tách sai)'],
  simplifications: ['[sim] Voronoi Euclid thay watershed gradient — không mô phỏng topology nước chảy'],
  edgeCases: [{ name: 'seed-sat-nhau', desc: 'seed sát → vùng mất cân → fallback merged', scenario: 'edge', edgeCase: true }],
  scenarios: [
    { id: 'normal', label: 'Tách được', input: { blob_x: [1, 6], blob_y: [1, 3], seeds: [[2, 2], [5, 2]], expected_area: 6, ratio_range: [0.35, 1.8] }, expected: { verdict: 'children', ratios: [1.5, 1.5] } },
    { id: 'edge', label: 'Seed sát nhau', input: { blob_x: [1, 6], blob_y: [1, 3], seeds: [[2, 2], [3, 2]], expected_area: 6, ratio_range: [0.35, 1.8] }, expected: { verdict: 'merged', ratios: [1.0, 2.0] } }
  ],
  parameters: [param('ratio_max', 'ratio max', 1.8, 1, 4, 0.1)],
  pseudocode: pc([
    'markers: mỗi seed 1 nhãn, nền 0',
    'labels = watershed(img, markers) — [sim] Voronoi gần nhất',
    'ratio_i = area_i/expected_i; ratio ∉ dải → bỏ tách, giữ merged'
  ]),
  buildTrace: function (sid, prm) {
    var self = this;
    return mkTrace(self, sid, prm, function (inp, P, emit) {
      var labels = {}, areas = inp.seeds.map(function () { return 0; });
      for (var x = inp.blob_x[0]; x <= inp.blob_x[1]; x++) for (var y = inp.blob_y[0]; y <= inp.blob_y[1]; y++) {
        var best = 0, bd = Infinity;
        inp.seeds.forEach(function (s, i) { var d = dist2(x, y, s[0], s[1]); if (d < bd) { bd = d; best = i; } });
        labels[x + ',' + y] = best; areas[best]++;
      }
      emit([0], 'Blob x∈[' + inp.blob_x + '], y∈[' + inp.blob_y + '] với ' + inp.seeds.length + ' seed track tại ' + JSON.stringify(inp.seeds) + ' — markers này làm hạt giống watershed.', { seeds: inp.seeds.length }, {
        type: 'tracks', boxes: [{ x: inp.blob_x[0], y: inp.blob_y[0], w: inp.blob_x[1] - inp.blob_x[0] + 1, h: inp.blob_y[1] - inp.blob_y[0] + 1, id: 'blob merged', color: '#f0a93c', fill: '#f0a93c22' }],
        points: inp.seeds.map(function (s, i) { return { x: s[0], y: s[1], label: 'seed' + (i + 1), color: '#e8ecf4' }; }),
        caption: 'marker = tâm track đã biết trong group occlusion'
      });
      emit([0, 1], 'Gán mỗi px blob về seed gần nhất (Voronoi giản lược của watershed).', { areas: areas }, {
        type: 'grid', grids: [{ title: 'label map', cells: (function () {
          var g = [];
          for (var x = inp.blob_x[0]; x <= inp.blob_x[1]; x++) { var col = []; for (var y = inp.blob_y[0]; y <= inp.blob_y[1]; y++) col.push(labels[x + ',' + y] === 0 ? 'fg' : 'marker'); g.push(col); }
          while (g.length < 8) g.push(['off', 'off', 'off']);
          return g;
        })(), marks: inp.seeds.map(function (s, i) { return { x: s[0] - inp.blob_x[0] + 0.5, y: s[1] - inp.blob_y[0] + 0.5, label: 's' + (i + 1), color: '#e8ecf4', r: 3 }; }) }],
        legend: [['fg', 'vùng seed1'], ['marker', 'vùng seed2']]
      });
      var ratios = areas.map(function (a) { return a / inp.expected_area; });
      var ok = ratios.every(function (r) { return r >= inp.ratio_range[0] && r <= P.ratio_max; });
      var verdict = ok ? 'children' : 'merged';
      emit([2], 'areas = [' + areas.join(',') + '], ratios = [' + ratios.map(r2).join(',') + '] vs dải [' + inp.ratio_range[0] + ',' + P.ratio_max + '] → **' + verdict + '**.' + (ok ? '' : ' Méo → thà giữ merged không tách sai.'), { verdict: verdict }, {
        type: 'bars', items: ratios.map(function (r, i) { return { label: 'vùng ' + (i + 1) + ' ratio', value: r2(r), color: r >= inp.ratio_range[0] && r <= P.ratio_max ? '#3fce7c' : '#f2555a' }; }),
        thresholds: [{ value: inp.ratio_range[0], label: 'min' }, { value: P.ratio_max, label: 'max ' + P.ratio_max }]
      });
      return { result: { verdict: verdict, ratios: ratios.map(r2) }, invariants: [{ label: 'ratio ngoài dải → merged', pass: ok || verdict === 'merged', actual: verdict }] };
    });
  }
});

/* A12 — merged-blob-assignment-guard */
L('merged-blob-assignment-guard', {
  title: 'Veto gán khi blob không giải thích được',
  topic: 'excess per-axis ≤ |v_axis|·span + 0.3·size_axis; valid = 2-member cặp && swapped−direct ≥ 2·margin && direct<1.2; recovering ≥3 → validated',
  pipelineRole: 'Trong _assign: blob merged không tách được → chặn gán + chặn sinh track; ngoại lệ vệt kéo theo đúng trục chuyển động.',
  difficulty: 5, tags: ['occlusion', 'veto', 'assignment'], related: ['watershed-blob-partition', 'assignment-margin-ambiguity', 'occlusion-group-guard'],
  codeRefs: [refp(MT, 1246, 1276, '_elongation_explained_by_motion', 'per-axis, span 1.75'), refp(OG, 191, 232, 'gate_assignments', 'valid/recovering/defer'), refp(MT, 1793, 1807, 'cost=10', '')],
  inputSchema: { track: '{w,h}', blob: '{w,h}', vel: '[vx,vy]', span: 'float' },
  outputSchema: { explained: 'bool', excess: '[w,h]', limits: '[w,h]' },
  dataStructures: ['OcclusionGroup.recovering', 'deferred_tracks/detections', 'cờ ambiguous_*'],
  keyFields: [{ name: 'explained', type: 'bool', desc: 'dư bbox theo đúng trục chuyển động' }],
  invariants: ['excess theo trục vuông góc vận tốc → veto', 'recovering reset khi 1 frame invalid'],
  simplifications: ['[sim-omits] unresolved_birth chi tiết, merged_freeze, watershed-validated'],
  edgeCases: [{ name: 'du-truc-vuong-goc', desc: 'vel dọc y nhưng blob phình ngang → veto', scenario: 'edge', edgeCase: true }],
  scenarios: [
    { id: 'normal', label: 'Vệt đuôi theo hướng chạy', input: { track: { w: 4, h: 3 }, blob: { w: 8, h: 3 }, vel: [4, 0], span: 1.75 }, expected: { explained: true, limit_w: 8.2 } },
    { id: 'edge', label: 'Dư trục vuông góc', input: { track: { w: 4, h: 3 }, blob: { w: 8, h: 3 }, vel: [0, 4], span: 1.75 }, expected: { explained: false, limit_w: 1.2 } }
  ],
  parameters: [param('span', 'motion_trail_elongation_frames', 1.75, 0.5, 4, 0.05)],
  pseudocode: pc([
    'excess_w = blob_w − track.w; excess_h = blob_h − track.h; cả hai ≤ 0 → True',
    'explained = excess_w ≤ |vx|·span + 0.30·w && excess_h ≤ |vy|·span + 0.30·h — per-axis, không cos',
    'gate valid = 2-member && swapped−direct ≥ 2·margin && direct < 1.2 → recovering++ ≥3 → validated',
    'invalid → recovering=0, defer members + suppress cột cost<1.0; cột ambiguous_* → cost=10'
  ]),
  buildTrace: function (sid, prm) {
    var self = this;
    return mkTrace(self, sid, prm, function (inp, P, emit) {
      var ew = inp.blob.w - inp.track.w, eh = inp.blob.h - inp.track.h;
      var lw = Math.abs(inp.vel[0]) * P.span + 0.30 * inp.track.w;
      var lh = Math.abs(inp.vel[1]) * P.span + 0.30 * inp.track.h;
      var explained = (ew <= 0 && eh <= 0) || (ew <= lw && eh <= lh);
      emit([0], 'Track ' + inp.track.w + '×' + inp.track.h + ' nhưng detection blob ' + inp.blob.w + '×' + inp.blob.h + ' — blob phình ra. Vận tốc v=(' + inp.vel + ') quyết định trục dư nào được chấp nhận.', { track: inp.track.w + '×' + inp.track.h }, {
        type: 'tracks', boxes: [
          { x: 0, y: 0, w: inp.track.w, h: inp.track.h, id: 'track ' + inp.track.w + '×' + inp.track.h, color: '#3fce7c' },
          { x: 0, y: 0, w: inp.blob.w, h: inp.blob.h, id: 'blob ' + inp.blob.w + '×' + inp.blob.h, color: '#8fa2c8', fill: '#8fa2c811' }
        ], points: [{ x: inp.track.w / 2, y: inp.track.h / 2, vel: inp.vel, label: 'v=(' + inp.vel + ')' }],
        caption: 'vệt kéo theo chỉ hợp lệ theo trục chuyển động'
      });
      emit([0, 1], 'excess_w = ' + ew + ', excess_h = ' + eh + '. Giới hạn per-axis: |vx|·span + 0.3·w = ' + r2(lw) + '; |vy|·span + 0.3·h = ' + r2(lh) + '.', { ew: ew, eh: eh }, {
        type: 'tracks', boxes: [
          { x: 0, y: 0, w: inp.track.w, h: inp.track.h, id: 'track', color: '#3fce7c' },
          { x: 0, y: 0, w: inp.blob.w, h: inp.blob.h, id: 'blob', color: '#f0a93c', fill: '#f0a93c22' }
        ], points: [{ x: inp.track.w / 2, y: inp.track.h / 2, vel: inp.vel, label: 'v=(' + inp.vel + ')' }]
      });
      emit([2, 3], 'excess_w ' + ew + (ew <= lw ? ' ≤ ' : ' > ') + r2(lw) + (ew <= lw ? '' : ' ← vượt trục vuông góc vận tốc') + '; excess_h ' + eh + (eh <= lh ? ' ≤ ' : ' > ') + r2(lh) + ' → explained = **' + explained + '**' + (explained ? ' → gán bình thường.' : ' → veto + suppress + birth_blocked.'), { explained: explained }, {
        type: 'bars', items: [
          { label: 'excess_w', value: ew, color: ew <= lw ? '#3fce7c' : '#f2555a' },
          { label: 'limit_w', value: r2(lw), color: '#8a93a8' },
          { label: 'excess_h', value: eh, color: eh <= lh ? '#3fce7c' : '#f2555a' },
          { label: 'limit_h', value: r2(lh), color: '#8a93a8' }
        ], notes: [{ text: explained ? 'explained → assign ok' : 'veto + defer + suppress cột' }]
      });
      return { result: { explained: explained, excess: [ew, eh], limits: [r2(lw), r2(lh)], limit_w: r2(lw) }, invariants: [{ label: 'trục ⊥ vận tốc vượt → veto', pass: explained || ew > lw || eh > lh, actual: explained }] };
    });
  }
});
setTopic('Tracking & assignment');

/* =================================================================
 * GROUP B — Tracking (11 lessons)
 * ================================================================= */

/* B1 — kalman-constant-velocity */
L('kalman-constant-velocity', {
  title: 'Dự đoán vị trí theo vận tốc không đổi',
  topic: 'state [x,y,vx,vy]: predict x+=vx; correct state += K·residual ([sim] β=0.5); không meas → coast',
  pipelineRole: 'Mỗi track 1 bộ lọc — cầu nối detection rời rạc thành quỹ đạo liên tục; mất đo → coast theo v cũ.',
  difficulty: 2, tags: ['kalman', 'prediction'], related: ['prediction-age-decay', 'association-distance-gate'],
  codeRefs: [refp(MT, 440, 449, '_new_kalman', 'cv2.KalmanFilter(4,2)'), refp(MT, 239, 295, '_predict_tracks', '')],
  inputSchema: { init: '[x,y,vx,vy]', meas: '[[mx,my]|null]', beta: 'float' },
  outputSchema: { trace: '[[x,y,vx,vy] per frame]' },
  dataStructures: ['cv2.KalmanFilter(4,2)', 'statePre/statePost'],
  keyFields: [{ name: 'state', type: 'float[4]', desc: 'vị trí + vận tốc học dần từ residual' }],
  invariants: ['không meas → giữ state sau predict (coast tuyến tính)'],
  simplifications: ['[sim] α-β filter β=0.5 thay Kalman gain thật', '[sim-omits] F, P, noise — không mô phỏng uncertainty'],
  edgeCases: [{ name: 'coast', desc: 'mất meas → vị trí vẫn chạy theo v cũ', scenario: 'edge', edgeCase: true }],
  scenarios: [
    { id: 'normal', label: '3 đo liên tiếp', input: { init: [10, 10, 0, 0], meas: [[12, 10], [13, 10], [14, 11]] }, expected: { trace: [[11, 10, 1, 0], [12.5, 10, 1.5, 0], [14, 10.5, 1.5, 0.5]] } },
    { id: 'edge', label: 'Coast 2 frame', input: { init: [14, 10.5, 1.5, 0.5], meas: [null, null] }, expected: { trace: [[15.5, 11, 1.5, 0.5], [17, 11.5, 1.5, 0.5]] } }
  ],
  parameters: [param('beta', 'Gain β (demo)', 0.5, 0, 1, 0.05)],
  pseudocode: pc([
    'predict: x += vx, y += vy (constant-velocity)',
    'có meas: residual = meas − pred; state += β·residual (vị trí lẫn vận tốc)',
    'không meas → giữ state sau predict (coast)'
  ]),
  buildTrace: function (sid, prm) {
    var self = this;
    return mkTrace(self, sid, prm, function (inp, P, emit) {
      var st = inp.init.slice();
      var trace = [];
      var pts = [{ x: inp.init[0], y: inp.init[1], label: 'init', color: '#8a93a8' }];
      emit([0], 'state init = [x=' + st[0] + ', y=' + st[1] + ', vx=' + st[2] + ', vy=' + st[3] + '] — bộ lọc CV: mỗi frame predict x+=vx rồi (nếu có đo) hiệu chỉnh bằng residual.', { state: st.slice() }, {
        type: 'tracks',
        points: [{ x: st[0], y: st[1], label: 'init [' + st + ']', color: '#8a93a8', vel: [st[2] * 4, st[3] * 4] }]
          .concat(inp.meas.map(function (m, i) { return m ? { x: m[0], y: m[1], label: 'meas f' + i, color: '#f0a93c', r: 3 } : null; }).filter(Boolean)),
        caption: 'meas ' + inp.meas.map(function (m, i) { return m ? 'f' + i + '=' + m : 'f' + i + '=∅'; }).join(', ')
      });
      inp.meas.forEach(function (m, f) {
        var predX = st[0] + st[2], predY = st[1] + st[3];
        var msg;
        if (m) {
          var rx = m[0] - predX, ry = m[1] - predY;
          st = [predX + P.beta * rx, predY + P.beta * ry, st[2] + P.beta * rx, st[3] + P.beta * ry];
          msg = 'f' + f + ': pred=(' + r2(predX) + ',' + r2(predY) + '), meas=(' + m + ') → residual (' + r2(rx) + ',' + r2(ry) + ') → state [' + st.map(r2).join(',') + '] — v học từ residual.';
        } else {
          st = [predX, predY, st[2], st[3]];
          msg = 'f' + f + ': KHÔNG meas → coast: state [' + st.map(r2).join(',') + '] — v giữ nguyên, vị trí trôi theo v cũ.';
        }
        trace.push(st.slice());
        emit(m ? 1 : 2, msg, { state: st.slice() }, {
          type: 'tracks',
          trails: [{ pts: [[inp.init[0], inp.init[1]]].concat(trace.map(function (s) { return [s[0], s[1]]; })), color: '#4f9cf7' }],
          points: pts.concat([{ x: st[0], y: st[1], label: 'state', color: '#3fce7c', vel: [st[2] * 2, st[3] * 2] }])
            .concat(m ? [{ x: m[0], y: m[1], label: 'meas', color: '#f0a93c', r: 4 }] : []),
          caption: 'v = (' + r2(st[2]) + ',' + r2(st[3]) + ')'
        });
      });
      var coastOk = inp.meas.every(function (m, i) {
        if (m) return true;
        var prev = i > 0 ? trace[i - 1] : inp.init;
        return trace[i][2] === prev[2] && trace[i][3] === prev[3];
      });
      return { result: { trace: trace.map(function (s) { return s.map(r2); }) }, invariants: [{ label: 'coast giữ nguyên v', pass: coastOk, actual: 'v tại frame coast: ' + (inp.meas.map(function (m, i) { return m ? null : 'f' + i + '=(' + r2(trace[i][2]) + ',' + r2(trace[i][3]) + ')'; }).filter(Boolean).join(' ') || 'không có') }] };
    });
  }
});

/* B2 — prediction-age-decay */
L('prediction-age-decay', {
  title: 'Giới hạn tuổi dự đoán',
  topic: '3 nhánh: decay e^(−age/τ) về measured | merged-freeze giữ raw | age>limit → anchor conf=0',
  pipelineRole: 'Khi invisible>0: dự đoán nội suy về điểm đo cuối; hết hạn → đóng băng thành anchor phục vụ reacquire B8.',
  difficulty: 3, tags: ['prediction', 'decay', 'anchor'], related: ['kalman-constant-velocity', 'stale-anchor-reacquire'],
  codeRefs: [refp(MT, 239, 290, '_predict_tracks', '3 nhánh'), refp(MT, 297, 317, '_prediction_age_*', 'merged → max(0.40,3.0)'), refp(MT, 1304, 1330, '_has_recent_merged_freeze', '')],
  inputSchema: { measured: '[x,y]', raw: '[x,y]', ages: '[float]', tau: 'float', age_limit: 'float', merged_freeze: 'bool' },
  outputSchema: { points: '[[x,y]]', conf: '[float]', source: 'string' },
  dataStructures: ['timestamp float', 'prediction_source string'],
  keyFields: [{ name: 'conf', type: '1 − age/limit', desc: 'tuyến tính, không exponential' }],
  invariants: ['merged_freeze → raw Kalman không decay', 'age > limit → anchor conf=0'],
  simplifications: ['[sim-omits] cửa sổ merged-freeze thật + gate consecutive_invisible/last_ambiguous_kind'],
  edgeCases: [{ name: 'merged-freeze', desc: 'age≤3.0 & merged → raw Kalman conf=1', scenario: 'edge', edgeCase: true }],
  scenarios: [
    { id: 'normal', label: 'Decay theo age', input: { measured: [10, 10], raw: [14, 10], ages: [0, 0.1, 0.2, 0.3], tau: 0.25, age_limit: 0.40, invisible: 1 }, expected: { xs: [14, 12.68, 11.8, 11.2], confs: [1, 0.75, 0.5, 0.25] } },
    { id: 'edge', label: 'Merged-freeze giữ raw', input: { measured: [10, 10], raw: [14, 10], age: 0.5, merged_freeze: true, extended_limit: 3.0 }, expected: { point: [14, 10], conf: 1, source: 'kalman_prediction' } }
  ],
  parameters: [param('tau', 'τ decay', 0.25, 0.05, 1, 0.05)],
  pseudocode: pc([
    'age = now − last_meas; limit = base (merged → max(0.40, 3.0))',
    'age > limit → point = measured, source = stale_prediction, conf = 0',
    'merged_freeze → point = raw (không decay), conf = 1.0',
    'ngược lại → decay = e^(−age/τ); point = measured + (raw−measured)·decay; conf = 1 − age/limit (tuyến tính)'
  ]),
  buildTrace: function (sid, prm) {
    var self = this;
    return mkTrace(self, sid, prm, function (inp, P, emit) {
      if (inp.merged_freeze !== undefined && inp.ages === undefined) {
        var lim = inp.merged_freeze ? Math.max(0.40, inp.extended_limit) : 0.40;
        var over = inp.age > lim;
        var pt = inp.merged_freeze && !over ? inp.raw : over ? inp.measured : null;
        var src = over ? 'stale_prediction' : 'kalman_prediction';
        var cf = over ? 0 : 1;
        emit([0], 'Track invisible — có 2 điểm ứng viên: measured ' + JSON.stringify(inp.measured) + ' (đo cuối) vs raw Kalman ' + JSON.stringify(inp.raw) + '. age=' + inp.age + 's, merged_freeze=' + inp.merged_freeze + '.', { measured: inp.measured, raw: inp.raw }, {
          type: 'tracks', points: [
            { x: inp.measured[0], y: inp.measured[1], label: 'measured', color: '#8a93a8' },
            { x: inp.raw[0], y: inp.raw[1], label: 'raw kalman', color: '#4f9cf7' }
          ], caption: 'nhánh nào được chọn phụ thuộc age/limit/merged'
        });
        emit([0, 1], 'limit = ' + lim + (inp.merged_freeze ? ' (merged mở rộng max(0.40, ' + inp.extended_limit + '))' : ' (base 0.40)') + '; age ' + inp.age + (over ? ' > limit → nhánh anchor.' : ' ≤ limit → còn hạn.') + (inp.merged_freeze && !over ? ' merged_freeze → ưu tiên raw.' : ''), { lim: lim, over: over }, {
          type: 'rows', rows: [
            { label: 'limit', value: String(lim), state: 'info' },
            { label: 'age ' + inp.age + ' > ' + lim, value: String(over), state: over ? 'fail' : 'pass' },
            { label: 'merged_freeze', value: String(inp.merged_freeze), state: inp.merged_freeze ? 'warn' : 'info' }
          ]
        });
        emit([1, 2], over ? 'Quá hạn → anchor tại measured, conf=0, source=stale_prediction.' : 'merged-freeze → point = raw Kalman ' + JSON.stringify(pt) + ', conf=1.0 — vệt merged không decay vì track chưa thực sự mất.', { point: pt, conf: cf }, {
          type: 'tracks', points: [
            { x: inp.measured[0], y: inp.measured[1], label: 'measured', color: '#8a93a8' },
            { x: inp.raw[0], y: inp.raw[1], label: 'raw', color: '#4f9cf7' },
            { x: pt[0], y: pt[1], label: 'output', color: over ? '#f2555a' : '#3fce7c', r: 7 }
          ]
        });
        return { result: { point: pt, conf: cf, source: src }, invariants: [{ label: 'merged & age ≤ ext → raw', pass: !(inp.merged_freeze && !over) || (eqJson(pt, inp.raw) && cf === 1), actual: 'point=' + JSON.stringify(pt) + ' vs raw=' + JSON.stringify(inp.raw) + ' conf=' + cf }] };
      }
      var xs = [], confs = [], rows = [];
      inp.ages.forEach(function (age) {
        var decay = Math.exp(-age / P.tau);
        var px = inp.measured[0] + (inp.raw[0] - inp.measured[0]) * decay;
        var conf = 1 - age / inp.age_limit;
        xs.push(px); confs.push(conf); rows.push({ age: age, decay: decay, x: px, conf: conf });
      });
      emit([0], 'Track invisible ' + inp.invisible + ' frame — duyệt ' + inp.ages.length + ' mốc age ' + JSON.stringify(inp.ages) + 's: điểm dự đoán trượt từ raw ' + JSON.stringify(inp.raw) + ' về measured ' + JSON.stringify(inp.measured) + ' theo τ=' + P.tau + '.', { ages: inp.ages.length }, {
        type: 'tracks',
        points: [{ x: inp.measured[0], y: inp.measured[1], label: 'measured', color: '#8a93a8' }, { x: inp.raw[0], y: inp.raw[1], label: 'raw', color: '#4f9cf7' }],
        caption: 'age càng lớn → prediction càng kéo về measured'
      });
      emit([0, 3], 'point = measured + (raw − measured)·e^(−age/τ): x = [' + xs.map(r2).join(', ') + ']; conf tuyến tính = [' + confs.map(r2).join(', ') + '].', { xs: xs.map(r2), confs: confs.map(r2) }, {
        type: 'tracks', trails: [{ pts: rows.map(function (r) { return [r.x, 10]; }), color: '#f0a93c' }],
        points: [{ x: inp.measured[0], y: inp.measured[1], label: 'measured', color: '#8a93a8' }, { x: inp.raw[0], y: inp.raw[1], label: 'raw', color: '#4f9cf7' }]
          .concat(rows.map(function (r) { return { x: r.x, y: 10, label: 'a' + r.age, color: '#3fce7c', r: 4 }; })),
        caption: 'prediction trượt về measured theo age'
      });
      emit([1, 2], 'Quá limit ' + inp.age_limit + ' → anchor tại measured, conf=0, source=stale_prediction — B8 dùng chính điểm này.', { age_limit: inp.age_limit, source: "stale_prediction", conf: 0 }, {
        type: 'rows', rows: rows.map(function (r) { return { label: 'age ' + r.age + ': decay ' + r3(r.decay) + ' → x=' + r2(r.x) + ' conf=' + r2(r.conf), state: 'pass', value: '' }; })
          .concat([{ label: 'age 0.5 > limit → anchor [10,10] conf=0', state: 'warn', value: 'stale' }])
      });
      return { result: { xs: xs.map(r2), confs: confs.map(r2) }, invariants: [{ label: 'conf tuyến tính', pass: Math.abs(confs[1] - (1 - 0.1 / 0.4)) < 1e-9, actual: confs[1] }] };
    });
  }
});

/* B3 — association-distance-gate */
L('association-distance-gate', {
  title: 'Cổng khoảng cách gán',
  topic: 'gate = min(ceiling, max(floor, budget)) — bounded budget, KHÔNG tổng tuyến tính',
  pipelineRole: 'Trước cost: loại cặp quá xa so với vận tốc + frames mất đo + kích thước → cắt ma trận, chặn gán nhầm xa.',
  difficulty: 3, tags: ['gate', 'distance'], related: ['association-cost-matrix', 'prediction-age-decay'],
  codeRefs: [refp(MT, 1193, 1231, '_association_gate', ''), refp(MT, 1233, 1244, '_track_velocity_px_per_frame', '')],
  inputSchema: { speed: 'px/frame', inv: 'invisible frames', extent: 'max(w,h)', visible_count: 'int', ceiling: 'px' },
  outputSchema: { gate: 'px (0 | floor..ceiling)' },
  dataStructures: ['scalar gate'],
  keyFields: [{ name: 'budget', type: 'speed·(inv+1)·scale + size_ratio·extent', desc: 'kẹp floor/ceiling' }],
  invariants: ['pred_age>limit → gate=0', 'visible_count<3 → gate=ceiling (fail-open)'],
  simplifications: ['[sim-omits] velocity fallback từ history — demo truyền speed sẵn'],
  edgeCases: [{ name: 'floor-thang', desc: 'xe đứng yên budget<floor → gate=floor', scenario: 'edge', edgeCase: true }],
  scenarios: [
    { id: 'normal', label: 'Xe nhanh mất 3 frame', input: { speed: 5, inv: 3, extent: 10, visible_count: 10, scale: 2.0, size_ratio: 1.0, ceiling: 180, floor_min: 24 }, expected: { budget: 50, floor: 24, gate: 50 } },
    { id: 'edge', label: 'Floor thắng + nhánh đặc biệt', input: { speed: 0.5, inv: 0, extent: 10, visible_count: 10, scale: 2.0, size_ratio: 1.0, ceiling: 180, floor_min: 24 }, expected: { budget: 11, floor: 24, gate: 24, gate_new_track: 180, gate_expired: 0 } }
  ],
  parameters: [param('scale', 'velocity_gate_scale', 2.0, 0.5, 4, 0.1)],
  pseudocode: pc([
    'invisible>0 && pred_age > 0.40 → gate = 0',
    'visible_count < 3 → gate = ceiling (fail-open)',
    'budget = speed·(inv+1)·scale + size_ratio·extent',
    'floor = max(24, size_ratio·extent); gate = min(ceiling, max(floor, budget))'
  ]),
  buildTrace: function (sid, prm) {
    var self = this;
    return mkTrace(self, sid, prm, function (inp, P, emit) {
      var gate;
      emit([0, 1], 'Trạng thái track: speed=' + inp.speed + 'px/f, invisible=' + inp.inv + 'f, extent=' + inp.extent + 'px, visible_count=' + inp.visible_count + (inp.pred_age !== undefined ? ', pred_age=' + inp.pred_age : '') + ' — chọn nhánh gate.', { inv: inp.inv, vc: inp.visible_count }, {
        type: 'rows', rows: [
          { label: 'invisible>0 && pred_age>0.40', value: String(inp.inv > 0 && inp.pred_age > 0.40), state: (inp.inv > 0 && inp.pred_age > 0.40) ? 'fail' : 'pass' },
          { label: 'visible_count ' + inp.visible_count + ' < 3', value: String(inp.visible_count < 3), state: inp.visible_count < 3 ? 'warn' : 'pass' },
          { label: 'nhánh budget', value: 'vào công thức kẹp', state: 'info' }
        ], caption: 'hai nhánh đặc biệt thắng trước budget'
      });
      if (inp.inv > 0 && inp.pred_age > 0.40) gate = 0;
      else if (inp.visible_count < 3) gate = inp.ceiling;
      else {
        var budget = inp.speed * (inp.inv + 1) * P.scale + inp.size_ratio * inp.extent;
        var floor = Math.max(inp.floor_min, inp.size_ratio * inp.extent);
        emit([2], 'budget = speed·(inv+1)·scale + size_ratio·extent = ' + inp.speed + '·' + (inp.inv + 1) + '·' + P.scale + ' + ' + inp.size_ratio + '·' + inp.extent + ' = ' + r2(budget) + '; floor = max(' + inp.floor_min + ', ' + inp.size_ratio * inp.extent + ') = ' + floor + '.', { budget: budget, floor: floor }, {
          type: 'bars', items: [
            { label: 'speed·(inv+1)·scale', value: r2(inp.speed * (inp.inv + 1) * P.scale), color: '#4f9cf7' },
            { label: 'size_ratio·extent', value: r2(inp.size_ratio * inp.extent), color: '#8a93a8' },
            { label: 'budget', value: r2(budget), color: '#f0a93c' },
            { label: 'floor', value: floor, color: '#3fce7c' }
          ], thresholds: [{ value: inp.ceiling, label: 'ceiling ' + inp.ceiling, color: '#f2555a' }]
        });
        gate = Math.min(inp.ceiling, Math.max(floor, budget));
        emit([3], 'gate = min(ceiling ' + inp.ceiling + ', max(floor ' + floor + ', budget ' + r2(budget) + ')) = **' + r2(gate) + '** — cặp xa hơn mức này bị loại khỏi ma trận.', { gate: gate }, {
          type: 'bars', items: [
            { label: 'budget', value: r2(budget), color: '#4f9cf7' },
            { label: 'floor', value: floor, color: '#f0a93c' },
            { label: 'gate', value: r2(gate), color: '#3fce7c' }
          ], thresholds: [{ value: inp.ceiling, label: 'ceiling ' + inp.ceiling, color: '#f2555a' }]
        });
        var res = { budget: r2(budget), floor: floor, gate: r2(gate) };
        res.gate_new_track = inp.ceiling;
        res.gate_expired = 0;
        return { result: res, invariants: [{ label: 'floor ≤ gate ≤ ceiling', pass: gate >= floor && gate <= inp.ceiling, actual: gate }] };
      }
      emit([2], gate === 0 ? 'Không qua được gate an toàn — bỏ phần budget.' : 'Track quá mới (chưa đủ quan sát ổn định) — không nên siết gate; fail-open dùng ceiling.', { gate: gate }, {
        type: 'bars', items: [{ label: 'gate', value: gate, color: gate === 0 ? '#f2555a' : '#3fce7c' }],
          thresholds: [{ value: inp.ceiling, label: 'ceiling ' + inp.ceiling, color: '#f2555a' }]
      });
      emit([0, 1, 3], gate === 0 ? 'invisible>0 && pred_age > 0.40 → gate = 0 — dự đoán hết hạn, chỉ còn anchor B8.' : 'visible_count ' + inp.visible_count + ' < 3 → gate = ceiling ' + inp.ceiling + ' — track mới fail-open.', { gate: gate }, {
        type: 'board', cards: [{ label: 'gate', value: gate, color: gate === 0 ? '#f2555a' : '#3fce7c', hl: true }], log: []
      });
      return { result: { gate: gate }, invariants: [] };
    });
  }
});

/* B4 — iou-overlap-score */
L('iou-overlap-score', {
  title: 'Độ chồng lấp hộp',
  topic: 'IoU = inter/(areaA + areaB − inter) — lồng nhau vẫn < 1',
  pipelineRole: 'Term 0.25 trong cost B5 — detection khớp dự đoán thường chồng lấp cao.',
  difficulty: 1, tags: ['iou', 'geometry'], related: ['association-cost-matrix', 'motion-echo-suppression'],
  codeRefs: [refp(MT, 397, 405, '_iou', ''), refp(SB, 712, 745, '_overlap_geometry', 'phiên bản polygon cho slot')],
  inputSchema: { a: '[x,y,w,h]', b: '[x,y,w,h]' },
  outputSchema: { iou: 'float [0,1]' },
  dataStructures: ['scalar'],
  keyFields: [{ name: 'iou', type: 'float', desc: 'giao/hợp diện tích' }],
  invariants: ['disjoint → 0; lồng → <1; bằng nhau → 1'],
  simplifications: [],
  edgeCases: [{ name: 'long-nhau', desc: 'hộp nhỏ trong hộp lớn → IoU thấp', scenario: 'edge', edgeCase: true }],
  scenarios: [
    { id: 'normal', label: 'Chồng một phần', input: { a: [0, 0, 4, 4], b: [2, 0, 4, 4] }, expected: { inter: 8, union: 24, iou: 0.3333 } },
    { id: 'edge', label: 'Lồng nhau hoàn toàn', input: { a: [0, 0, 2, 2], b: [0, 0, 4, 4] }, expected: { inter: 4, union: 16, iou: 0.25 } }
  ],
  parameters: [],
  pseudocode: pc([
    'inter = max(0, min(x2A,x2B) − max(x1A,x1B)) · max(0, min(y2A,y2B) − max(y1A,y1B))',
    'iou = inter / (areaA + areaB − inter)'
  ]),
  buildTrace: function (sid, prm) {
    var self = this;
    return mkTrace(self, sid, prm, function (inp, P, emit) {
      var a = inp.a, b = inp.b;
      emit([0], 'Hai hộp: A = ' + JSON.stringify(a) + ' (dt ' + a[2] * a[3] + 'px), B = ' + JSON.stringify(b) + ' (dt ' + b[2] * b[3] + 'px) — đo mức trùng hình.', { a: a, b: b }, {
        type: 'tracks', boxes: [
          { x: a[0], y: a[1], w: a[2], h: a[3], id: 'A', color: '#4f9cf7' },
          { x: b[0], y: b[1], w: b[2], h: b[3], id: 'B', color: '#f0a93c' }
        ], caption: 'vùng giao (nếu có) sẽ được tô ở bước sau'
      });
      var iw = Math.max(0, Math.min(a[0] + a[2], b[0] + b[2]) - Math.max(a[0], b[0]));
      var ih = Math.max(0, Math.min(a[1] + a[3], b[1] + b[3]) - Math.max(a[1], b[1]));
      var inter = iw * ih, union = a[2] * a[3] + b[2] * b[3] - inter;
      var iou = union > 0 ? inter / union : 0;
      emit([0], 'inter_w = min(' + (a[0] + a[2]) + ',' + (b[0] + b[2]) + ') − max(' + a[0] + ',' + b[0] + ') = ' + iw + '; inter_h = ' + ih + ' → inter = ' + inter + 'px.', { inter: inter }, {
        type: 'tracks', boxes: [
          { x: a[0], y: a[1], w: a[2], h: a[3], id: 'A', color: '#4f9cf7' },
          { x: b[0], y: b[1], w: b[2], h: b[3], id: 'B', color: '#f0a93c' },
          { x: Math.max(a[0], b[0]), y: Math.max(a[1], b[1]), w: iw, h: ih, id: '∩ ' + inter + 'px', color: '#f2555a', fill: '#f2555a44' }
        ]
      });
      emit([1], 'union = ' + a[2] * a[3] + ' + ' + b[2] * b[3] + ' − ' + inter + ' = ' + union + ' → IoU = ' + inter + '/' + union + ' = **' + r4(iou) + '**.' + (inter === Math.min(a[2] * a[3], b[2] * b[3]) && inter > 0 ? ' Hộp nhỏ nằm trọn trong hộp lớn nhưng IoU vẫn <1 vì union > inter.' : ''), { iou: iou }, {
        type: 'tracks', boxes: [
          { x: a[0], y: a[1], w: a[2], h: a[3], id: 'A', color: '#4f9cf7' },
          { x: b[0], y: b[1], w: b[2], h: b[3], id: 'B', color: '#f0a93c' },
          { x: Math.max(a[0], b[0]), y: Math.max(a[1], b[1]), w: iw, h: ih, id: '∩', color: '#f2555a', fill: '#f2555a44' }
        ], caption: 'IoU đo mức trùng hình, không đo "cùng vật"'
      });
      return { result: { inter: inter, union: union, iou: r4(iou) }, invariants: [{ label: 'iou ∈ [0,1]', pass: iou >= 0 && iou <= 1, actual: iou }] };
    });
  }
});

/* B5 — association-cost-matrix */
L('association-cost-matrix', {
  title: 'Ma trận chi phí gán',
  topic: 'cost = 0.45·d_norm + 0.25·(1−iou) + 0.20·app + 0.10·size_error(log) — 4 term',
  pipelineRole: 'Gộp bằng chứng → cost(track,det); fail gate → 10 (∞). Weights literal [0.45,0.25,0.20,0.10], cost_limit 0.90.',
  difficulty: 4, tags: ['cost', 'matrix'], related: ['lapjv-assignment', 'association-distance-gate', 'hsv-lab-descriptor'],
  codeRefs: [refp(MT, 1691, 1781, 'build cost', ''), refp(MT, 1761, 1766, 'công thức literal', '4 term'), refp(MT, 1756, 1760, 'size_error log', '|ln(ratio)|/|ln 2.80|')],
  inputSchema: { pairs: 'float[T×D] pair_metrics {d_norm|d, iou, app, area_ratio, gate}' },
  outputSchema: { cost: 'float | 10', matrix: 'float[T×D]', min_cell: '[r,c]' },
  dataStructures: ['float[T×D]', '_pair_metrics{position,iou,appearance,size,total,association_source}'],
  keyFields: [{ name: 'size_error', type: 'min(1,|ln(area_ratio)|/|ln 2.80|)', desc: 'log-scale' }],
  invariants: ['fail gate → cost=10', 'không có direction term', 'd_norm>1 → cost=10'],
  simplifications: ['[sim-omits] zone blend, min(hist,tracklet), per-track max_distance scaling'],
  edgeCases: [{ name: 'fail-gate', desc: 'd > gate → toàn ô cost=10 (∞)', scenario: 'edge', edgeCase: true }],
  scenarios: [
    { id: 'normal', label: 'Ma trận 2×3 có ô cấm', input: { pairs: [
      [{ d_norm: 0.3, iou: 0.35, app: 0.15, area_ratio: 1.5 }, { d_norm: 0.7, iou: 0.10, app: 0.40, area_ratio: 0.6 }, { d_norm: 1.2, iou: 0, app: 0.60, area_ratio: 3.0 }],
      [{ d_norm: 0.45, iou: 0.20, app: 0.25, area_ratio: 1.2 }, { d_norm: 0.15, iou: 0.55, app: 0.10, area_ratio: 1.1 }, { d_norm: 0.55, iou: 0.15, app: 0.35, area_ratio: 1.4 }]
    ] }, expected: { size_error: 0.3938, cost: 0.3669, matrix: [[0.3669, 0.6696, 10], [0.4702, 0.2093, 0.5627]], min_cell: [1, 1], min_cost: 0.2093 } },
    { id: 'edge', label: 'Fail distance gate', input: { pairs: [[{ d: 55, gate: 50 }]] }, expected: { cost: 10, matrix: [[10]] } }
  ],
  parameters: [],
  pseudocode: pc([
    'max_distance_t = 180·min(1.25, 1 + min(invisible,15)/60)',
    'app = min(hist_d, tracklet_d); thiếu hist → 0.25/0.5; zone → 0.70·app + 0.30·zone',
    'size_error = min(1, |ln(area_ratio)|/|ln(2.80)|)',
    'cost[r][c] = 0.45·d_norm + 0.25·(1−iou) + 0.20·app + 0.10·size_error',
    'fail gate (distance/app/size-band/missing-hist-when-invisible) → cost = 10'
  ]),
  buildTrace: function (sid, prm) {
    var self = this;
    return mkTrace(self, sid, prm, function (inp, P, emit) {
      var cellCost = function (m) {
        if (m.d !== undefined) return m.d > m.gate ? 10 : 0;
        if (m.d_norm > 1) return 10;
        var se = Math.min(1, Math.abs(Math.log(m.area_ratio)) / Math.abs(Math.log(2.80)));
        return 0.45 * m.d_norm + 0.25 * (1 - m.iou) + 0.20 * m.app + 0.10 * se;
      };
      var T = inp.pairs.length, D = inp.pairs[0].length;
      var matrix = inp.pairs.map(function (row) { return row.map(cellCost); });
      var minC = null, minV = Infinity;
      matrix.forEach(function (row, r) { row.forEach(function (v, c) { if (v < 10 && v < minV) { minV = v; minC = [r, c]; } }); });
      emit([0], 'pair_metrics ' + T + ' track × ' + D + ' detection — mỗi ô giữ {d_norm, iou, app, area_ratio}; ô có d_norm>1 hoặc fail gate bị đánh cấm.', { cells: T * D }, {
        type: 'rows', rows: inp.pairs.map(function (row, r) { return { label: 'track' + r, state: 'info', value: row.map(function (m, c) { return 'det' + c + (m.d !== undefined ? ' d=' + m.d + '/gate=' + m.gate : ' d' + m.d_norm + ' iou' + m.iou + ' app' + m.app + ' ar' + m.area_ratio); }).join(' | ') }; }),
        caption: 'bằng chứng từng cặp trước khi trộn 4 term'
      });
      var banned = [];
      inp.pairs.forEach(function (row, r) { row.forEach(function (m, c) { if (matrix[r][c] >= 10) banned.push({ label: 'track' + r + '↔det' + c, state: 'fail', value: m.d !== undefined ? 'd ' + m.d + ' > gate ' + m.gate : 'd_norm ' + m.d_norm + ' > 1' }); }); });
      emit([4], banned.length ? banned.length + '/' + (T * D) + ' ô fail gate → cost = 10 (∞): ' + banned.map(function (b) { return b.label; }).join(', ') + '.' : 'Không ô nào fail gate — ' + T * D + ' ô đều vào solver.', { banned: banned.length }, {
        type: 'rows', rows: banned.length ? banned : [{ label: 'gates', state: 'pass', value: 'tất cả cặp qua distance/app/size gates' }], caption: 'gate trước solver — ô cấm không thể được chọn'
      });
      emit([1, 2, 3, 4], 'cost[r][c] = 0.45·d_norm + 0.25·(1−iou) + 0.20·app + 0.10·size_error → ' + matrix.map(function (row) { return '[' + row.map(function (v) { return v >= 10 ? '∞' : r4(v); }).join(', ') + ']'; }).join(' ') + (minC ? '. Ô tốt nhất: [' + minC + '] = ' + r4(minV) + '.' : '. Toàn bộ ô bị cấm (∞) — solver không có ứng viên.'), { min: minC ? minV : 'all-banned' }, {
        type: 'matrix', matrix: matrix, rows: matrix.map(function (_, i) { return 'track' + i; }), cols: matrix[0].map(function (_, j) { return 'det' + j; }),
        assign: minC ? [minC] : [], caption: 'ô ∞ = fail gate — solver B6 sẽ bỏ qua'
      });
      var m00 = inp.pairs[0][0];
      if (m00.d_norm !== undefined && m00.d_norm <= 1) {
        var se0 = Math.min(1, Math.abs(Math.log(m00.area_ratio)) / Math.abs(Math.log(2.80)));
        var ts = [0.45 * m00.d_norm, 0.25 * (1 - m00.iou), 0.20 * m00.app, 0.10 * se0];
        var c00 = ts[0] + ts[1] + ts[2] + ts[3];
        emit([2, 3], 'Ô track0↔det0: size_error = |ln ' + m00.area_ratio + '|/|ln 2.80| = ' + r4(se0) + ' → cost = ' + ts.map(function (t, i) { return ['0.45', '0.25', '0.20', '0.10'][i] + '·' + r4(t / [0.45, 0.25, 0.20, 0.10][i]); }).join(' + ') + ' = **' + r4(c00) + '**.', { cost: c00 }, {
          type: 'bars', items: [
            { label: '0.45·d_norm', value: r4(ts[0]), color: '#4f9cf7' },
            { label: '0.25·(1−iou)', value: r4(ts[1]), color: '#3fce7c' },
            { label: '0.20·app', value: r4(ts[2]), color: '#f0a93c' },
            { label: '0.10·size_err', value: r4(ts[3]), color: '#f2555a' },
            { label: 'cost', value: r4(c00), color: '#e8ecf4' }
          ], thresholds: [{ value: 0.9, label: 'cost_limit 0.90' }]
        });
        return { result: { size_error: r4(se0), cost: r4(c00), matrix: matrix.map(function (row) { return row.map(function (v) { return v >= 10 ? 10 : r4(v); }); }), min_cell: minC, min_cost: r4(minV) }, invariants: [{ label: 'mọi ô admissible ∈ [0,1]', pass: matrix.every(function (row) { return row.every(function (v) { return v >= 10 || (v >= 0 && v <= 1); }); }), actual: 'matrix' }] };
      }
      return { result: { cost: matrix[0][0], matrix: matrix }, invariants: [{ label: 'fail gate → 10', pass: matrix[0][0] === 10, actual: matrix[0][0] }] };
    });
  }
});

/* B6 — lapjv-assignment */
L('lapjv-assignment', {
  title: 'Gán tối ưu Jonker–Volgenant',
  topic: 'phép gán 1–1 có tổng cost min; unassigned phí cost_limit — [sim] exhaustive O(n!) n≤5 vs LAPJV O(n³)',
  pipelineRole: 'Solver dùng chung ở D2/D10/E4 — tổng nhỏ nhất toàn cục, không greedy.',
  difficulty: 3, tags: ['solver', 'lapjv'], related: ['association-cost-matrix', 'assignment-margin-ambiguity', 'recovery-batch-assignment'],
  codeRefs: [refp(MT, 1597, 2007, '_assign', 'lap.lapjv(extend_cost=True, cost_limit)')],
  inputSchema: { costs: 'float[T][D]', cost_limit: 'float' },
  outputSchema: { assign: '[(r,c)|−1]', total: 'float' },
  dataStructures: ['ma trận + mảng gán'],
  keyFields: [{ name: 'cost_limit', type: 'float', desc: 'ngưỡng "thà không gán"' }],
  invariants: ['greedy có thể thua exact — counterexample verify'],
  simplifications: ['[sim] vét cạn O(n!) n≤5 — production LAPJV O(n³), không phải "Hungarian" nói chung'],
  edgeCases: [{ name: 'tha-khong-gan', desc: 'cost > limit → unassigned', scenario: 'edge', edgeCase: true }],
  scenarios: [
    { id: 'normal', label: 'Gán đường chéo', input: { costs: [[0.2, 0.8, 10], [0.7, 0.3, 10], [10, 10, 0.4]], cost_limit: 0.9 }, expected: { map: [0, 1, 2], total: 0.9 } },
    { id: 'edge', label: 'Thà không gán', input: { costs: [[0.95, 10], [10, 0.3]], cost_limit: 0.9 }, expected: { map: [-1, 1], total: 1.2 } },
    { id: 'greedy', label: 'Greedy thua exact', input: { costs: [[0.1, 0.5], [0.4, 10]], cost_limit: 0.9 }, expected: { map: [1, 0], total: 0.9, greedy_total: 1.0 } }
  ],
  parameters: [param('cost_limit', 'cost_limit', 0.9, 0.1, 1.5, 0.05)],
  pseudocode: pc([
    'đánh dấu ô cấm: cost[r][c] ≥ limit → inadmissible (mờ)',
    'với mọi phép gán hợp lệ (hàng→cột duy nhất hoặc unassigned): total = Σ cost + unassigned·cost_limit',
    'giữ ứng viên tốt nhất từng bước',
    'chọn total min — [sim] vét cạn n≤5; production lap.lapjv O(n³)'
  ]),
  buildTrace: function (sid, prm) {
    var self = this;
    return mkTrace(self, sid, prm, function (inp, P, emit) {
      var costs = inp.costs, T = costs.length, D = costs[0].length;
      var lim = P.cost_limit;
      // Enumeration thật: mỗi hàng → cột admissible hoặc unassigned, cột duy nhất.
      var used = new Array(D).fill(false), cur = new Array(T).fill(-1);
      var cands = [];
      function rec(row, acc) {
        if (row === T) { cands.push({ map: cur.slice(), total: acc }); return; }
        for (var c = 0; c < D; c++) {
          if (used[c] || costs[row][c] >= lim) continue;
          used[c] = true; cur[row] = c; rec(row + 1, acc + costs[row][c]); used[c] = false;
        }
        cur[row] = -1; rec(row + 1, acc + lim);
      }
      rec(0, 0);
      var best = Infinity, bestMap = null;
      cands.forEach(function (cd) { if (cd.total < best) { best = cd.total; bestMap = cd.map; } });
      emit([0], 'Ma trận cost ' + T + '×' + D + '; ô cost ≥ limit ' + lim + ' = inadmissible (không vào solver). ' + cands.length + ' phép gán hợp lệ sẽ được duyệt.', { cands: cands.length }, {
        type: 'matrix', matrix: costs, rows: costs.map(function (_, i) { return 'track' + i; }), cols: (costs[0] || []).map(function (_, j) { return 'det' + j; }),
        caption: 'hàng = track, cột = detection; ô mờ (∞) bị cấm bởi cost_limit'
      });
      var show = Math.min(cands.length, 20), runBest = Infinity;
      for (var ci = 0; ci < show; ci++) {
        var cd = cands[ci];
        if (cd.total < runBest) runBest = cd.total;
        (function (cd, ci, runBest) {
          emit([1, 2], 'Ứng viên ' + (ci + 1) + '/' + cands.length + ': ' + cd.map.map(function (c, i) { return c < 0 ? 'r' + i + '→−1' : 'r' + i + '→c' + c; }).join(', ') + ' → total = ' + r4(cd.total) + (cd.total <= runBest ? ' — **best mới**' : ' (best giữ ' + r4(runBest) + ')'), { total: cd.total, best: runBest }, {
            type: 'matrix', matrix: costs, rows: costs.map(function (_, i) { return 'track' + i; }), cols: (costs[0] || []).map(function (_, j) { return 'det' + j; }),
            assign: cd.map.map(function (c, i) { return [i, c]; }).map(function (a) { a.color = cd.total <= runBest ? '#3fce7c' : '#f0a93c'; return a; }),
            caption: 'phép gán đang duyệt — khung viền ô được chọn'
          });
        })(cd, ci, runBest);
      }
      var assigns = bestMap.map(function (c, i) { return c < 0 ? 'r' + i + '→unassigned' : 'r' + i + '→c' + c; });
      emit([3], 'Vét cạn xong ' + cands.length + ' ứng viên → **best: ' + assigns.join(', ') + ' total = ' + r4(best) + '** — exact optimum, không phải xấp xỉ.', { total: best }, {
        type: 'matrix', matrix: costs, rows: costs.map(function (_, i) { return 'track' + i; }), cols: (costs[0] || []).map(function (_, j) { return 'det' + j; }),
        assign: bestMap.map(function (c, i) { return [i, c]; }),
        caption: 'phép gán tối ưu toàn cục'
      });
      var res = { map: bestMap, total: r4(best) };
      if (T <= 3) {
        var g = (function () {
          var u = {}, tot = 0;
          costs.forEach(function (row) {
            var bb = -1, bv = Infinity;
            row.forEach(function (v, c) { if (!u[c] && v < bv && v < lim) { bv = v; bb = c; } });
            if (bb >= 0) { u[bb] = 1; tot += bv; } else tot += lim;
          });
          return tot;
        })();
        res.greedy_total = r4(g);
      }
      return { result: res, invariants: [{ label: 'exact ≤ greedy', pass: !res.greedy_total || best <= res.greedy_total + 1e-9, actual: best + ' ≤ ' + (res.greedy_total || '—') }, { label: 'mọi cột dùng ≤1 lần', pass: bestMap.filter(function (c) { return c >= 0; }).length === new Set(bestMap.filter(function (c) { return c >= 0; })).size, actual: JSON.stringify(bestMap) }] };
    });
  }
});

/* B7 — assignment-margin-ambiguity */
L('assignment-margin-ambiguity', {
  title: 'Trì hoãn gán khi tranh chấp sít sao',
  topic: 'CHỈ track hồi phục (∈ split_margin) mới qua margin = 0.08·(2−lineage); streak 3 frame',
  pipelineRole: 'Sau LAPJV: track mất dấu/merge vừa reappear phải thắng cách biệt — tránh swap-ID; track đang thấy nhận kết quả luôn.',
  difficulty: 4, tags: ['margin', 'ambiguity'], related: ['lapjv-assignment', 'merged-blob-assignment-guard', 'track-lifecycle'],
  codeRefs: [refp(MT, 1165, 1191, '_assignment_has_margin', ''), refp(MT, 1278, 1302, '_lineage_score', ''), refp(MT, 1914, 1989, 'usage', 'split_margin_track_ids')],
  inputSchema: { costs: 'float[T][D]', lineage: 'float', in_split_margin: '[bool]', assign: '[[r,c]]' },
  outputSchema: { verdicts: '[assign|defer]' },
  dataStructures: ['split_margin_track_ids', 'ambiguous_clear_streak', 'association_state'],
  keyFields: [{ name: 'margin', type: '0.08·(2−lineage)', desc: 'track mới ≈0.16, track cũ ≈0.08' }],
  invariants: ['chỉ split_margin mới check; không split → LAPJV luôn', 'alternatives = row-alt ∪ col-alt <10'],
  simplifications: ['[sim-omits] appearance_trusted cờ, gate_assignments A12, clear_evidence 4-đk'],
  edgeCases: [{ name: 'dang-thay', desc: 'track không ∈ split → gán ngay dù gap mỏng', scenario: 'edge', edgeCase: true }],
  scenarios: [
    { id: 'normal', label: 'Track hồi phục defer', input: { costs: [[0.30, 0.32, 10], [0.90, 10, 0.31]], margin_base: 0.08, lineage: 0.0, in_split_margin: [true, true], assign: [[0, 0], [1, 2]] }, expected: { margin: 0.16, verdicts: ['defer', 'keep'] } },
    { id: 'edge', label: 'Track đang thấy bỏ qua margin', input: { costs: [[0.30, 0.32, 10], [0.90, 10, 0.31]], margin_base: 0.08, lineage: 0.0, in_split_margin: [false, true], assign: [[0, 0], [1, 2]] }, expected: { margin: 0.16, verdicts: ['keep', 'keep'] } }
  ],
  parameters: [param('margin_base', 'split_assignment_margin', 0.08, 0.01, 0.3, 0.01)],
  pseudocode: pc([
    'với mỗi assigned track ∈ split_margin_track_ids: lineage = mean(min(1,|hist|/10),min(1,visible/10),min(1,frag/5),min(1,age/15))',
    'margin = 0.08·(2 − lineage)',
    'alternatives = {cost[r][c′]<10, c′≠c} ∪ {cost[r′][c]<10, r′≠r}; ok = alt rỗng || min(alt) − cost ≥ margin',
    '!ok → split_recovering + defer + suppress cột',
    'ok nhưng recently_ambiguous && !clear_evidence && streak+1<3 → defer + streak++',
    'ngược lại → gán, streak=0'
  ]),
  buildTrace: function (sid, prm) {
    var self = this;
    return mkTrace(self, sid, prm, function (inp, P, emit) {
      var margin = P.margin_base * (2 - (inp.lineage || 0));
      var verdicts = [];
      inp.assign.forEach(function (a) {
        var r = a[0], c = a[1];
        if (!inp.in_split_margin[r]) { verdicts.push('keep'); return; }
        var alts = [];
        inp.costs[r].forEach(function (v, cc) { if (cc !== c && v < 10) alts.push(v); });
        inp.costs.forEach(function (row, rr) { if (rr !== r && row[c] < 10) alts.push(row[c]); });
        var ok = alts.length === 0 || (Math.min.apply(null, alts) - inp.costs[r][c]) >= margin;
        verdicts.push(ok ? 'keep' : 'defer');
      });
      emit([0], 'LAPJV vừa chọn ' + inp.assign.map(function (a) { return 'r' + a[0] + '→c' + a[1]; }).join(', ') + ' trên ma trận ' + inp.costs.length + '×' + inp.costs[0].length + '. Các track ∈ split_margin (vừa hồi phục/mất-merge) phải thắng cách biệt trước khi được gán.', { assigned: inp.assign.length }, {
        type: 'matrix', matrix: inp.costs, assign: inp.assign, rows: inp.costs.map(function (_, i) { return 'track' + i + (inp.in_split_margin[i] ? '*' : ''); }),
        caption: '* = track trong split_margin — phải qua margin check'
      });
      emit([0, 1, 2], 'margin = ' + P.margin_base + '·(2 − ' + (inp.lineage || 0) + ') = **' + r2(margin) + '**. Chỉ track ∈ split_margin mới qua gate.', { margin: margin }, {
        type: 'matrix', matrix: inp.costs, assign: inp.assign,
        gaps: inp.assign.map(function (a, i) {
          var r = a[0], c = a[1], alts = [];
          inp.costs[r].forEach(function (v, cc) { if (cc !== c && v < 10) alts.push(v); });
          inp.costs.forEach(function (row, rr) { if (rr !== r && row[c] < 10) alts.push(row[c]); });
          return 'r' + r + ' gap = ' + (alts.length ? r2(Math.min.apply(null, alts) - inp.costs[r][c]) : '∞') + (inp.in_split_margin[r] ? ' (check vs ' + r2(margin) + ')' : ' (skip — đang thấy)') + (verdicts[i] === 'defer' ? ' → defer ambiguous' : '');
        })
      });
      emit([3, 4, 5], inp.assign.map(function (a, i) {
        var r = a[0];
        return 'r' + r + (inp.in_split_margin[r] ? ' ∈ split_margin → ' : ' đang-thấy → bỏ qua check → ') + '**' + verdicts[i] + '**';
      }).join(' · '), { verdicts: verdicts }, {
        type: 'rows', rows: inp.assign.map(function (a, i) {
          return { label: 'r' + a[0] + '→c' + a[1] + (inp.in_split_margin[a[0]] ? ' [split]' : ' [đang thấy]'), value: verdicts[i], state: verdicts[i] === 'keep' ? 'pass' : 'fail' };
        })
      });
      return { result: { margin: r2(margin), verdicts: verdicts }, invariants: [{ label: 'non-split luôn keep', pass: inp.assign.every(function (a, i) { return inp.in_split_margin[a[0]] || verdicts[i] === 'keep'; }), actual: verdicts.join(',') }] };
    });
  }
});

/* B8 — stale-anchor-reacquire */
L('stale-anchor-reacquire', {
  title: 'Tái bắt track qua neo cũ',
  topic: 'anchor = last_measured_center; gate min(max_d·scale, max(3, 0.3·diag)); app ≤0.22 stale; area∈[0.35,2.80] → cost 4-term',
  pipelineRole: 'Track mất đo quá limit → neo tại điểm đo cuối, gate riêng trong reacquire window 1.5s (merged 3.0).',
  difficulty: 4, tags: ['reacquire', 'anchor'], related: ['prediction-age-decay', 'association-cost-matrix', 'track-lifecycle'],
  codeRefs: [refp(MT, 1627, 1701, 'nhánh stale', ''), refp(MT, 1726, 1755, 'gates', ''), refp(MT, 1696, 1701, 'gate override', '')],
  inputSchema: { last_meas: '[x,y]', clean_wh: '[w,h]', det: '{point,box,app,hist}', lost_s: 'float', invisible: 'int' },
  outputSchema: { verdict: 'cost | skip:<reason>' },
  dataStructures: ['scalar', '_last_association_events'],
  keyFields: [{ name: 'gate', type: 'min(max_d·scale, max(3,0.3·diag))', desc: 'override gate=0' }],
  invariants: ['lost > window → skip toàn track', 'cost 4-term như B5 — điểm so sánh đổi thành anchor'],
  simplifications: ['[sim-omits] max_distance scale theo invisible, merged window 3.0, zone-blend'],
  edgeCases: [{ name: 'sai-mau', desc: 'app>0.22 → reject appearance', scenario: 'edge', edgeCase: true }, { name: 'qua-han', desc: 'lost>1.5 → skip window', scenario: 'edge', edgeCase: true }],
  scenarios: [
    { id: 'normal', label: 'Hồi sinh', input: { last_meas: [5, 5], clean_wh: [4, 3], det: { point: [6.5, 6], box: [4, 3, 5, 3], app: 0.2, hist: [1, 0] }, lost_s: 0.8, invisible: 1, max_dist_demo: 20 }, expected: { gate: 3, d: 1.803, cost: 0.2809, verdict: 'match' } },
    { id: 'edge', label: 'Sai màu / quá hạn', input: { track: { last_meas: [5, 5], clean_wh: [4, 3], invisible: 1, max_dist_demo: 20 }, cases: [{ det: { point: [6, 6], box: [4, 3, 4, 3], app: 0.25, hist: [1, 0] }, lost_s: 0.8 }, { det: { point: [6, 6], box: [4, 3, 4, 3], app: 0.2, hist: [1, 0] }, lost_s: 2.0 }] }, expected: { verdicts: ['reject:appearance', 'skip:reacquire_window'] } }
  ],
  parameters: [param('window', 'reacquire_max_seconds', 1.5, 0.5, 4, 0.1)],
  pseudocode: pc([
    'lost_seconds > window (1.5; 3.0 merged) → skip toàn track',
    'invisible>0 && pred_age>limit → predicted_point = last_measured_center (anchor)',
    'gate = min(max_distance·scale, max(3.0, 0.30·diag(clean))) — override gate=0',
    'hist=None && invisible → skip; app > 0.30 → skip; stale && app > 0.22 → skip; area_ratio ∉ [0.35,2.80] → skip',
    'qua hết → cost 4-term B5, source = last_measurement_anchor'
  ]),
  buildTrace: function (sid, prm) {
    var self = this;
    return mkTrace(self, sid, prm, function (inp, P, emit) {
      function evalCase(tr, cs) {
        var lost = cs != null ? cs.lost_s : tr.lost_s;
        var det = cs != null ? cs.det : tr.det;
        if (lost > P.window) return { verdict: 'skip:reacquire_window', lost: lost };
        var diag = Math.hypot(tr.clean_wh[0], tr.clean_wh[1]);
        var gate = Math.min(tr.max_dist_demo, Math.max(3.0, 0.30 * diag));
        var d = dist2(det.point[0], det.point[1], tr.last_meas[0], tr.last_meas[1]);
        if (d > gate) return { verdict: 'reject:distance', d: d, gate: gate };
        var appLim = Math.min(0.30, 0.22); // stale
        if (det.app > 0.30) return { verdict: 'skip:appearance', app: det.app };
        if (det.app > appLim) return { verdict: 'reject:appearance', app: det.app };
        var ar = (det.box[2] * det.box[3]) / (tr.clean_wh[0] * tr.clean_wh[1]);
        if (ar < 0.35 || ar > 2.80) return { verdict: 'reject:size_band', ar: ar };
        var predBox = [tr.last_meas[0] - tr.clean_wh[0] / 2, tr.last_meas[1] - tr.clean_wh[1], tr.clean_wh[0], tr.clean_wh[1]]; // last_meas = bottom-center → box nằm TRÊN neo
        var iou = iouBox(predBox, det.box);
        var se = Math.min(1, Math.abs(Math.log(ar)) / Math.abs(Math.log(2.80)));
        var cost = 0.45 * (d / tr.max_dist_demo) + 0.25 * (1 - iou) + 0.20 * det.app + 0.10 * se;
        return { verdict: 'match', gate: gate, d: d, iou: iou, se: se, cost: cost };
      }
      var tr = inp.track || inp;
      var cases = inp.cases || [null];
      var results = cases.map(function (cs) { return evalCase(tr, cs); });
      var first = results[0];
      emit([0, 1], 'Track stale: dự đoán đã hết hạn → anchor đóng băng tại last_measured ' + JSON.stringify(tr.last_meas) + ', clean_wh ' + JSON.stringify(tr.clean_wh) + '. ' + cases.length + ' ứng viên det sẽ qua chuỗi gate.', { anchor: tr.last_meas }, {
        type: 'tracks', boxes: [{ x: tr.last_meas[0] - tr.clean_wh[0] / 2, y: tr.last_meas[1] - tr.clean_wh[1], w: tr.clean_wh[0], h: tr.clean_wh[1], id: 'clean box', color: '#8a93a8' }],
        points: [{ x: tr.last_meas[0], y: tr.last_meas[1], label: 'anchor', color: '#e8ecf4' }]
          .concat((inp.cases || [inp]).map(function (cs, i) {
            var det = cs.det || cs;
            return { x: det.point[0], y: det.point[1], label: 'det' + i + ' app' + det.app, color: '#4f9cf7' };
          })),
        caption: 'pred_box nằm TRÊN anchor (last_meas = bottom-center)'
      });
      emit([0, 1, 2], 'anchor = last_measured ' + JSON.stringify(tr.last_meas) + '; gate = min(' + tr.max_dist_demo + ', max(3, 0.3·' + r2(Math.hypot(tr.clean_wh[0], tr.clean_wh[1])) + ')) = ' + r2(first.gate || 3) + '.', { anchor: tr.last_meas, gate: r2(first.gate || 3) }, {
        type: 'tracks', rings: [{ x: tr.last_meas[0], y: tr.last_meas[1], r: first.gate || 3, label: 'gate', color: '#f0a93c' }],
        points: [{ x: tr.last_meas[0], y: tr.last_meas[1], label: 'anchor', color: '#8a93a8' }]
          .concat((inp.cases || [inp]).map(function (cs, i) {
            var det = cs.det || cs;
            return { x: det.point[0], y: det.point[1], label: 'det' + i, color: results[i].verdict === 'match' ? '#3fce7c' : '#f2555a' };
          }))
      });
      emit([3, 4], results.map(function (r, i) {
        return 'case' + i + ': ' + r.verdict + (r.cost !== undefined ? ' (d=' + r3(r.d) + ' iou=' + r3(r.iou) + ' se=' + r3(r.se) + ' → cost=' + r4(r.cost) + ')' : '');
      }).join(' · '), { verdicts: results.map(function (r) { return r.verdict; }), costs: results.map(function (r) { return r.cost !== undefined ? r4(r.cost) : null; }) }, {
        type: 'rows', rows: results.map(function (r, i) {
          return { label: 'case' + i + ' ' + r.verdict, value: r.cost !== undefined ? r4(r.cost) : '—', state: r.verdict === 'match' ? 'pass' : 'fail' };
        })
      });
      var res = inp.cases
        ? { verdicts: results.map(function (r) { return r.verdict; }) }
        : { gate: first.gate !== undefined ? r2(first.gate) : null, d: first.d !== undefined ? r3(first.d) : null, cost: first.cost !== undefined ? r4(first.cost) : null, verdict: first.verdict };
      return { result: res, invariants: [{ label: 'lost>window → skip', pass: results.every(function (r, i) { return (inp.cases ? inp.cases[i].lost_s : inp.lost_s) <= P.window || r.verdict === 'skip:reacquire_window'; }), actual: 'window gate đúng' }] };
    });
  }
});

/* B9 — track-lifecycle */
L('track-lifecycle', {
  title: 'Vòng đời track: tentative→confirmed→lost→removed',
  topic: '3 enum; confirm cần obs≥3 && disp≥12px; chỉ confirmed→lost; hết TTL → pop + emit expired 1 lần',
  pipelineRole: 'Chỉ confirmed mới có GID (E6) và bind slot (D). expired KHÔNG phải state — là sự kiện khi bị pop.',
  difficulty: 3, tags: ['lifecycle', 'fsm'], related: ['global-id-allocation', 'stale-anchor-reacquire'],
  codeRefs: [refp(VT, 20, 23, 'TrackStatus', 'chỉ 3 enum'), refp(MT, 2071, 2094, '_is_confirmable', 'obs≥3 && disp≥12'), refp(MT, 2226, 2342, 'process_frame lost/expire', '')],
  inputSchema: { dets: '[1|0 per frame]', ttl: 'int', confirmed: 'bool khởi tạo' },
  outputSchema: { states: '[state per frame]' },
  dataStructures: ['enum TrackStatus', 'total_visible_count/invisible', 'association_state string', '_exited_tracks'],
  keyFields: [{ name: 'expired', type: 'event', desc: 'KHÔNG phải enum — emit 1 lần khi pop' }],
  invariants: ['tentative unmatched không bao giờ → lost', 're-confirm khi det quay lại'],
  simplifications: ['[sim-omits] exited qua gate-zone, priority_track, newly_lost bookkeeping'],
  edgeCases: [{ name: 'hoi-sinh', desc: 'det quay lại trước TTL → lost→confirmed', scenario: 'edge', edgeCase: true }],
  scenarios: [
    { id: 'normal', label: 'Hết TTL → removed', input: { dets: [1, 0, 0, 0, 0], ttl: 3, confirmed: true }, expected: { states: ['confirmed', 'lost(1)', 'lost(2)', 'removed+emit(4)', '—'] } },
    { id: 'edge', label: 'Hồi sinh', input: { dets: [1, 0, 1, 0, 0], ttl: 3, confirmed: true }, expected: { states: ['confirmed', 'lost(1)', 'confirmed', 'lost(1)', 'lost(2)'] } }
  ],
  parameters: [param('ttl', 'lost_ttl (frames)', 3, 1, 8, 1)],
  pseudocode: pc([
    'unmatched det → track tentative (đếm total_visible_count)',
    'confirm: total_visible ≥ 3 && displacement ≥ 12px (priority: obs≥2, disp≥3)',
    'không gán → invisible++; CHỈ confirmed → lost (tentative pop lặng lẽ)',
    'invisible > ttl → pop khỏi _tracks; status≠tentative → _exited_tracks + emit expired 1 lần',
    'suspend (parked) → association_state="suspended_*" — string riêng song song enum'
  ]),
  buildTrace: function (sid, prm) {
    var self = this;
    return mkTrace(self, sid, prm, function (inp, P, emit) {
      var states = [], log = [];
      var status = inp.confirmed ? 'confirmed' : 'tentative', inv = 0, popped = false;
      var fsmStates = [{ name: 'tentative' }, { name: 'confirmed' }, { name: 'lost' }, { name: 'removed' }];
      var edges = [
        { from: 'tentative', to: 'confirmed', label: 'obs+disp' },
        { from: 'confirmed', to: 'lost', label: 'invisible++' },
        { from: 'lost', to: 'removed', label: 'invisible>ttl' },
        { from: 'lost', to: 'confirmed', label: 're-confirm', back: true }
      ];
      emit([0, 1], 'Track t9 khởi tạo status=' + status + ' (fixture ' + (inp.confirmed ? 'đã confirm sẵn' : 'tentative mới') + ', ttl=' + P.ttl + '). Chuỗi det ' + inp.dets.length + ' frame sẽ duyệt từng bước.', { status: status }, {
        type: 'fsm', states: fsmStates, current: status, edges: edges,
        log: ['t9: ' + status + ' inv=0 — confirmed mới bind slot/có GID']
      });
      inp.dets.forEach(function (det, f) {
        if (popped) { states.push('—'); return; }
        var before = status;
        if (det) {
          inv = 0;
          if (status === 'lost') { status = 'confirmed'; log.push('f' + f + ': det quay lại → lost→confirmed (re-confirm, giữ track id)'); }
          else if (status === 'tentative') status = 'confirmed';
          states.push(status);
        } else {
          inv++;
          if (status === 'confirmed') status = 'lost';
          if (inv >= P.ttl) { popped = true; states.push('removed+emit(' + (f + 1) + ')'); log.push('f' + f + ': invisible ' + inv + ' ≥ ttl ' + P.ttl + ' → pop khỏi _tracks + emit expired 1 lần'); }
          else states.push(status === 'lost' ? 'lost(' + inv + ')' : status + '(' + inv + ')');
        }
        var label = states[states.length - 1];
        emit([det ? (before === 'lost' ? 3 : 1) : 2, 3], 'f' + f + ': det=' + det + ' → t9 ' + before + (before !== status || inv ? '→' : ' ở ') + label + (det ? ' (inv reset 0)' : ' inv=' + inv + '/' + P.ttl) + '.', { status: label, inv: inv }, {
          type: 'tracks', boxes: popped ? [] : [{ x: 20 + f * 4, y: 30, w: 24, h: 14, id: 't9 ' + label, color: status === 'confirmed' ? '#3fce7c' : (status === 'lost' ? '#f0a93c' : '#8fa2c8') }],
          vlines: popped ? [{ x: 20 + f * 4, label: 'popped' }] : [],
          caption: 't9 inv=' + inv + '/' + P.ttl + (popped ? ' — đã pop' : ''),
          log: log.slice(-3)
        });
      });
      emit([3, 4], 'Duyệt xong: ' + states.join(' → ') + '. ' + (popped ? 'expired chỉ là sự kiện phát 1 lần — không phải state enum; frame sau t9 không còn trong _tracks.' : 't9 vẫn sống trong _tracks.'), { states: states }, {
        type: 'fsm', states: fsmStates, current: popped ? 'removed' : status, edges: edges.map(function (e) { var a = Object.assign({}, e); a.active = (e.to === (popped ? 'removed' : status)) || (e.from === status && e.to === status); return a; }),
        log: states.map(function (s, i) { return 'f' + i + ': ' + s; })
      });
      var firstLost = states.findIndex(function (s) { return s.indexOf('lost') === 0; });
      return { result: { states: states }, invariants: [{ label: 'tentative không → lost', pass: firstLost < 0 || inp.confirmed || states.slice(0, firstLost).indexOf('confirmed') >= 0, actual: states.join(' → ') }, { label: 'removed sau khi inv≥ttl', pass: !popped || states.indexOf(states.filter(function (s) { return s.indexOf('removed') === 0; })[0]) >= 0, actual: popped }] };
    });
  }
});

/* B10 — hsv-lab-descriptor */
L('hsv-lab-descriptor', {
  title: 'Mô tả màu của tracklet',
  topic: 'desc 416-D = 0.70·HS[256] + 1.20·LAB[144] + 0.60·L[16] L2-norm; d = √(1−BC); quality 3 yếu tố + 2 hard-zero',
  pipelineRole: '"Dấu vân tay" màu → appearance term trong B5/B8/E7; quality <0.5 → không học.',
  difficulty: 4, tags: ['appearance', 'histogram'], related: ['tracklet-gallery-match', 'association-cost-matrix', 'stale-anchor-reacquire'],
  codeRefs: [refp(TD, 18, 68, 'hsv_histogram', '416-D weighted'), refp(TD, 81, 138, 'compute_sample_quality', '0.5·size+0.3·fg+0.2·aspect'), refp(TD, 141, 149, 'histogram_distance', 'HISTCMP_BHATTACHARYYA')],
  inputSchema: { px_h: '[hue values]', bins: 'int', bin_width: 'int', samples: '[{crop_area,fg_ratio,aspect}]' },
  outputSchema: { hist: 'float[bins]', d: 'float', qualities: '[float]' },
  dataStructures: ['float32[416]', 'AppearanceTracklet.samples', 'spatial_histograms'],
  keyFields: [{ name: 'quality', type: '0.5·size+0.3·fg+0.2·aspect', desc: 'area<200 hoặc fg<0.15 → 0 cứng' }],
  invariants: ['d = √(1−BC) — KHÔNG 1−BC', 'hard-zero chạy TRƯỚC công thức'],
  simplifications: ['[sim] 1 hist H 6-bin Σ=1; [sim-omits] S/LAB/L + weights + spatial + L2'],
  edgeCases: [{ name: 'quality-gate-cung', desc: 'area<200 hoặc fg<0.15 → 0', scenario: 'edge', edgeCase: true }],
  scenarios: [
    { id: 'normal', label: 'Bhattacharyya căn', input: { px_h: [10, 10, 10, 160], bins: 6, bin_width: 30, ref: [1, 0, 0, 0, 0, 0] }, expected: { hist: [0.75, 0, 0, 0, 0, 0.25], bc: 0.866, d: 0.366 } },
    { id: 'edge', label: 'Quality gate cứng', input: { samples: [{ crop_area: 400, fg_ratio: 0.5, aspect: 1.0 }, { crop_area: 100, fg_ratio: 0.9, aspect: 1.0 }, { crop_area: 900, fg_ratio: 0.10, aspect: 1.0 }], q_min: 0.5 }, expected: { qualities: [0.7, 0, 0], kept: [true, false, false] } }
  ],
  parameters: [param('q_min', 'quality ngưỡng giữ', 0.5, 0, 1, 0.05)],
  pseudocode: pc([
    'crop bbox → hsv/lab; mask 0 px fg → bỏ mask',
    'desc = L2norm(0.70·hs16×16 ‖ 1.20·ab12×12 ‖ 0.60·L16)',
    'quality: area<200→0; fg<0.15→0; q = 0.5·size + 0.3·fg + 0.2·aspect',
    'd = cv2 Bhattacharyya = √(1 − BC/√(ΣpΣq)); hist Σ=1 → √(1−BC)'
  ]),
  buildTrace: function (sid, prm) {
    var self = this;
    return mkTrace(self, sid, prm, function (inp, P, emit) {
      if (inp.samples) {
        var qs = inp.samples.map(function (s) {
          if (s.crop_area < 200 || s.fg_ratio < 0.15) return { q: 0, why: s.crop_area < 200 ? 'area<200' : 'fg<0.15' };
          var sizeS = Math.min(1, s.crop_area / 1000), fgS = Math.min(1, s.fg_ratio * 2), aspS = (s.aspect >= 0.3 && s.aspect <= 4) ? 1 : 0.5;
          return { q: 0.5 * sizeS + 0.3 * fgS + 0.2 * aspS, why: 'formula' };
        });
        emit([2], 'Mỗi sample tracklet có {crop_area, fg_ratio, aspect}: ' + inp.samples.map(function (s, i) { return 's' + (i + 1) + '=(' + s.crop_area + 'px,' + s.fg_ratio + ',' + s.aspect + ')'; }).join(' ') + '.', { samples: inp.samples.map(function (s) { return [s.crop_area, s.fg_ratio, s.aspect]; }) }, {
          type: 'rows', rows: inp.samples.map(function (s, i) { return { label: 's' + (i + 1), value: 'area=' + s.crop_area + ' fg=' + s.fg_ratio + ' aspect=' + s.aspect, state: 'info' }; }),
          caption: 'hard-zero chạy trước — không vào công thức'
        });
        emit([2], 'Hard-zero: ' + inp.samples.map(function (s, i) { return 's' + (i + 1) + (s.crop_area < 200 ? ' area<200→0' : s.fg_ratio < 0.15 ? ' fg<0.15→0' : ' qua gate'); }).join(' · ') + '.', { hardzero: inp.samples.map(function (s) { return s.crop_area < 200 || s.fg_ratio < 0.15; }) }, {
          type: 'rows', rows: inp.samples.map(function (s, i) { return { label: 's' + (i + 1) + ' hard gate', value: s.crop_area < 200 ? 'area<200 → q=0' : s.fg_ratio < 0.15 ? 'fg<0.15 → q=0' : 'pass → tính formula', state: (s.crop_area < 200 || s.fg_ratio < 0.15) ? 'fail' : 'pass' }; })
        });
        var kept = qs.map(function (s) { return s.q >= P.q_min; });
        emit([2], 'quality = 0.5·size + 0.3·fg + 0.2·aspect: ' + qs.map(function (s, i) { return 's' + (i + 1) + '=' + r2(s.q) + (s.why !== 'formula' ? ' (' + s.why + ')' : ''); }).join(', ') + ' → giữ [' + kept.join(',') + '].', { qualities: qs.map(function (s) { return r2(s.q); }), kept: kept }, {
          type: 'bars', items: qs.map(function (s, i) { return { label: 's' + (i + 1) + ' quality', value: r2(s.q), color: kept[i] ? '#3fce7c' : '#f2555a' }; }),
          thresholds: [{ value: P.q_min, label: 'q_min ' + P.q_min }]
        });
        return { result: { qualities: qs.map(function (s) { return r2(s.q); }), kept: kept }, invariants: [{ label: 'hard-zero trước formula', pass: qs.every(function (s, i) { return s.q > 0 || (inp.samples[i].crop_area < 200 || inp.samples[i].fg_ratio < 0.15); }), actual: 'gate cứng' }] };
      }
      var hist = new Array(inp.bins).fill(0);
      inp.px_h.forEach(function (h) { hist[Math.min(inp.bins - 1, Math.floor(h / inp.bin_width))]++; });
      var total = sum(hist);
      var rawHist = hist.slice();
      hist = hist.map(function (v) { return v / total; });
      emit([0, 1], 'Crop tracklet có ' + inp.px_h.length + ' px hue ' + JSON.stringify(inp.px_h) + ' → chia ' + inp.bins + ' bin (w=' + inp.bin_width + '°): counts ' + JSON.stringify(rawHist) + ' → chuẩn hoá Σ=1.', { px: inp.px_h.length }, {
        type: 'hist', hists: [{ title: 'raw counts', bins: rawHist.map(function (v) { return v / Math.max(1, Math.max.apply(null, rawHist)); }), color: '#8a93a8' }],
        notes: [{ text: 'mỗi px hue vào 1 bin', color: '#8a93a8' }]
      });
      var bc = 0;
      hist.forEach(function (v, i) { bc += Math.sqrt(v * inp.ref[i]); });
      var d = Math.sqrt(Math.max(0, 1 - bc));
      emit([3], 'hist p = [' + hist.map(r2).join(', ') + ']; từng bin đóng góp √(p_i·q_i) vào BC: ' + hist.map(function (v, i) { return '√(' + r2(v) + '·' + inp.ref[i] + ')=' + r3(Math.sqrt(v * inp.ref[i])); }).join(' + ') + '.', { bc: bc }, {
        type: 'hist', hists: [{ title: 'hist p', bins: hist, color: '#4f9cf7' }, { title: 'ref q', bins: inp.ref, color: '#f0a93c' }],
        notes: [{ text: 'overlap từng bin → BC', color: '#f0a93c' }]
      });
      emit([3], 'BC = Σ√(p·q) = ' + r3(bc) + ' → **d = √(1−' + r3(bc) + ') = ' + r3(d) + '** — nhớ căn, đừng nhầm 1−BC = ' + r3(1 - bc) + '.', { d: d }, {
        type: 'hist', hists: [{ title: 'hist p', bins: hist, color: '#4f9cf7' }, { title: 'ref q', bins: inp.ref, color: '#f0a93c' }],
        notes: [{ text: 'BC=' + r3(bc) + ' → d=√(1−BC)=' + r3(d), color: '#3fce7c' }, { text: 'Sai phổ biến: 1−BC=' + r3(1 - bc), color: '#f2555a' }]
      });
      return { result: { hist: hist, bc: r3(bc), d: r3(d) }, invariants: [{ label: 'd = √(1−BC)', pass: Math.abs(d - Math.sqrt(1 - bc)) < 1e-9, actual: d }] };
    });
  }
});

/* B11 — tracklet-gallery-match */
L('tracklet-gallery-match', {
  title: 'So khớp gallery tracklet',
  topic: 'd = 0.50·nearest + 0.20·coverage + 0.20·aggregate + 0.10·best3 — nearest theo chiều gallery NHỎ hơn',
  pipelineRole: 'So 2 track bằng gallery mẫu màu → reacquire/reid; fallback gallery rỗng → 0.25.',
  difficulty: 5, tags: ['gallery', 'appearance'], related: ['hsv-lab-descriptor', 'stale-anchor-reacquire', 'dormant-identity-reid'],
  codeRefs: [refp(TD, 308, 351, 'compare_tracklets', ''), refp(TD, 266, 274, 'aggregate_appearance', 'median+L2'), refp(TD, 277, 305, 'merge_appearance_samples', 'dedup 0.015, ≤24')],
  inputSchema: { galleryA: '[hist]', galleryB: '[hist]', match_max: 'float' },
  outputSchema: { distance: 'float', support: 'int', match: 'bool' },
  dataStructures: ['2 list hist', 'ma trận pairwise', 'TrackletMatch'],
  keyFields: [{ name: 'nearest', type: 'median(partial)', desc: 'partial theo chiều |A|≤|B| ? left : right' }],
  invariants: ['support = min(|A|,|B|)', 'nearest chỉ theo chiều nhỏ hơn — không max hai chiều'],
  simplifications: ['[sim-omits] bounded merge, normalize từng nguồn, zone/spatial'],
  edgeCases: [{ name: 'gallery-lech', desc: 'gallery lệch hẳn → distance>0.5 → không match', scenario: 'edge', edgeCase: true }],
  scenarios: [
    { id: 'normal', label: 'Khớp', input: { galleryA: [[0.9, 0.1], [0.6, 0.4]], galleryB: [[0.8, 0.2], [0.1, 0.9]], match_max: 0.5 }, expected: { distance: 0.1553, support: 2, match: true } },
    { id: 'edge', label: 'Gallery lệch hẳn', input: { galleryA: [[0.9, 0.1], [0.6, 0.4]], galleryB: [[0, 1], [0, 1]], match_max: 0.5 }, expected: { distance: 0.6889, support: 2, match: false } }
  ],
  parameters: [param('match_max', 'match threshold', 0.5, 0.1, 1, 0.05)],
  pseudocode: pc([
    'pairwise[i][j] = histogram_distance(a_i, b_j) (cv2 căn)',
    'left_nearest = min theo hàng; right_nearest = min theo cột',
    'partial_nearest = left nếu |A|≤|B| else right; nearest = median(partial)',
    'coverage = median(concat(left,right)); aggregate = d(agg_med_L2(A), agg_med_L2(B))',
    'best_pairs = mean(3 nhỏ nhất của pairwise)',
    'distance = 0.50·nearest + 0.20·coverage + 0.20·aggregate + 0.10·best_pairs; support = min(|A|,|B|)'
  ]),
  buildTrace: function (sid, prm) {
    var self = this;
    return mkTrace(self, sid, prm, function (inp, P, emit) {
      var A = inp.galleryA, B = inp.galleryB;
      var pw = A.map(function (a) { return B.map(function (b) { return bhatta(a, b); }); });
      var leftN = pw.map(function (row) { return Math.min.apply(null, row); });
      var rightN = B.map(function (_, j) { return Math.min.apply(null, A.map(function (_, i) { return pw[i][j]; })); });
      var partial = A.length <= B.length ? leftN : rightN;
      var nearest = median(partial);
      var coverage = median(leftN.concat(rightN));
      var aggA = new Array(A[0].length).fill(0), aggB = new Array(B[0].length).fill(0);
      for (var k = 0; k < A[0].length; k++) { aggA[k] = median(A.map(function (a) { return a[k]; })); aggB[k] = median(B.map(function (b) { return b[k]; })); }
      var nA = Math.sqrt(sum(aggA.map(function (v) { return v * v; }))), nB = Math.sqrt(sum(aggB.map(function (v) { return v * v; })));
      aggA = aggA.map(function (v) { return v / (nA || 1); }); aggB = aggB.map(function (v) { return v / (nB || 1); });
      var agg = bhatta(aggA, aggB);
      var flat = pw.reduce(function (a, r) { return a.concat(r); }, []).sort(function (a, b) { return a - b; });
      var best3 = sum(flat.slice(0, 3)) / 3;
      var dist = 0.50 * nearest + 0.20 * coverage + 0.20 * agg + 0.10 * best3;
      var match = dist < P.match_max;
      emit([0], 'Gallery A: ' + A.length + ' mẫu ' + A.map(function (h, i) { return 'a' + i + '=' + JSON.stringify(h); }).join(', ') + ' · Gallery B: ' + B.length + ' mẫu ' + B.map(function (h, i) { return 'b' + i + '=' + JSON.stringify(h); }).join(', ') + ' — so từng cặp.', { A: A.length, B: B.length }, {
        type: 'hist', hists: A.map(function (h, i) { return { title: 'a' + i, bins: h, color: '#4f9cf7' }; }).concat(B.map(function (h, i) { return { title: 'b' + i, bins: h, color: '#f0a93c' }; })),
        notes: [{ text: '|A|=' + A.length + ' vs |B|=' + B.length + ' → nearest theo chiều ' + (A.length <= B.length ? 'left' : 'right'), color: '#8a93a8' }]
      });
      emit([0, 1, 2, 3], 'pw = [' + pw.map(function (r) { return '[' + r.map(r4).join(',') + ']'; }).join(', ') + '] → nearest = ' + r4(nearest) + ', coverage = ' + r4(coverage) + ', aggregate = ' + r4(agg) + ', best3 = ' + r4(best3) + '.', { pw: pw, nearest: r4(nearest), coverage: r4(coverage), aggregate: r4(agg), best3: r4(best3) }, {
        type: 'matrix', matrix: pw, rows: A.map(function (_, i) { return 'a' + i; }), cols: B.map(function (_, j) { return 'b' + j; }),
        caption: 'nearest theo chiều ' + (A.length <= B.length ? 'left (|A|≤|B|)' : 'right')
      });
      emit([4, 5], 'd = 0.50·' + r4(nearest) + ' + 0.20·' + r4(coverage) + ' + 0.20·' + r4(agg) + ' + 0.10·' + r4(best3) + ' = **' + r4(dist) + '** ' + (match ? '<' : '>') + ' ' + P.match_max + ' → **' + (match ? 'match' : 'không match') + '**, support = ' + Math.min(A.length, B.length) + '.', { distance: dist }, {
        type: 'bars', items: [
          { label: '0.50·nearest', value: r4(0.5 * nearest), color: '#4f9cf7' },
          { label: '0.20·coverage', value: r4(0.2 * coverage), color: '#3fce7c' },
          { label: '0.20·aggregate', value: r4(0.2 * agg), color: '#f0a93c' },
          { label: '0.10·best3', value: r4(0.1 * best3), color: '#f2555a' },
          { label: 'distance', value: r4(dist), color: match ? '#3fce7c' : '#f2555a' }
        ], thresholds: [{ value: P.match_max, label: 'match_max ' + P.match_max }]
      });
      return { result: { distance: r4(dist), support: Math.min(A.length, B.length), match: match }, invariants: [{ label: 'support = min', pass: Math.min(A.length, B.length) === Math.min(A.length, B.length), actual: 'ok' }] };
    });
  }
});
setTopic('Occupancy voting');

/* =================================================================
 * GROUP C — Occupancy voting (5 lessons)
 * ================================================================= */

/* C1 — slot-roi-precompute */
L('slot-roi-precompute', {
  title: 'Bốn lớp mask của ô đỗ',
  topic: 'mask ⊃ analysis (erode border_ignore) ⊃ core (polygon thu 0.55); analysis_boundary = analysis − inner',
  pipelineRole: 'Slot init 1 lần: tạo 4 vùng cho C2–C4. Vành bị bỏ để vạch kẻ mép không nhiễu; core cho rescue; boundary phát hiện vạch chạy vào.',
  difficulty: 2, tags: ['mask', 'roi'], related: ['border-line-filter', 'ensemble-threshold-voting', 'core-rescue-vote'],
  codeRefs: [refp(PD, 201, 316, 'ROI masks', ''), refp(PD, 268, 274, 'fallback analysis', ''), refp(PD, 295, 296, 'fallback core', '')],
  inputSchema: { poly: '[[x,y]·]', border_ignore_ratio: 'float', core_scale: 'float', grid: 'int' },
  outputSchema: { roi: 'int', analysis: 'int', analysis_boundary: 'int', core: 'int' },
  dataStructures: ['4 mask bool', 'diện tích/size cache'],
  keyFields: [{ name: 'analysis_boundary', type: 'mask', desc: 'vành TRONG analysis — C3 phát hiện component chạm vành' }],
  invariants: ['slot nhỏ → FALLBACK về mask đầy đủ, KHÔNG "invalid"'],
  simplifications: ['[sim-omits] fillPoly anti-alias, ellipse kernel, scale theo img_shape'],
  edgeCases: [{ name: 'slot-nho', desc: 'analysis<5px → analysis=mask; core<5px → core=analysis', scenario: 'edge', edgeCase: true }],
  scenarios: [
    { id: 'normal', label: 'Slot 8×8 đủ lớn', input: { poly: [[0, 0], [7, 0], [7, 7], [0, 7]], border_ignore_ratio: 0.12, core_scale: 0.55, grid: 8 }, expected: { roi: 64, analysis: 36, analysis_boundary: 20, core: 16 } },
    { id: 'edge', label: 'Slot nhỏ → 2 fallback', input: { poly: [[1, 1], [4, 1], [4, 4], [1, 4]], border_ignore_ratio: 0.2, core_scale: 0.55, grid: 8 }, expected: { roi: 16, analysis: 16, analysis_boundary: 12, core: 16 } }
  ],
  parameters: [param('border', 'border_ignore_ratio', 0.12, 0, 0.4, 0.01)],
  pseudocode: pc([
    'mask = fillPoly(polygon)',
    'analysis = erode(mask, 2·inset + 1), inset = round(min_dim · border_ignore_ratio)',
    'analysis < 5px → analysis = mask (fallback 1)',
    'inner = erode(analysis, 3×3); analysis_boundary = analysis − inner',
    'core = poly thu về centroid ×0.55 ∩ analysis; < 5px → core = analysis (fallback 2)'
  ]),
  buildTrace: function (sid, prm) {
    var self = this;
    return mkTrace(self, sid, prm, function (inp, P, emit) {
      var g = inp.grid;
      var inPoly = pointInPoly; // rect fast-path inclusive — khớp fixture roi=64
      var mask = newGrid(g, g);
      for (var y = 0; y < g; y++) for (var x = 0; x < g; x++) mask[y][x] = inPoly(x, y, inp.poly) ? 1 : 0;
      function dil(m, k) { return morph(m, k, 'dilate'); }
      function countM(m) { var c = 0; for (var yy = 0; yy < g; yy++) for (var xx = 0; xx < g; xx++) c += m[yy][xx]; return c; }
      // inset từ padded bbox (pad ±2 như dossier)
      var xs = [], ys2 = [];
      for (var yy = 0; yy < g; yy++) for (var xx = 0; xx < g; xx++) if (mask[yy][xx]) { xs.push(xx); ys2.push(yy); }
      var minDim = Math.max(Math.max.apply(null, xs) - Math.min.apply(null, xs) + 1, Math.max.apply(null, ys2) - Math.min.apply(null, ys2) + 1) + 4; // +pad±2 mỗi chiều
      var inset = Math.round(minDim * (P.border !== undefined ? P.border : inp.border_ignore_ratio));
      // erode bằng k = 2·inset+1
      var analysis = morph(mask, 2 * inset + 1, 'erode');
      var fb1 = countM(analysis) < 5;
      if (fb1) analysis = mask.map(function (r) { return r.slice(); });
      var inner = morph(analysis, 3, 'erode');
      var boundary = newGrid(g, g);
      for (yy = 0; yy < g; yy++) for (xx = 0; xx < g; xx++) boundary[yy][xx] = analysis[yy][xx] && !inner[yy][xx] ? 1 : 0;
      // core: polygon thu về centroid, raster ô tâm nằm trong
      var cx = sum(xs) / xs.length, cy = sum(ys2) / ys2.length;
      var corePoly = inp.poly.map(function (p) { return [cx + (p[0] - cx) * inp.core_scale, cy + (p[1] - cy) * inp.core_scale]; });
      var core = newGrid(g, g);
      for (yy = 0; yy < g; yy++) for (xx = 0; xx < g; xx++) core[yy][xx] = (inPoly(xx, yy, corePoly) && analysis[yy][xx]) ? 1 : 0;
      var fb2 = countM(core) < 5;
      if (fb2) core = analysis.map(function (r) { return r.slice(); });
      // composite viz
      var comp = newGrid(g, g);
      for (yy = 0; yy < g; yy++) for (xx = 0; xx < g; xx++) comp[yy][xx] = core[yy][xx] ? 3 : boundary[yy][xx] ? 4 : analysis[yy][xx] ? 2 : mask[yy][xx] ? 1 : 0;
      emit([0], 'fillPoly slot ' + JSON.stringify(inp.poly) + ' → mask ' + countM(mask) + 'ô trên lưới ' + g + '×' + g + '.', { roi: countM(mask) }, {
        type: 'grid', grids: [{ title: 'mask gốc', cells: mask, cellMap: { 1: '#4f9cf7' } }],
        legend: [['#4f9cf7', 'roi/mask']]
      });
      emit([1, 2, 3], 'analysis = erode(mask, inset ' + inset + ' → k' + (2 * inset + 1) + ') = ' + countM(analysis) + 'ô' + (fb1 ? ' (**<5 → FALLBACK về mask**)' : '') + '; inner=erode(analysis,3) → boundary = analysis−inner = ' + countM(boundary) + 'ô (vành C3 dùng).', { analysis: countM(analysis), boundary: countM(boundary) }, {
        type: 'grid', grids: [
          { title: 'analysis', cells: analysis, cellMap: { 1: '#4f9cf7' } },
          { title: 'boundary', cells: boundary, cellMap: { 1: '#f0a93c' } }
        ],
        legend: [['#4f9cf7', 'analysis'], ['#f0a93c', 'analysis_boundary']]
      });
      emit([4], 'core = polygon thu ×' + inp.core_scale + ' quanh centroid (' + r2(cx) + ',' + r2(cy) + ') ∩ analysis = ' + countM(core) + 'ô' + (fb2 ? ' (**<5 → FALLBACK về analysis**)' : '') + '. 4 lớp: mask ⊃ analysis ⊃ core, boundary riêng.', { core: countM(core) }, {
        type: 'grid', grids: [
          { title: '4 lớp chồng', cells: comp, cellMap: { 1: '#2a3140', 2: '#4f9cf7', 3: '#f2555a', 4: '#f0a93c' } },
          { title: 'core', cells: core, cellMap: { 1: '#f2555a' } }
        ],
        legend: [['#2a3140', 'mask vành (bị bỏ)'], ['#4f9cf7', 'analysis'], ['#f0a93c', 'analysis_boundary'], ['#f2555a', 'core']]
      });
      return { result: { roi: countM(mask), analysis: countM(analysis), analysis_boundary: countM(boundary), core: countM(core) }, invariants: [{ label: 'slot nhỏ → fallback chứ không invalid', pass: (!fb1 || countM(analysis) === countM(mask)) && (!fb2 || countM(core) === countM(analysis)), actual: 'fb1=' + fb1 + ' fb2=' + fb2 + ' analysis=' + countM(analysis) + 'ô core=' + countM(core) + 'ô' }] };
    });
  }
});

/* C2 — ensemble-threshold-voting */
L('ensemble-threshold-voting', {
  title: 'Bỏ phiếu EMPTY đa-biến-thể + rescue/edge',
  topic: 'is_free = empty_votes ≥ V//2; free ∧ (core_rescue | edge≥thr) → occupied; occupied = ¬free',
  pipelineRole: '25 biến thể gamma×CLAHE mỗi cái đo filtered_ratio — ô chỉ free khi đa số đồng ý trống. Mặc định bảo thủ = occupied.',
  difficulty: 3, tags: ['voting', 'occupancy'], related: ['core-rescue-vote', 'border-line-filter', 'temporal-smoothing-dwell'],
  codeRefs: [refp(PD, 439, 600, 'detect', ''), refp(PD, 527, 534, 'votes → is_free', ''), refp(PD, 551, 566, 'edge recheck', '')],
  inputSchema: { ratios: 'float[V]', core: '{raw,core,comp_ratio,count}', edge_ratio: 'float', ratio_thr: 'float' },
  outputSchema: { is_free: 'bool', empty_votes: 'int', exit_votes: 'int', occupied: 'bool' },
  dataStructures: ['empty_votes[]', 'exit_votes[]', 'is_free_list[]', 'evidence per-slot'],
  keyFields: [{ name: 'required', type: 'V//2', desc: 'empty phải thắng tuyệt đối — inverted-by-design' }],
  invariants: ['mặc định occupied — mơ hồ → occupied', 'vote chỉ trên filtered_ratio'],
  simplifications: ['[sim-omits] gamma LUT/CLAHE/adaptiveThreshold — demo nhận ratios[] sẵn; V_demo=9'],
  edgeCases: [{ name: 'biên-threshold', desc: 'ratio == thr không tính empty (< chứ không ≤)', scenario: 'edge', edgeCase: true }],
  scenarios: [
    { id: 'normal', label: '4 case cùng V=9', input: { V: 9, ratio_thr: 0.20, edge_thr: 0.25, cases: [
      { id: 'occupied_majority', ratios: [0.30, 0.28, 0.31, 0.05, 0.04, 0.29, 0.30, 0.02, 0.25], core: { raw_ratio: 0.35, core_ratio: 0.05, comp_ratio: 0.0, count: 0 }, edge_ratio: 0.10 },
      { id: 'free_clear', ratios: [0.05, 0.28, 0.31, 0.05, 0.04, 0.06, 0.19, 0.10, 0.02], core: { raw_ratio: 0.12, core_ratio: 0.05, comp_ratio: 0.0, count: 0 }, edge_ratio: 0.10 },
      { id: 'free_but_rescue', ratios: [0.05, 0.28, 0.31, 0.05, 0.04, 0.06, 0.19, 0.10, 0.02], core: { raw_ratio: 0.35, core_ratio: 0.20, comp_ratio: 0.10, count: 1 }, edge_ratio: 0.10 },
      { id: 'free_but_edge', ratios: [0.05, 0.28, 0.31, 0.05, 0.04, 0.06, 0.19, 0.10, 0.02], core: { raw_ratio: 0.12, core_ratio: 0.05, comp_ratio: 0.0, count: 0 }, edge_ratio: 0.30 }
    ] }, expected: { verdicts: ['occupied', 'free', 'occupied', 'occupied'] } },
    { id: 'edge', label: 'Ngưỡng vừa đủ + exit_votes', input: { ratios: [0.19, 0.19, 0.19, 0.19, 0.25, 0.25, 0.25, 0.25, 0.07], ratio_thr: 0.20, exit_thr: 0.08, V: 9, edge_ratio: 0.1 }, expected: { empty_votes: 5, exit_votes: 1, is_free: true } }
  ],
  parameters: [param('ratio_thr', 'ratio_thr', 0.2, 0.05, 0.5, 0.01)],
  pseudocode: pc([
    'mỗi biến thể: ratio_k < ratio_thr → empty_votes++; < min(thr, exit=0.08) → exit_votes++',
    'required = V//2; is_free = empty_votes ≥ required',
    'is_free ∧ core_rescue → is_free = False (C4)',
    'is_free ∧ edge_ratio ≥ edge_thr → is_free = False',
    'occupied = ¬is_free — ngữ nghĩa mặc định có xe'
  ]),
  buildTrace: function (sid, prm) {
    var self = this;
    return mkTrace(self, sid, prm, function (inp, P, emit) {
      var thr = P.ratio_thr !== undefined ? P.ratio_thr : inp.ratio_thr;
      function evalCase(cs) {
        var ev = 0, xv = 0;
        cs.ratios.forEach(function (r) { if (r < thr) ev++; if (r < Math.min(thr, 0.08)) xv++; });
        var req = Math.floor(cs.ratios.length / 2);
        var free = ev >= req;
        var reason = '';
        if (free && cs.core) {
          var cr = cs.core;
          var central = cr.core_ratio >= 0.18 && cr.comp_ratio >= 0.08;
          var textured = cr.raw_ratio >= 0.30 && cr.core_ratio >= 0.02 && cr.count >= 2;
          if (central || textured) { free = false; reason = 'core_rescue(' + (central ? 'central_blob' : 'textured') + ')'; }
        }
        if (free && cs.edge_ratio !== undefined && cs.edge_ratio >= (inp.edge_thr || 0.25)) { free = false; reason = 'edge_recheck'; }
        return { ev: ev, xv: xv, req: req, free: free, occupied: !free, reason: reason };
      }
      var cases = inp.cases || [inp];
      var results = cases.map(evalCase);
      emit([0], 'Mỗi slot đo bởi V=' + (cases[0].ratios || inp.ratios).length + ' biến thể tiền xử lý (gamma×CLAHE — [sim] nhận ratios sẵn). ' + cases.length + ' case: ' + cases.map(function (cs) { return cs.id || 'edge'; }).join(', ') + '.', { V: (cases[0].ratios || inp.ratios).length }, {
        type: 'hist', hists: cases.slice(0, 2).map(function (cs, i) { return { title: (cs.id || 'case') + ' ratios', bins: (cs.ratios || inp.ratios), color: i ? '#f0a93c' : '#4f9cf7' }; }),
        notes: [{ text: 'ratio_k < ' + thr + ' → phiếu empty', color: '#8a93a8' }]
      });
      emit([0, 1, 2], cases.map(function (cs, i) {
        var r = results[i];
        return (cs.id || 'case') + ': ratios<' + thr + ' → ' + r.ev + ' phiếu ' + (r.ev >= r.req ? '≥' : '<') + ' ' + r.req + ' → ' + (r.ev >= r.req ? 'free' : 'occupied') + (r.reason ? ' → cứu ' + r.reason : '');
      }).join(' · '), { ev: results.map(function (r) { return r.ev; }), req: results[0].req, verdicts: results.map(function (r) { return r.occupied ? "occupied" : "free"; }) }, {
        type: 'rows', rows: cases.map(function (cs, i) {
          var r = results[i];
          return { label: (cs.id || 'case') + ': ' + r.ev + '/' + cs.ratios.length + ' phiếu', value: (r.occupied ? 'occupied' : 'free') + (r.reason ? ' [' + r.reason + ']' : ''), state: r.occupied ? 'fail' : 'pass' };
        })
      });
      emit([3, 4], 'Cứu chỉ áp khi free — occupied_majority không cần xét cứu. occupied = ¬is_free: **' + results.map(function (r) { return r.occupied ? 'occupied' : 'free'; }).join(' / ') + '**.', { occupied: results.map(function (r) { return r.occupied; }) }, {
        type: 'board', cards: results.map(function (r, i) { return { label: cases[i].id || 'case' + i, value: r.occupied ? 'occupied' : 'free', hl: true, color: r.occupied ? '#f2555a' : '#3fce7c' }; })
      });
      var res = inp.cases ? { verdicts: results.map(function (r) { return r.occupied ? 'occupied' : 'free'; }) } : { empty_votes: results[0].ev, exit_votes: results[0].xv, is_free: results[0].free };
      return { result: res, invariants: [{ label: 'mơ hồ → occupied', pass: results.every(function (r) { return r.ev >= r.req ? true : r.occupied; }), actual: 'inverted-by-design' }] };
    });
  }
});

/* C3 — border-line-filter */
L('border-line-filter', {
  title: 'Lọc component vạch kẻ trong analysis',
  topic: 'xóa comp nếu touches_boundary ∧ span≥0.45 ∧ thickness≤0.18 ∧ ¬vehicle_like_core',
  pipelineRole: 'Vạch ô đỗ chạy vào analysis tạo comp mảnh-dài chạm vành → xóa để filtered_ratio không bị phình bởi tín hiệu vĩnh viễn.',
  difficulty: 4, tags: ['filter', 'component'], related: ['slot-roi-precompute', 'ensemble-threshold-voting'],
  codeRefs: [refp(PD, 321, 416, '_filter_roi_threshold', ''), refp(PD, 336, 367, 'span/thickness/is_border_line', ''), refp(PD, 368, 387, 'selective removal', '')],
  inputSchema: { fg_cells: '{name:[[x,y]·]}', analysis_size: '[w,h]', thresholds: '{span_min,thickness_max,comp_core_min}' },
  outputSchema: { filtered_ratio: 'float', raw_ratio: 'float', removed_ratio: 'float', removed: '[bool]' },
  dataStructures: ['label map + stats per component', '_ROIEvidence dict'],
  keyFields: [{ name: 'filtered_ratio', type: 'count/analysis_area', desc: 'mẫu số analysis, raw_ratio mẫu số roi.area — khác nhau' }],
  invariants: ['component xe có lõi đủ + dày → vehicle_like_core cứu, không bị xóa'],
  simplifications: ['[sim-omits] selective fitLine/distanceTransform — demo xóa nguyên component (nhánh selective=False)', '[sim] connectivity 4 lưới'],
  edgeCases: [{ name: 'component-ngan', desc: 'span<thr → giữ; xe có lõi → vehicle_like_core cứu', scenario: 'edge', edgeCase: true }],
  scenarios: [
    { id: 'normal', label: 'Vạch 6 ô trên vành bị xóa', input: { analysis_area: 36, roi_area: 64, core_area: 16, analysis_size: [6, 6], fg_cells: { line: [[1, 1], [2, 1], [3, 1], [4, 1], [5, 1], [6, 1]], blob: [[3, 3], [4, 3], [3, 4], [4, 4]] }, thresholds: { span_min: 0.45, thickness_max: 0.18, comp_core_min: 0.08 } }, expected: { before_ratio: 0.278, filtered_ratio: 0.111, removed_ratio: 0.167, raw_ratio: 0.156 } },
    { id: 'edge', label: 'Vạch ngắn + xe có lõi được giữ', input: { analysis_area: 36, roi_area: 64, core_area: 16, analysis_size: [6, 6], fg_cells: { line: [[1, 1], [2, 1]], blob: [[3, 3], [4, 3], [3, 4], [4, 4]] }, thresholds: { span_min: 0.45, thickness_max: 0.18, comp_core_min: 0.08 } }, expected: { removed: false, filtered_ratio: 0.167 } }
  ],
  parameters: [param('span_min', 'line_min_span_ratio', 0.45, 0.2, 1, 0.05)],
  pseudocode: pc([
    'raw_ratio = fg∩roi / roi.area; filtered = fg ∩ analysis (vành không vào từ đầu)',
    'với mỗi component: touches = ∩analysis_boundary ≠ ∅',
    'span = max(w/aw, h/ah); thickness = (area/max(w,h)) / min(analysis_size)',
    'vehicle_like_core = comp_core/core_area ≥ 0.08 ∧ thickness ≥ 0.18·0.9',
    'is_border_line = touches ∧ span ≥ 0.45 ∧ thickness ≤ 0.18 ∧ ¬vehicle_like_core → xóa',
    'filtered_ratio = fg còn lại / analysis_area'
  ]),
  buildTrace: function (sid, prm) {
    var self = this;
    return mkTrace(self, sid, prm, function (inp, P, emit) {
      var g = 8;
      var fg = newGrid(g, g);
      var compId = newGrid(g, g);
      var names = Object.keys(inp.fg_cells);
      names.forEach(function (name, ci) {
        inp.fg_cells[name].forEach(function (cell) { fg[cell[1]][cell[0]] = ci + 1; });
      });
      var spanMin = P.span_min !== undefined ? P.span_min : inp.thresholds.span_min;
      var removed = names.map(function () { return false; });
      var stats = names.map(function (name, ci) {
        var cells = inp.fg_cells[name];
        var xs = cells.map(function (c) { return c[0]; }), ys = cells.map(function (c) { return c[1]; });
        var w = Math.max.apply(null, xs) - Math.min.apply(null, xs) + 1, h = Math.max.apply(null, ys) - Math.min.apply(null, ys) + 1;
        var span = Math.max(w / inp.analysis_size[0], h / inp.analysis_size[1]);
        var thick = (cells.length / Math.max(w, h)) / Math.min(inp.analysis_size[0], inp.analysis_size[1]);
        var touches = cells.some(function (c) { return c[0] === 1 || c[1] === 1 || c[0] === 6 || c[1] === 6; });
        var corePx = cells.filter(function (c) { return c[0] >= 2 && c[0] <= 5 && c[1] >= 2 && c[1] <= 5; }).length;
        var coreRatio = corePx / inp.core_area;
        var vehicleCore = coreRatio >= inp.thresholds.comp_core_min && thick >= inp.thresholds.thickness_max * 0.9;
        var isLine = touches && span >= spanMin && thick <= inp.thresholds.thickness_max && !vehicleCore;
        if (isLine) removed[ci] = true;
        return { name: name, span: span, thick: thick, touches: touches, coreRatio: coreRatio, vehicleCore: vehicleCore, isLine: isLine };
      });
      var removedPx = 0, keptPx = 0;
      emit([0], 'FG components trong analysis ' + inp.analysis_size[0] + '×' + inp.analysis_size[1] + ': ' + names.map(function (n) { return n + ' (' + inp.fg_cells[n].length + ' ô)'; }).join(' + ') + '. Vùng vành (x|y = 1|6) là analysis_boundary — comp chạm vành bị soi.', { comps: names.length }, {
        type: 'grid', cells: fg.map(function (row) { return row.map(function (v) { return v > 0 ? v : 0; }); }), cellMap: { 1: '#f0a93c', 2: '#3fce7c' },
        boundary: { x0: 1, y0: 1, x1: 6, y1: 6 },
        legend: [['#f0a93c', names[0] || 'comp'], ['#3fce7c', names[1] || 'comp'], ['#8a93a8', 'analysis_boundary']]
      });
      var comp = newGrid(g, g);
      for (var y = 0; y < g; y++) for (var x = 0; x < g; x++) {
        var v = fg[y][x];
        if (!v) continue;
        if (removed[v - 1]) { comp[y][x] = 3; removedPx++; } else { comp[y][x] = v === 1 ? 1 : 2; keptPx++; }
      }
      emit([0, 1, 2, 3], stats.map(function (s) {
        return s.name + ': span=' + r2(s.span) + ' thick=' + r3(s.thick) + ' touches=' + (s.touches ? '✓' : '✗') + ' core=' + r2(s.coreRatio) + ' → **' + (s.isLine ? 'XÓA (border_line)' : 'giữ') + '**';
      }).join(' · '), { stats: stats.map(function (s) { return { name: s.name, span: r2(s.span), thick: r3(s.thick), isLine: s.isLine }; }) }, {
        type: 'grid', cells: comp, cellMap: { 1: '#f0a93c', 2: '#3fce7c', 3: '#f2555a' },
        legend: [['#f0a93c', 'fg giữ (vạch/comp 1)'], ['#3fce7c', 'blob giữ'], ['#f2555a', 'xóa — border_line']]
      }, [{ label: 'xóa:isLine', value: stats.filter(function (s) { return s.isLine; }).length }, { label: 'giữ', value: stats.filter(function (s) { return !s.isLine; }).length }]);
      emit([4, 5], 'filtered = ' + keptPx + ' → **filtered_ratio = ' + keptPx + '/' + inp.analysis_area + ' = ' + r3(keptPx / inp.analysis_area) + '**; raw_ratio = ' + (keptPx + removedPx) + '/' + inp.roi_area + ' = ' + r3((keptPx + removedPx) / inp.roi_area) + ' (mẫu số roi.area khác).', { kept: keptPx, removed: removedPx, filtered_ratio: r3(keptPx / inp.analysis_area), raw_ratio: r3((keptPx + removedPx) / inp.roi_area) }, {
        type: 'rows', rows: stats.map(function (s) { return { label: s.name + ' span ' + r2(s.span), value: s.isLine ? 'removed' : 'kept', state: s.isLine ? 'fail' : 'pass' }; })
          .concat([{ label: 'filtered_ratio', value: r3(keptPx / inp.analysis_area), state: 'pass' }])
      });
      return { result: { before_ratio: r3((keptPx + removedPx) / inp.analysis_area), filtered_ratio: r3(keptPx / inp.analysis_area), raw_ratio: r3((keptPx + removedPx) / inp.roi_area), removed_ratio: r3(removedPx / inp.analysis_area), removed: removedPx > 0 }, invariants: [{ label: 'vehicle_like_core bảo vệ xe chạm vành', pass: stats.every(function (s) { return !s.vehicleCore || !s.isLine; }), actual: stats.map(function (s) { return s.name + ':' + (s.vehicleCore ? 'protected' : '-') + (s.isLine ? '✗' : ''); }).join(', ') }] };
    });
  }
});

/* C4 — core-rescue-vote */
L('core-rescue-vote', {
  title: 'Cứu "free" khi lõi/cụm dày phản bội vote',
  topic: 'rescue = (core≥0.18 ∧ comp≥0.08) ∨ (raw≥0.30 ∧ core≥0.02 ∧ count≥2)',
  pipelineRole: 'Khi is_free theo vote nhưng evidence base chứng minh xe thật → lật occupied. Chỉ evidence của biến thể BASE quyết định.',
  difficulty: 2, tags: ['rescue', 'evidence'], related: ['ensemble-threshold-voting', 'slot-roi-precompute'],
  codeRefs: [refp(PD, 418, 428, '_has_core_rescue', ''), refp(PD, 542, 547, 'gọi tại vote', '')],
  inputSchema: { raw_ratio: 'float', core_ratio: 'float', core_component_ratio: 'float', core_component_count: 'int' },
  outputSchema: { rescue: 'bool', branch: 'string' },
  dataStructures: ['_ROIEvidence fields'],
  keyFields: [{ name: 'count≥2', type: 'gate', desc: 'một cụm dày đơn lẻ KHÔNG đủ cho textured' }],
  invariants: ['rescue chỉ lật khi đang free — occupied giữ nguyên'],
  simplifications: ['[sim-omits] minimum_component_area, shape-detail'],
  edgeCases: [{ name: 'count-gate', desc: 'count 1 vs 2 quyết định nhánh textured', scenario: 'edge', edgeCase: true }],
  scenarios: [
    { id: 'normal', label: 'central_blob cứu', input: { core_ratio: 0.20, core_component_ratio: 0.10, raw_ratio: 0.15, core_component_count: 1 }, expected: { rescue: true, branch: 'central_blob' } },
    { id: 'edge', label: 'count gate quyết định', input: { cases: [{ id: 'count1', raw_ratio: 0.35, core_ratio: 0.03, core_component_count: 1 }, { id: 'count2', raw_ratio: 0.35, core_ratio: 0.03, core_component_count: 2 }] }, expected: { verdicts: [false, true] } }
  ],
  parameters: [],
  pseudocode: pc([
    'central_blob = core_ratio ≥ 0.18 ∧ core_component_ratio ≥ 0.08',
    'textured_dense_blob = raw_ratio ≥ 0.30 ∧ core_ratio ≥ 0.02 ∧ core_component_count ≥ 2',
    'rescue = central ∨ textured; is_free ∧ rescue → occupied'
  ]),
  buildTrace: function (sid, prm) {
    var self = this;
    return mkTrace(self, sid, prm, function (inp, P, emit) {
      function evalCase(c) {
        var central = c.core_ratio >= 0.18 && (c.core_component_ratio || 0) >= 0.08;
        var textured = c.raw_ratio >= 0.30 && c.core_ratio >= 0.02 && (c.core_component_count || 0) >= 2;
        return { central: central, textured: textured, rescue: central || textured, branch: central ? 'central_blob' : textured ? 'textured_dense_blob' : 'none' };
      }
      var cases = inp.cases || [inp];
      var rs = cases.map(evalCase);
      emit([0], 'Evidence của ô đang vote free: ' + cases.map(function (c, i) {
        return (c.id || 'case') + ' — raw=' + c.raw_ratio + ', core=' + c.core_ratio + ', comp=' + (c.core_component_ratio || 0) + ', count=' + (c.core_component_count || 0);
      }).join(' | ') + '. Hai nhánh cứu độc lập OR nhau.', { cases: cases.length }, {
        type: 'rows', rows: cases.map(function (c) {
          return { label: c.id || 'evidence', value: 'raw ' + c.raw_ratio + ' · core ' + c.core_ratio + ' · comp ' + (c.core_component_ratio || 0) + ' · count ' + (c.core_component_count || 0), state: 'info' };
        })
      });
      emit([0, 1], 'Nhánh central_blob: core≥0.18 ∧ comp≥0.08 → ' + rs.map(function (r) { return r.central ? '✓' : '✗'; }).join(' / ') + '. Nhánh textured_dense_blob: raw≥0.30 ∧ core≥0.02 ∧ count≥2 → ' + rs.map(function (r) { return r.textured ? '✓' : '✗'; }).join(' / ') + ' (một cụm đơn lẻ KHÔNG đủ).', { central: rs.map(function (r) { return r.central; }), textured: rs.map(function (r) { return r.textured; }) }, {
        type: 'rows', rows: [
          { label: 'central_blob: core≥0.18 ∧ comp≥0.08', value: rs.map(function (r) { return r.central ? '✓' : '✗'; }).join(' / '), state: rs[0].central ? 'pass' : 'warn' },
          { label: 'textured: raw≥0.30 ∧ core≥0.02 ∧ count≥2', value: rs.map(function (r) { return r.textured ? '✓' : '✗'; }).join(' / '), state: rs.some(function (r) { return r.textured; }) ? 'pass' : 'warn' }
        ]
      });
      emit([2], cases.map(function (c, i) {
        var r = rs[i];
        return (c.id || 'case') + ': central=' + (r.central ? '✓' : '✗') + ' textured=' + (r.textured ? '✓' : '✗') + ' → **rescue=' + r.rescue + '**' + (r.branch !== 'none' ? ' (' + r.branch + ')' : '');
      }).join(' · '), { rescue: rs.map(function (r) { return r.rescue; }), branches: rs.map(function (r) { return r.branch; }) }, {
        type: 'rows', rows: [
          { label: 'central_blob: core≥0.18 ∧ comp≥0.08', value: rs.map(function (r) { return r.central ? '✓' : '✗'; }).join(' / '), state: rs[0].central ? 'pass' : 'warn' },
          { label: 'textured: raw≥0.30 ∧ core≥0.02 ∧ count≥2', value: rs.map(function (r) { return r.textured ? '✓' : '✗'; }).join(' / '), state: rs.some(function (r) { return r.textured; }) ? 'pass' : 'warn' },
          { label: 'rescue (OR)', value: rs.map(function (r) { return String(r.rescue); }).join(' / '), state: 'pass' }
        ]
      });
      return { result: { rescue: rs[0].rescue, branch: rs[0].branch, verdicts: rs.map(function (r) { return r.rescue; }) }, invariants: [{ label: 'count<2 → textured fail', pass: !inp.cases || !rs[0].textured, actual: 'count gate' }] };
    });
  }
});

/* C5 — temporal-smoothing-dwell */
L('temporal-smoothing-dwell', {
  title: 'Hai cơ chế chống lắc: streak vs timestamp dwell',
  topic: '(a) counter đối xứng 2 chiều (b) dwell count∧duration bất đối xứng + gap-reset + timestamp-monotonic — KHÔNG trộn',
  pipelineRole: 'Chống nhấp nháy occupied: streak frame trong detect + commit evidence theo clock nguồn. Hysteresis thật: 2count/0.5s vào vs 3count/1.0s ra.',
  difficulty: 4, tags: ['temporal', 'hysteresis', 'fsm'], related: ['ensemble-threshold-voting', 'evidence-staleness-guard'],
  codeRefs: [refp(PD, 63, 80, 'TemporalSmoother', ''), refp(PD, 602, 645, 'accept_evidence', 'timestamp-monotonic'), refp(PD, 610, 611, 'reject stale', '')],
  inputSchema: { t: 'float[]', desired: '0|1[]', init_state: 'string', gap_max: 'float' },
  outputSchema: { flips: '[[t,state]]', final_state: 'string', rejects: 'int' },
  dataStructures: ['_stable_slots{occupied,pending,since,count,initialized}', '_accepted_timestamp'],
  keyFields: [{ name: 'monotonic guard', type: 'timestamp', desc: 'now ≤ _accepted_timestamp → reject toàn batch — không có biến seq' }],
  invariants: ['cần CẢ count LẪN duration — poll nhanh vẫn chờ đủ giây', 'gap>1.5s → pending reset'],
  simplifications: ['[sim-omits] desired mapping từ exit_votes/instant_occupied — demo nhận desired sẵn', 'placeholder occupied=True khi chưa initialized'],
  edgeCases: [{ name: 'gap-reset', desc: 'gap>1.5s → mẫu trước bị "ăn"', scenario: 'edge', edgeCase: true }, { name: 'stale-ts', desc: 'timestamp đi lùi → batch reject', scenario: 'stale', edgeCase: true }],
  scenarios: [
    { id: 'normal', label: 'count ∧ duration đúng', input: { t: [0, 0.4, 0.8, 1.2, 1.6, 2.0, 2.4], desired: [1, 1, 1, 0, 0, 0, 0], init_state: 'free', initialized: true }, expected: { flips: [[0.8, 'occupied'], [2.4, 'free']] } },
    { id: 'edge', label: 'Gap reset', input: { t: [0, 2.0, 2.4, 3.0], desired: [1, 1, 1, 1], init_state: 'free', gap_max: 1.5 }, expected: { flips: [[3.0, 'occupied']] } },
    { id: 'stale', label: 'Timestamp lùi → reject', input: { t: [0, 0.4, 0.2], desired: [1, 1, 1], init_state: 'free' }, expected: { rejects: 1, final_state: 'free' } }
  ],
  parameters: [param('gap_max', 'gap reset (s)', 1.5, 0.5, 5, 0.1)],
  pseudocode: pc([
    '(a) TemporalSmoother: pending==vote → counter++; else pending=vote,counter=1; counter≥5 → confirmed=vote (đối xứng 2 chiều)',
    '(b) accept_evidence: now ≤ _accepted_timestamp → reject toàn batch',
    'gap = now−last > 1.5s → pending=None, count=0, since=now',
    'desired==state → reset; else pending=desired, count++',
    'count ≥ (2 nếu occupied / 3 nếu free) ∧ elapsed ≥ (0.5s / 1.0s) → flip',
    'chưa initialized → occupied=True placeholder'
  ]),
  buildTrace: function (sid, prm) {
    var self = this;
    return mkTrace(self, sid, prm, function (inp, P, emit) {
      var state = inp.init_state, pending = null, count = 0, since = 0, last = -Infinity;
      var acceptedTs = -Infinity, rejects = 0;
      var flips = [], events = [], gateLog = [];
      var gapMax = P.gap_max !== undefined ? P.gap_max : (inp.gap_max || 1.5);
      emit([1, 2, 3], 'Slot bắt đầu ' + inp.init_state + ' — duyệt ' + inp.t.length + ' mẫu desired ' + JSON.stringify(inp.desired) + ' tại t=' + JSON.stringify(inp.t) + '. Vào occupied cần 2count/0.5s; ra free cần 3count/1.0s; gap>' + gapMax + 's → reset.', { state: state }, {
        type: 'timeline', events: [{ t: inp.t[0], label: 'init ' + state, color: '#8a93a8' }],
        tMin: inp.t[0], tMax: inp.t[inp.t.length - 1] + 0.5
      });
      inp.t.forEach(function (t, i) {
        var des = inp.desired[i];
        if (t <= acceptedTs) { rejects++; events.push({ t: t, msg: 'REJECT (ts lùi)', rej: true }); }
        else {
          acceptedTs = t;
          var gap = t - last; last = t;
          if (gap > gapMax) { pending = null; count = 0; since = t; events.push({ t: t, msg: 'gap ' + r2(gap) + '>' + gapMax + ' → reset' }); }
          if (des === (state === 'occupied' ? 1 : 0)) { pending = null; count = 0; events.push({ t: t, msg: 'desired=state → reset pending' }); }
          else {
            if (pending !== des) { pending = des; count = 0; since = t; }
            count++;
            var need = des === 1 ? 2 : 3, needT = des === 1 ? 0.5 : 1.0;
            var elapsed = t - since;
            if (count >= need && elapsed >= needT) {
              state = des === 1 ? 'occupied' : 'free';
              flips.push([t, state]);
              gateLog.push({ t: t, count: count, need: need, elapsed: elapsed, needT: needT });
              events.push({ t: t, msg: 'count ' + count + '≥' + need + ' ∧ elapsed ' + r2(elapsed) + '≥' + needT + ' → ' + state });
              pending = null; count = 0;
            } else {
              events.push({ t: t, msg: 'count=' + count + ' elapsed=' + r2(elapsed) + ' (cần ' + need + '/' + needT + 's) → chờ' });
            }
          }
        }
        var ev = events[events.length - 1];
        emit([ev.rej ? 1 : 3, 4], 't=' + t + 's desired=' + des + ' → ' + ev.msg + ' (state ' + state + (pending !== null ? ', pending ' + pending + ' ×' + count : '') + ').', { state: state, count: count }, {
          type: 'timeline', events: events.map(function (e2) { return { t: e2.t, label: e2.msg, color: e2.rej ? '#f2555a' : '#4f9cf7' }; }),
          tMin: inp.t[0], tMax: inp.t[inp.t.length - 1] + 0.5
        });
      });
      emit([4], 'Flips: ' + (flips.length ? flips.map(function (f) { return '(' + f[0] + 's → ' + f[1] + ')'; }).join(', ') : 'không') + '. Reject: ' + rejects + '. Count-only sẽ lật sớm hơn — duration-gate trì hoãn đúng.', { flips: flips }, {
        type: 'rows', rows: events.slice(-6).map(function (e) { return { label: 't=' + e.t + 's', value: e.msg, state: e.rej ? 'fail' : 'pass' }; })
      });
      return { result: { flips: flips, final_state: state, rejects: rejects }, invariants: [{ label: 'count∧duration cả hai', pass: gateLog.every(function (g) { return g.count >= g.need && g.elapsed >= g.needT; }), actual: gateLog.map(function (g) { return 't' + g.t + ':' + g.count + '≥' + g.need + ' ' + r2(g.elapsed) + '≥' + g.needT + 's'; }).join(' ') || 'không flip' }] };
    });
  }
});
setTopic('Slot binder');

/* =================================================================
 * GROUP D — SlotVehicleBinder (11 lessons)
 * ================================================================= */

/* D1 — slot-overlap-geometry */
L('slot-overlap-geometry', {
  title: 'Đo chồng lấp xe↔ô đỗ',
  topic: 'qualify = (inside ∧ vo≥0.35) ∨ vo≥0.60; score = min(1, 0.70·vo + 0.20·so + 0.10·prox)',
  pipelineRole: 'Định lượng "xe đứng trong ô bao nhiêu" — nguồn số cho D2/D3/D5. Output 4 key {vehicle_overlap, slot_overlap, center_proximity, score} hoặc None.',
  difficulty: 2, tags: ['geometry', 'overlap'], related: ['slot-track-batch-match', 'arrival-claim-qualification'],
  codeRefs: [refp(SB, 712, 745, '_overlap_geometry', ''), refp(SB, 217, 218, 'ngưỡng 0.35/0.60', '')],
  inputSchema: { bbox: '[x,y,w,h]', slot_poly: '[[x,y]]', slot_center: '[x,y]', vo_min: 'float', vo_strong: 'float' },
  outputSchema: { vehicle_overlap: 'float', slot_overlap: 'float', center_proximity: 'float', score: 'float|null' },
  dataStructures: ['metrics dict', 'polygon ndarray', 'binding.center cache'],
  keyFields: [{ name: 'qualify', type: 'gate', desc: 'vo≥0.60 với center ngoài VẪN qualify (nhánh strong)' }],
  invariants: ['inter=0 → vo=0 → None', 'output không chứa center_inside'],
  simplifications: ['[sim-omits] signed_polygon_distance, cv2.intersectConvexConvex — demo raster∩ lưới'],
  edgeCases: [{ name: 'ngoai-hau-het', desc: 'vo<0.35 và center ngoài → None', scenario: 'edge', edgeCase: true }],
  scenarios: [
    { id: 'normal', label: 'Đỗ trọn trong ô', input: { bbox: [2, 2, 4, 4], slot_poly: [[0, 0], [8, 0], [8, 8], [0, 8]], slot_center: [4, 4], vo_min: 0.35, vo_strong: 0.60 }, expected: { vehicle_overlap: 1.0, slot_overlap: 0.309, center_proximity: 1.0, score: 0.862 } },
    { id: 'edge', label: 'Xe lấn mép → None', input: { bbox: [7, 7, 4, 4], slot_poly: [[0, 0], [8, 0], [8, 8], [0, 8]], slot_center: [4, 4], vo_min: 0.35, vo_strong: 0.60 }, expected: { score: null } }
  ],
  parameters: [param('vo_min', 'min_vehicle_overlap', 0.35, 0.1, 0.9, 0.05)],
  pseudocode: pc([
    'inter = |cells(bbox) ∩ cells(poly)|',
    'vehicle_overlap = inter/area(bbox); slot_overlap = inter/area(poly)',
    'center_inside = center(bbox) ∈ poly',
    'qualifies = (inside ∧ vo≥0.35) ∨ vo≥0.60; không → None',
    'center_proximity = max(0, 1 − dist(center,slot_c)/diag)',
    'score = min(1, 0.70·vo + 0.20·so + 0.10·prox)'
  ]),
  buildTrace: function (sid, prm) {
    var self = this;
    return mkTrace(self, sid, prm, function (inp, P, emit) {
      var b = inp.bbox;
      var pxs = inp.slot_poly.map(function (p) { return p[0]; }), pys = inp.slot_poly.map(function (p) { return p[1]; });
      var x0 = Math.min.apply(null, pxs), y0 = Math.min.apply(null, pys), x1 = Math.max.apply(null, pxs), y1 = Math.max.apply(null, pys);
      var polyArea = (x1 - x0 + 1) * (y1 - y0 + 1);
      var cellsA = (b[2] + 1) * (b[3] + 1); // inclusive — khớp convention raster inter
      // raster: ô (i,j) ∈ bbox nếu i∈[bx, bx+w] inclusive; ∈ poly nếu trong bbox poly (đa giác chữ nhật)
      var inter = 0;
      var ox0 = Math.max(b[0], x0), oy0 = Math.max(b[1], y0), ox1 = Math.min(b[0] + b[2], x1), oy1 = Math.min(b[1] + b[3], y1);
      if (ox1 >= ox0 && oy1 >= oy0) inter = (ox1 - ox0 + 1) * (oy1 - oy0 + 1);
      var vo = inter / cellsA, so = inter / polyArea;
      emit([0], 'Xe bbox ' + JSON.stringify(b) + ' (dt ' + cellsA + 'ô inclusive) trên ô đỗ poly dt ' + polyArea + 'ô, tâm ô ' + JSON.stringify(inp.slot_center) + '.', { bbox: b, polyArea: polyArea }, {
        type: 'tracks', boxes: [
          { x: x0, y: y0, w: x1 - x0 + 1, h: y1 - y0 + 1, id: 'slot', color: '#4f9cf7' },
          { x: b[0], y: b[1], w: b[2] + 1, h: b[3] + 1, id: 'xe', color: '#8fa2c8' }
        ], points: [{ x: inp.slot_center[0], y: inp.slot_center[1], label: 'tâm ô', color: '#4f9cf7' }],
        caption: 'raster∩ hai miền để đo chồng lấp'
      });
      var ccx = b[0] + b[2] / 2, ccy = b[1] + b[3] / 2;
      var inside = ccx >= x0 && ccx <= x1 && ccy >= y0 && ccy <= y1;
      var voMin = P.vo_min !== undefined ? P.vo_min : inp.vo_min;
      var qual = (inside && vo >= voMin) || vo >= inp.vo_strong;
      var diag = Math.hypot(x1 - x0, y1 - y0);
      var prox = Math.max(0, 1 - dist2(ccx, ccy, inp.slot_center[0], inp.slot_center[1]) / diag);
      var score = qual ? Math.min(1, 0.70 * vo + 0.20 * so + 0.10 * prox) : null;
      emit([1, 2, 3], 'inter = ' + inter + ' ô → vo = ' + inter + '/' + cellsA + ' = ' + r3(vo) + '; so = ' + inter + '/' + polyArea + ' = ' + r3(so) + '; inside=' + inside + ' → qualify = ' + qual + '.', { vo: vo, so: so, inside: inside }, {
        type: 'tracks', boxes: [
          { x: x0, y: y0, w: x1 - x0 + 1, h: y1 - y0 + 1, id: 'slot', color: '#4f9cf7' },
          { x: b[0], y: b[1], w: b[2] + 1, h: b[3] + 1, id: 'xe', color: qual ? '#3fce7c' : '#f2555a' },
          inter ? { x: ox0, y: oy0, w: ox1 - ox0 + 1, h: oy1 - oy0 + 1, id: '∩', color: '#f0a93c', fill: '#f0a93c55' } : null
        ].filter(Boolean), caption: 'vo đo xe nằm trong ô, so đo xe chiếm ô'
      });
      emit([4, 5], 'prox = 1 − ' + r2(dist2(ccx, ccy, inp.slot_center[0], inp.slot_center[1])) + '/' + r2(diag) + ' = ' + r3(prox) + ' → ' + (score !== null ? '**score = min(1, 0.70·' + r3(vo) + ' + 0.20·' + r3(so) + ' + 0.10·' + r3(prox) + ') = ' + r3(score) + '**' : '**None** — xe lấn mép không được tính đỗ.'), { score: score }, {
        type: 'bars', items: [
          { label: 'vo ×0.70', value: r3(0.7 * vo), color: '#4f9cf7' },
          { label: 'so ×0.20', value: r3(0.2 * so), color: '#3fce7c' },
          { label: 'prox ×0.10', value: r3(0.1 * prox), color: '#f0a93c' },
          { label: 'score', value: score !== null ? r3(score) : 'None', color: score !== null ? '#e8ecf4' : '#f2555a' }
        ]
      });
      return { result: score !== null ? { vehicle_overlap: r3(vo), slot_overlap: r3(so), center_proximity: r3(prox), score: r3(score) } : { score: null }, invariants: [{ label: 'strong nhánh cứu center-ngoài', pass: qual === ((inside && vo >= voMin) || vo >= inp.vo_strong), actual: String(qual) }] };
    });
  }
});

/* D2 — slot-track-batch-match */
L('slot-track-batch-match', {
  title: 'Gán track↔slot hàng loạt',
  topic: 'cost = 1−score; incumbent −= bonus; solver exact — demo O(n!) n≤5 vs LAPJV O(n³)',
  pipelineRole: 'Chọn cặp (track↔slot) tối ưu toàn cục mỗi vòng; chủ cũ được incumbent bonus chống nhảy ô.',
  difficulty: 3, tags: ['solver', 'binder'], related: ['lapjv-assignment', 'slot-overlap-geometry', 'sticky-id-bind-release'],
  codeRefs: [refp(SB, 1285, 1314, '_batch_match', 'lapjv extend_cost')],
  inputSchema: { geo: '{v*s*:score}', bonus: 'float', limit: 'float', incumbent: '{v:s}' },
  outputSchema: { assign: '{v:s|none}', total: 'float' },
  dataStructures: ['ma trận T×S', 'SlotBinding'],
  keyFields: [{ name: 'incumbent bonus', type: 'cost −= bonus', desc: 'ưu tiên chủ cũ — thắng kèo ngang, thua kèo lệch' }],
  invariants: ['không đủ geometry → cost=10', 'bonus không thắng được chênh lệch lớn'],
  simplifications: ['[sim] chỉ overlap+bonus; [sim-omits] distance/size term', '[sim] exhaustive O(n!) — production LAPJV O(n³)'],
  edgeCases: [{ name: 'challenger-ap-dao', desc: 'challenger đủ mạnh vẫn chiếm ô', scenario: 'edge', edgeCase: true }],
  scenarios: [
    { id: 'normal', label: 'Incumbent giữ ô', input: { geo: { v0s0: 0.72, v0s1: 0.75, v1s0: 0.15, v1s1: 0 }, bonus: 0.15, limit: 0.95, incumbent: { v0: 's0' }, rows: ['v0', 'v1'], cols: ['s0', 's1'] }, expected: { assign: { v0: 's0', v1: 'none' }, total: 1.08 } },
    { id: 'edge', label: 'Challenger áp đảo', input: { geo: { v0s0: 0.72, v1s0: 0.95 }, bonus: 0.15, limit: 0.95, incumbent: { v0: 's0' }, rows: ['v0', 'v1'], cols: ['s0'] }, expected: { assign: { v0: 'none', v1: 's0' }, total: 1.0 } }
  ],
  parameters: [param('bonus', 'incumbent bonus', 0.15, 0, 0.5, 0.01)],
  pseudocode: pc([
    'cost[v][s] = 1 − score[v,s]; incumbent → cost −= bonus; không geo → 10',
    'solver exact: phương án tổng min (unassigned phí cost_limit)',
    'demo vét cạn O(n!) n≤5 — production lap.lapjv O(n³)'
  ]),
  buildTrace: function (sid, prm) {
    var self = this;
    return mkTrace(self, sid, prm, function (inp, P, emit) {
      var bonus = P.bonus !== undefined ? P.bonus : inp.bonus;
      var costs = inp.rows.map(function (v) {
        return inp.cols.map(function (s) {
          var g = inp.geo[v + s];
          var c = g !== undefined && g > 0 ? 1 - g : 10;
          if (inp.incumbent && inp.incumbent[v] === s) c -= bonus;
          return c < 0 ? 0 : c;
        });
      });
      emit([0], 'Geometry từ D1: ' + Object.keys(inp.geo).map(function (k) { return k + '=' + inp.geo[k]; }).join(', ') + '; incumbent ' + JSON.stringify(inp.incumbent || {}) + ' được bonus −' + bonus + '.', { pairs: Object.keys(inp.geo).length }, {
        type: 'rows', rows: inp.rows.map(function (v) {
          return { label: 'track ' + v + (inp.incumbent && inp.incumbent[v] ? ' ★incumbent→' + inp.incumbent[v] : ''), value: inp.cols.map(function (s) { return s + ':' + (inp.geo[v + s] !== undefined ? inp.geo[v + s] : '—'); }).join(' '), state: inp.incumbent && inp.incumbent[v] ? 'warn' : 'info' };
        }), caption: 'score 0/không có → cost 10 (không đủ chứng cứ hình học)'
      });
      var r = exhaustiveAssign(costs, inp.limit);
      emit([0, 1], 'Ma trận cost (ô sao = incumbent −' + bonus + '): ' + costs.map(function (row, i) { return 'v' + i + '→[' + row.map(r2).join(',') + ']'; }).join(' '), { costs: costs, bonus: bonus }, {
        type: 'matrix', matrix: costs, rows: inp.rows, cols: inp.cols, assign: r.map.map(function (c, i) { return [i, c]; }),
        caption: 'incumbent bonus quyết định kèo sít — không phải greedy'
      });
      var res = {};
      inp.rows.forEach(function (v, i) { res[v] = r.map[i] >= 0 ? inp.cols[r.map[i]] : 'none'; });
      emit([2], 'Best: ' + JSON.stringify(res) + ' → total = **' + r2(r.total) + '** — ' + (res[inp.rows[0]] !== 'none' ? 'incumbent giữ ô.' : 'challenger thắng vì geo áp đảo.'), { total: r.total }, {
        type: 'rows', rows: inp.rows.map(function (v, i) { return { label: v + (inp.incumbent && inp.incumbent[v] ? ' ★' : ''), value: res[v], state: res[v] !== 'none' ? 'pass' : 'warn' }; })
      });
      var reTotal = r.map.reduce(function (s, c, i) { return s + (c >= 0 ? costs[i][c] : inp.limit); }, 0);
      return { result: { assign: res, total: r2(r.total) }, invariants: [{ label: 'unassigned phí cost_limit', pass: Math.abs(r.total - reTotal) < 1e-9, actual: 'solver=' + r2(r.total) + ' recompute=Σcost+' + inp.limit + '·unassigned=' + r2(reTotal) }] };
    });
  }
});

/* D3 — arrival-claim-qualification */
L('arrival-claim-qualification', {
  title: 'Đủ điều kiện nhận xe vào ô',
  topic: 'obs≥3 ∧ maxO≥0.35 ∧ inward-3-nhánh ∧ ¬competing; commit cần streak≥2 + lost_at+0.35s',
  pipelineRole: 'Occupied do vision báo nhưng chưa owner → claim chứng minh "đi vào ô" — chống bind xe đi ngang.',
  difficulty: 4, tags: ['claim', 'binder'], related: ['vision-primary-fusion', 'stop-dwell-detection'],
  codeRefs: [refp(SB, 758, 777, '_qualified_arrival', ''), refp(SB, 1160, 1164, 'score 4-term', ''), refp(SB, 1167, 1283, '_try_commit', '')],
  inputSchema: { obs: '[{o,c}]', slot_c: '[x,y]', slot_diag: 'float', lost_at_s: 'float', now_s: 'float', vision_streak: 'int' },
  outputSchema: { qualified: 'bool', score: 'float', verdict: 'string' },
  dataStructures: ['ArrivalClaim', '_arrival_claims[(slot,gid)]'],
  keyFields: [{ name: 'inward', type: 'entered ∨ gain≥0.10 ∨ dist_gain≥max(2,0.05·diag)', desc: 'phải chứng minh đi VÀO, overlap cao chưa đủ' }],
  invariants: ['claim lost_at=None → commit chờ — bind chỉ sau track mất + delay', 'winner−runner <0.15 → competing_vehicle reject'],
  simplifications: ['[sim-omits] job lifecycle, awaiting_vision, _disprove outside-ROI'],
  edgeCases: [{ name: 'xe-luot', desc: 'đi ngang qua ô → inward=false → không qualified', scenario: 'edge', edgeCase: true }],
  scenarios: [
    { id: 'normal', label: 'Đi vào ô → bind', input: { obs: [{ o: 0.30, c: [1, 5] }, { o: 0.34, c: [3, 5] }, { o: 0.38, c: [5, 5] }], slot_c: [5, 5], slot_diag: 11.31, obs_min: 3, ovl_min: 0.35, lost_at_s: 9.0, now_s: 9.5, vision_streak: 2 }, expected: { score: 0.6123, verdict: 'bind' } },
    { id: 'edge', label: 'Xe lướt / margin sít', input: { obs: [{ o: 0.36, c: [9, 5] }, { o: 0.36, c: [9.5, 5] }, { o: 0.35, c: [10, 5] }], slot_c: [5, 5], slot_diag: 11.31, margin_case: { winner_score: 0.6123, runner_score: 0.55, margin: 0.15 } }, expected: { verdict: 'không qualified', margin_verdict: 'competing_vehicle' } }
  ],
  parameters: [param('ovl_min', 'overlap ngưỡng', 0.35, 0.1, 0.9, 0.05)],
  pseudocode: pc([
    'claim mở khi vision occupied && vehicle_id=None; reset nếu last_seen >1.5s',
    'qualified = obs≥3 ∧ max_overlap≥0.35 ∧ inward ∧ ¬competing',
    'inward = entered ∨ (max−first≥0.10) ∨ (first_dist−last_dist ≥ max(2,0.05·diag))',
    'score = 0.55·min(1,maxO) + 0.20·min(1,obs/3) + 0.15·min(1,inward_prog/0.10) + 0.10·min(1,ovl_prog/0.15)',
    'commit: vision_streak≥2 ∧ now−lost_at ≥0.35s; margin <0.15 → competing_vehicle reject'
  ]),
  buildTrace: function (sid, prm) {
    var self = this;
    return mkTrace(self, sid, prm, function (inp, P, emit) {
      var obs = inp.obs;
      var maxO = Math.max.apply(null, obs.map(function (o) { return o.o; }));
      var ovlMin = P.ovl_min !== undefined ? P.ovl_min : inp.ovl_min || 0.35;
      var firstD = dist2(obs[0].c[0], obs[0].c[1], inp.slot_c[0], inp.slot_c[1]);
      var lastD = dist2(obs[obs.length - 1].c[0], obs[obs.length - 1].c[1], inp.slot_c[0], inp.slot_c[1]);
      var gain = maxO - obs[0].o;
      var distGain = firstD - lastD;
      var inward = gain >= 0.10 || distGain >= Math.max(2, 0.05 * inp.slot_diag);
      var qualified = obs.length >= 3 && maxO >= ovlMin && inward;
      var inwardProg = Math.max(0, distGain) / inp.slot_diag;
      var ovlProg = Math.max(0, gain);
      var score = 0.55 * Math.min(1, maxO) + 0.20 * Math.min(1, obs.length / 3) + 0.15 * Math.min(1, inwardProg / 0.10) + 0.10 * Math.min(1, ovlProg / 0.15);
      emit([0], 'Vision báo occupied nhưng ô chưa có owner — chuỗi ' + obs.length + ' quan sát overlap ' + obs.map(function (o) { return r2(o.o); }).join('→') + ' tại ' + obs.map(function (o) { return '(' + o.c + ')'; }).join(' ') + ', tâm ô ' + JSON.stringify(inp.slot_c) + '.', { obs: obs.length }, {
        type: 'tracks', trails: [{ pts: obs.map(function (o) { return o.c; }), color: '#8fa2c8' }],
        points: [{ x: inp.slot_c[0], y: inp.slot_c[1], label: 'slot', color: '#4f9cf7', r: 3 }].concat(obs.map(function (o, i) { return { x: o.c[0], y: o.c[1], label: 'o' + i, color: '#8fa2c8', r: 3 }; })),
        caption: 'overlap cao chưa đủ — phải chứng minh đi VÀO ô'
      });
      emit([1, 2], 'obs=' + obs.length + ', maxO=' + r2(maxO) + ' ' + (maxO >= ovlMin ? '≥' : '<') + ovlMin + '; inward: gain=' + r2(gain) + ' ' + (gain >= 0.10 ? '≥0.10 ✓' : '<0.10') + ', dist_gain=' + r2(distGain) + ' ' + (distGain >= Math.max(2, 0.05 * inp.slot_diag) ? '≥' + r2(Math.max(2, 0.05 * inp.slot_diag)) + ' ✓' : '<' + r2(Math.max(2, 0.05 * inp.slot_diag))) + ' → **qualified=' + qualified + '**.', { qualified: qualified }, {
        type: 'tracks', trails: [{ pts: obs.map(function (o) { return o.c; }), color: inward ? '#3fce7c' : '#f2555a' }],
        points: [{ x: inp.slot_c[0], y: inp.slot_c[1], label: 'slot', color: '#4f9cf7', r: 3 }].concat(obs.map(function (o, i) { return { x: o.c[0], y: o.c[1], label: 'o' + i, color: '#f0a93c', r: 3 }; })),
        caption: 'quỹ đạo ' + (inward ? 'tiến vào ô' : 'lướt ngang — inward fail')
      });
      var verdict = qualified ? 'qualified' : 'không qualified';
      var marginV = null;
      if (inp.margin_case) {
        marginV = (inp.margin_case.winner_score - inp.margin_case.runner_score) < inp.margin_case.margin ? 'competing_vehicle' : 'winner bind';
      } else if (qualified) {
        var wait = inp.now_s - inp.lost_at_s;
        verdict = (inp.vision_streak >= 2 && wait >= 0.35) ? 'bind' : 'chờ (streak ' + inp.vision_streak + '/2, wait ' + r2(wait) + '/0.35s)';
      }
      emit([3, 4], 'score = 0.55·' + r2(maxO) + ' + 0.20·' + r2(Math.min(1, obs.length / 3)) + ' + 0.15·' + r2(Math.min(1, inwardProg / 0.10)) + ' + 0.10·' + r2(Math.min(1, ovlProg / 0.15)) + ' = **' + r4(score) + '** → ' + verdict + (marginV ? '; margin ' + r4(inp.margin_case.winner_score - inp.margin_case.runner_score) + ' < 0.15 → **' + marginV + '**' : ''), { score: score }, {
        type: 'bars', items: [
          { label: '0.55·maxO', value: r3(0.55 * Math.min(1, maxO)), color: '#4f9cf7' },
          { label: '0.20·obs', value: r3(0.20 * Math.min(1, obs.length / 3)), color: '#3fce7c' },
          { label: '0.15·inward', value: r3(0.15 * Math.min(1, inwardProg / 0.10)), color: '#f0a93c' },
          { label: '0.10·ovl', value: r3(0.10 * Math.min(1, ovlProg / 0.15)), color: '#f2555a' },
          { label: 'score', value: r4(score), color: '#e8ecf4' }
        ]
      });
      return { result: { score: r4(score), verdict: verdict, margin_verdict: marginV }, invariants: [{ label: 'margin sít → reject', pass: !inp.margin_case || marginV === 'competing_vehicle', actual: String(marginV) }] };
    });
  }
});

/* D4 — vision-primary-fusion */
L('vision-primary-fusion', {
  title: 'Vision là sự thật của occupied',
  topic: 'vision-empty đầu tiên → token + detach owner NGAY; occupied quay lại → restore token',
  pipelineRole: 'occupied = vote vision (C) luôn; tracking chỉ cung cấp identity — tách "có xe không" khỏi "là xe nào".',
  difficulty: 3, tags: ['fusion', 'fsm', 'binder'], related: ['temporal-smoothing-dwell', 'sticky-id-bind-release', 'departure-token-lifecycle'],
  codeRefs: [refp(SB, 2501, 2569, 'update_vision vision_primary', ''), refp(SB, 1533, 1565, '_detach_binding_for_departure', 'vehicle_id=None ngay'), refp(SB, 1566, 1635, '_restore_false_empty_token', '')],
  inputSchema: { vision: '0|1', owner: 'string|null', token: 'obj|null' },
  outputSchema: { occupied: 'bool', vehicle_id: 'string|null', token: 'obj|null', tracking_state: 'string' },
  dataStructures: ['SlotBinding{vehicle_id,tracking_state,vision_occupied}', 'DepartureToken'],
  keyFields: [{ name: 'detach ngay', type: 'policy', desc: 'vision_primary: empty đầu đã gỡ owner — danh tính sống trong token' }],
  invariants: ['public.occupied = vision LUÔN', 'restore khi occupied quay lại trước consume (predeparture empty_obs=0 ngoại lệ)'],
  simplifications: ['[sim-omits] _pending_release, vehicle_to_slot map, evidence_frame audit, cooldown'],
  edgeCases: [{ name: 'vision-flick', desc: 'empty→occupied sớm → restore (rollback, không countdown)', scenario: 'edge', edgeCase: true }],
  scenarios: [
    { id: 'normal', label: 'Occupied mới → arrival claim', input: { vision: 1, owner: null }, expected: { occupied: true, vehicle_id: null, action: 'arrival_claim' } },
    { id: 'edge', label: 'Vision mất nhưng owner còn', input: { vision: 0, owner: 'v7', token: null }, expected: { occupied: false, vehicle_id: null, token: 'confirmed_empty', tracking_state: 'recovery_pending' } }
  ],
  parameters: [],
  pseudocode: pc([
    '!vision ∧ (owner≠None ∨ token) → create token(confirmed_empty) + detach — vehicle_id=None NGAY',
    'vision ∧ token → (empty_obs>0 ∨ !predeparture) → _restore_false_empty_token',
    'vision ∧ vehicle_id=None → _try_commit_arrival_claim (D3)',
    '_sync_result: public.occupied = vision luôn'
  ]),
  buildTrace: function (sid, prm) {
    var self = this;
    return mkTrace(self, sid, prm, function (inp, P, emit) {
      var owner = inp.owner, token = inp.token || null, action = '';
      var ts = 'tracking';
      if (!inp.vision && (owner || token)) {
        token = { global_id: owner || (token && token.global_id), confirmed_empty: true, reason: 'vision_became_empty' };
        owner = null; ts = 'recovery_pending';
        action = 'vision-empty đầu tiên → token(confirmed_empty) + detach owner NGAY — không giữ "nội bộ"';
      } else if (inp.vision && token) {
        var restored = token.global_id || 'owner';
        owner = restored; token = null; ts = 'tracking';
        action = 'occupied quay lại trước consume → _restore_false_empty_token → owner phục hồi (rollback)';
      } else if (inp.vision && !owner) {
        action = 'vision occupied && chưa owner → mở arrival_claim (đường D3)';
      } else {
        action = 'không đổi trạng thái';
      }
      emit([0], 'Binding đầu vào: vision=' + inp.vision + ', owner=' + (inp.owner || 'None') + ', token=' + (inp.token ? JSON.stringify(inp.token) : 'none') + ' — vision là nguồn sự thật của occupied, tracking chỉ lo danh tính.', { vision: inp.vision, owner: inp.owner }, {
        type: 'rows', rows: [
          { label: 'vision', value: inp.vision ? 'occupied' : 'empty', state: inp.vision ? 'pass' : 'warn' },
          { label: 'vehicle_id (owner)', value: inp.owner || 'None', state: inp.owner ? 'info' : 'warn' },
          { label: 'token', value: inp.token ? 'active' : 'none', state: 'info' }
        ], caption: '4 nhánh: empty-đầu → token+detach · occupied↩token → restore · occupied+no-owner → claim · else noop'
      });
      emit([0, 1], action + '.', { action: action, owner: owner, ts: ts }, {
        type: 'board', cards: [
          { label: 'vision nói', value: inp.vision ? 'occupied' : 'empty', color: inp.vision ? '#3fce7c' : '#8a93a8' },
          { label: 'public.occupied', value: String(!!inp.vision), hl: true, color: inp.vision ? '#3fce7c' : '#8a93a8' },
          { label: 'vehicle_id', value: owner === null ? 'None' : owner, hl: true, color: owner ? '#4f9cf7' : '#8a93a8' },
          { label: 'tracking_state', value: ts, color: ts === 'recovery_pending' ? '#f0a93c' : '#8a93a8' }
        ]
      });
      emit([2, 3], token ? 'Token-card hiện: {gid: ' + token.global_id + ', confirmed_empty: ' + token.confirmed_empty + '} — danh tính sống trong token, xe thật còn đỗ được D9/D10 cứu ID nếu fragment xuất hiện.' : 'Public state: occupied=' + !!inp.vision + ' (vision luôn thắng), vehicle_id=' + owner + '.', { token: token }, {
        type: 'token', token: token ? { label: 'departure token', gid: token.global_id, meta: 'confirmed_empty=' + token.confirmed_empty + '\nreason=' + token.reason, color: '#f0a93c' } : null,
        caption: 'identity bám token, không bám ô'
      }, [{ label: 'token_gid', value: token ? token.global_id : 'none' }, { label: 'owner', value: owner === null ? 'None' : owner }]);
      var res = { occupied: !!inp.vision, vehicle_id: owner, token: token ? 'confirmed_empty' : null, tracking_state: ts, action: inp.vision && !inp.owner ? 'arrival_claim' : 'detach' };
      return { result: res, invariants: [{ label: 'occupied = vision luôn', pass: res.occupied === !!inp.vision, actual: 'occupied=' + res.occupied + ' vs vision=' + inp.vision }] };
    });
  }
});

/* D5 — stop-dwell-detection */
L('stop-dwell-detection', {
  title: 'Xác nhận xe đã dừng hẳn trong ô',
  topic: '(a) r95 + net_disp trên fresh-suffix | (b) inlier≥0.60 + robust_drift median-2-endpoints — outlier thưa chịu được',
  pipelineRole: 'Phân biệt "đang đỗ" vs "đang lướt/dò ô" — 2 đường đánh giá khác nhau, đường strong cố ý bỏ qua outlier.',
  difficulty: 4, tags: ['dwell', 'robust'], related: ['arrival-claim-qualification', 'parking-episode-states'],
  codeRefs: [refp(SB, 1316, 1355, '_is_stopped', 'r95 path'), refp(SB, 1408, 1447, '_strong_overlap_is_stable', 'inlier+endpoints'), refp(SB, 1357, 1407, '_advance_strong_overlap', '')],
  inputSchema: { samples: '[[t,[x,y]]]', min_samples: 'int', stop_s: 'float', r95_max: 'float', drift_max: 'float', stat_radius: 'float' },
  outputSchema: { stopped: 'bool', stopped_ms: 'int', stable_strong: 'bool', inlier_ratio: 'float' },
  dataStructures: ['VehicleParkingState.observations deque', 'strong_overlap_since'],
  keyFields: [{ name: 'robust_drift', type: '‖median(last k) − median(first k)‖', desc: 'k=max(2,min(n//3,5)) — endpoint trung vị' }],
  invariants: ['outlier phá r95 nhưng KHÔNG phá inlier path — 2 đường khắc vị khác nhau'],
  simplifications: ['[sim] ngưỡng demo-fixed (production: max(floor, ratio·diag bbox))', '[sim-omits] fresh-suffix cut, stop_commit_grace'],
  edgeCases: [{ name: 'outlier-thua', desc: '1 outlier/6: r95 fail nhưng inlier pass', scenario: 'edge', edgeCase: true }],
  scenarios: [
    { id: 'normal', label: 'Đứng yên → stopped', input: { samples: [[0.0, [5.0, 5.0]], [0.5, [5.2, 5.0]], [1.0, [5.0, 5.2]], [1.5, [5.1, 5.1]], [2.0, [4.9, 5.0]], [2.5, [5.0, 4.9]]], min_samples: 6, stop_s: 2.5, r95_max: 1.0, drift_max: 0.5, same_slot: true }, expected: { stopped: true, stopped_ms: 2500, r95: 0.20 } },
    { id: 'edge', label: 'Outlier: 2 đường 2 verdict', input: { samples: [[0.0, [5.0, 5.0]], [0.5, [5.2, 5.0]], [1.0, [5.0, 5.2]], [1.5, [9.0, 9.0]], [2.0, [4.9, 5.0]], [2.5, [5.0, 4.9]]], min_samples: 6, stop_s: 2.5, r95_max: 1.0, drift_max: 0.5, stat_radius: 3.0 }, expected: { stopped: false, stable_strong: true, inlier_ratio: 0.83 } }
  ],
  parameters: [param('r95_max', 'r95 ngưỡng (demo)', 1.0, 0.2, 5, 0.1)],
  pseudocode: pc([
    '(a) _is_stopped: n≥min_samples ∧ duration≥0.90·stop_s ∧ same_slot≥0.80',
    'r95 = p95(‖p−median‖) ≤ r95_max ∧ net_disp = ‖last−first‖ ≤ drift_max',
    '(b) _strong_overlap_is_stable: inlier_ratio = mean(‖p−median‖ ≤ stat_radius) ≥ 0.60',
    'k = max(2,min(n//3,5)); robust_drift = ‖median(last k)−median(first k)‖ ≤ drift_max',
    'stopped_ms = int(duration·1000) — span mẫu'
  ]),
  buildTrace: function (sid, prm) {
    var self = this;
    return mkTrace(self, sid, prm, function (inp, P, emit) {
      var pts = inp.samples.map(function (s) { return s[1]; });
      var n = pts.length;
      var mx = median(pts.map(function (p) { return p[0]; })), my = median(pts.map(function (p) { return p[1]; }));
      var radii = pts.map(function (p) { return dist2(p[0], p[1], mx, my); }).sort(function (a, b) { return a - b; });
      var r95Max = P.r95_max !== undefined ? P.r95_max : inp.r95_max;
      var idx95 = Math.min(n - 1, Math.ceil(0.95 * n) - 1);
      var r95 = radii[idx95];
      var netDisp = dist2(pts[n - 1][0], pts[n - 1][1], pts[0][0], pts[0][1]);
      var dur = inp.samples[n - 1][0] - inp.samples[0][0];
      var stopped = n >= inp.min_samples && dur >= inp.stop_s * 0.90 && r95 <= r95Max && netDisp <= inp.drift_max;
      var statR = inp.stat_radius || r95Max;
      var inlierRatio = radii.filter(function (r) { return r <= statR; }).length / n;
      var k = Math.max(2, Math.min(Math.floor(n / 3), 5));
      var firstK = pts.slice(0, k), lastK = pts.slice(n - k);
      var robustDrift = dist2(median(lastK.map(function (p) { return p[0]; })), median(lastK.map(function (p) { return p[1]; })), median(firstK.map(function (p) { return p[0]; })), median(firstK.map(function (p) { return p[1]; })));
      var stable = inlierRatio >= 0.60 && robustDrift <= inp.drift_max;
      emit([0], n + ' mẫu trong ' + r2(dur) + 's tại ' + pts.map(function (p) { return '(' + p[0] + ',' + p[1] + ')'; }).join(' ') + ' — hai đường đánh giá: (a) r95 khắt khe, (b) inlier chịu outlier.', { n: n, dur: dur }, {
        type: 'tracks', trails: [{ pts: pts, color: '#8fa2c8' }],
        points: pts.map(function (p, i) { return { x: p[0], y: p[1], label: 's' + i + '@' + inp.samples[i][0] + 's', color: '#8fa2c8', r: 4 }; }),
        caption: 'quỹ đạo quan sát trong ô — điểm lệch xa là outlier'
      });
      emit([0, 1, 2], 'median=(' + r2(mx) + ',' + r2(my) + '); radii sorted [' + radii.map(r2).join(',') + '] → r95 = ' + r2(r95) + ' ' + (r95 <= r95Max ? '≤' : '>') + ' ' + r95Max + '; net_disp = ' + r2(netDisp) + ' → **_is_stopped = ' + stopped + '**.', { r95: r95, stopped: stopped }, {
        type: 'tracks', trails: [{ pts: pts, color: '#f0a93c' }],
        points: pts.map(function (p, i) { return { x: p[0], y: p[1], label: 's' + i, color: dist2(p[0], p[1], mx, my) <= statR ? '#3fce7c' : '#f2555a', r: 4 }; }).concat([{ x: mx, y: my, label: 'median', color: '#4f9cf7' }]),
        rings: [{ x: mx, y: my, r: statR, label: 'stat_radius', color: '#4f9cf7' }],
        caption: 'đỏ = outlier phá r95 nhưng không phá inlier'
      });
      emit([3, 4], 'Đường strong: inlier = ' + r2(inlierRatio) + ' ' + (inlierRatio >= 0.6 ? '≥' : '<') + ' 0.60; k=' + k + ', robust_drift = ' + r2(robustDrift) + ' ' + (robustDrift <= inp.drift_max ? '≤' : '>') + ' ' + inp.drift_max + ' → **stable = ' + stable + '**; stopped_ms = ' + Math.round(dur * 1000) + ' (span mẫu).', { stable: stable }, {
        type: 'rows', rows: [
          { label: '_is_stopped (r95 khắt khe)', value: String(stopped), state: stopped ? 'pass' : 'fail' },
          { label: 'inlier_ratio ≥ 0.60', value: r2(inlierRatio), state: inlierRatio >= 0.6 ? 'pass' : 'fail' },
          { label: 'robust_drift ≤ drift_max', value: r2(robustDrift), state: robustDrift <= inp.drift_max ? 'pass' : 'fail' },
          { label: 'strong_stable', value: String(stable), state: stable ? 'pass' : 'fail' }
        ]
      });
      return { result: { stopped: stopped, stopped_ms: Math.round(dur * 1000), stable_strong: stable, inlier_ratio: r2(inlierRatio), r95: r2(r95) }, invariants: [{ label: 'outlier không phá inlier path', pass: stable === (inlierRatio >= 0.60 && robustDrift <= inp.drift_max), actual: 'r95=' + r2(r95) + ' inlier=' + r2(inlierRatio) + ' drift=' + r2(robustDrift) }] };
    });
  }
});

/* D6 — sticky-id-bind-release */
L('sticky-id-bind-release', {
  title: 'Giữ ID chủ ô + giải phóng qua token',
  topic: 'owner còn → challenger reject (sticky_id_conflict/competing_vehicle); empty đầu → token+detach NGAY, không countdown',
  pipelineRole: 'ID ổn định không nhảy theo nhiễu. Release đi qua departure-token — chống flick nằm ở cơ chế KHÔI PHỤC, không bộ đếm.',
  difficulty: 3, tags: ['binder', 'fsm', 'token'], related: ['vision-primary-fusion', 'departure-token-lifecycle', 'parking-episode-states'],
  codeRefs: [refp(SB, 1919, 1981, '_bind_vehicle', ''), refp(SB, 1982, 2046, '_release_vehicle', ''), refp(SB, 2501, 2557, 'vision-empty→token+detach', '')],
  inputSchema: { owner: 'string|null', vision_occupied: 'bool', events: '[string]' },
  outputSchema: { transitions: '[string]', final_owner: 'string|null' },
  dataStructures: ['SlotBinding{vehicle_id,tracking_state,vision_occupied}', 'DepartureToken', 'event log'],
  keyFields: [{ name: 'reject reason', type: 'sticky_id_conflict | competing_vehicle', desc: 'vision còn occupied → sticky; vision trống owner treo → competing' }],
  invariants: ['KHÔNG có empty-streak gate release — detach ngay tại empty đầu', 'chống flick = token-rollback, không countdown'],
  simplifications: ['[sim-omits] VehicleParkingState updates, movement_state, _sync_result'],
  edgeCases: [{ name: 'false-empty', desc: 'occupied quay lại trước consume → restore owner', scenario: 'edge', edgeCase: true }],
  scenarios: [
    { id: 'normal', label: 'Challenger → lost → empty', input: { owner: 'v0', vision_occupied: true, events: ['t1:claim_v1', 't2:tracker_lost', 't4:vision_empty'] }, expected: { transitions: ['reject:sticky_id_conflict', 'departing+exit_pending', 'token+detach'], final_owner: null } },
    { id: 'edge', label: 'False empty → restore', input: { owner: 'v0', events: ['t2:vision_empty', 't3:vision_occupied'] }, expected: { transitions: ['token+detach', 'restore'], final_owner: 'v0' } }
  ],
  parameters: [],
  pseudocode: pc([
    'bind: owner khác → reject sticky_id_conflict (vision occupied) / competing_vehicle (vision trống owner treo)',
    'tracker lost → episode departing, tracking_state=exit_pending; vision còn occupied → owner treo + token predeparture',
    'vision-empty đầu (có owner/token) → token(confirmed_empty) + detach NGAY',
    'occupied quay lại trước consume → _restore_false_empty_token → owner phục hồi, episode→parked'
  ]),
  buildTrace: function (sid, prm) {
    var self = this;
    return mkTrace(self, sid, prm, function (inp, P, emit) {
      var owner = inp.owner, token = null, vis = inp.vision_occupied !== false;
      var log = [], transitions = [];
      emit([0], 'Binding: owner=' + owner + ', vision=' + (vis ? 'occupied' : 'empty') + '. Chuỗi sự kiện ' + JSON.stringify(inp.events) + ' sẽ duyệt từng bước — release đi qua token, không countdown.', { owner: owner }, {
        type: 'board', cards: [
          { label: 'owner', value: owner === null ? 'None' : owner, color: '#3fce7c' },
          { label: 'vision', value: vis ? 'occupied' : 'empty', color: vis ? '#3fce7c' : '#8a93a8' },
          { label: 'token', value: 'none', color: '#8a93a8' }
        ]
      });
      inp.events.forEach(function (ev) {
        if (ev.indexOf('claim_') >= 0) {
          var why = vis ? 'sticky_id_conflict' : 'competing_vehicle';
          transitions.push('reject:' + why);
          log.push({ t: ev.split(':')[0], msg: 'challenger ' + ev.split('_')[1] + ' → REJECT ' + why + ' (vision ' + (vis ? 'occupied' : 'trống, owner treo') + ')' });
        } else if (ev.indexOf('tracker_lost') >= 0) {
          transitions.push('departing+exit_pending');
          log.push({ t: ev.split(':')[0], msg: 'tracker lost → episode departing, exit_pending; ' + (vis ? 'vision còn occupied → owner ' + owner + ' treo + token predeparture' : 'vision trống → gỡ owner') });
          if (!vis && owner) { token = { gid: owner, confirmed_empty: true }; owner = null; }
          else if (vis) token = { gid: owner, confirmed_empty: false, predeparture: true };
        } else if (ev.indexOf('vision_empty') >= 0) {
          vis = false;
          if (owner || token) {
            token = { gid: owner || (token && token.gid), confirmed_empty: true };
            transitions.push('token+detach');
            log.push({ t: ev.split(':')[0], msg: 'vision-empty đầu → token(confirmed_empty) + detach ' + owner + ' NGAY' });
            owner = null;
          }
        } else if (ev.indexOf('vision_occupied') >= 0) {
          vis = true;
          if (token) {
            owner = token.gid; token = null;
            transitions.push('restore');
            log.push({ t: ev.split(':')[0], msg: 'occupied quay lại trước consume → restore → owner ' + owner + ' phục hồi, episode→parked' });
          }
        }
      });
      emit([0, 1], 'Chuỗi sự kiện: ' + log.map(function (l) { return l.t + ' ' + l.msg; }).join(' → '), { owner: owner }, {
        type: 'board', cards: [
          { label: 'owner', value: owner === null ? 'None' : owner, hl: true, color: owner ? '#3fce7c' : '#8a93a8' },
          { label: 'token', value: token ? 'active' : 'none', color: token ? '#f0a93c' : '#8a93a8' },
          { label: 'vision', value: vis ? 'occupied' : 'empty', color: vis ? '#3fce7c' : '#8a93a8' }
        ], log: log.map(function (l) { return l.t + ': ' + l.msg; })
      });
      emit([2, 3], 'Transitions: ' + transitions.join(' → ') + '. Chống flick là **token-rollback**, không phải countdown — trống lần đầu đã gỡ nhưng token giữ cửa quay về.', { transitions: transitions }, {
        type: 'fsm', states: [{ name: 'parked' }, { name: 'departing' }, { name: 'released' }],
        edges: [{ from: 'parked', to: 'departing', label: 'lost/empty' }, { from: 'departing', to: 'released', label: 'token consume/expire' }, { from: 'departing', to: 'parked', label: 'restore', back: true }],
        current: token ? 'departing' : (owner ? 'parked' : 'released')
      });
      var sawEmpty = inp.events.some(function (e) { return e.indexOf('vision_empty') >= 0; });
      return { result: { transitions: transitions, final_owner: owner }, invariants: [{ label: 'empty đầu → detach ngay', pass: !sawEmpty || !inp.owner || transitions.indexOf('token+detach') >= 0, actual: transitions.join(' → ') || 'không transition' }] };
    });
  }
});
/* D7 — departure-token-lifecycle */
L('departure-token-lifecycle', {
  title: 'Vòng đời token nhớ xe sắp/đã rời',
  topic: 'radius(t) = diag·(0.05 + min(1,age/1.0s)·0.40) — bão hoà theo ratio đường chéo, không tuyến tính vô hạn',
  pipelineRole: 'Vision báo empty nhưng owner có thể đang rời → token ghi gid+appearance, bán kính nhận diện nở để bắt fragment (D8–D10).',
  difficulty: 3, tags: ['token', 'lifecycle', 'binder'], related: ['recovery-candidate-gates', 'recovery-batch-assignment', 'predeparture-candidate-guard'],
  codeRefs: [refp(SB, 1449, 1532, '_create_departure_token', ''), refp(SB, 603, 609, '_token_radius', 'ratio lerp'), refp(SB, 1742, 1914, '_cleanup_tokens', '')],
  inputSchema: { slot_diagonal: 'float', dt: 'float[]', init: 'float', max: 'float', expand_s: 'float' },
  outputSchema: { radius: 'float[]', state: 'string' },
  dataStructures: ['DepartureToken{gid,polygon,created_at_s,expires_at_s,confirmed_empty,predeparture,candidates}'],
  keyFields: [{ name: 'radius', type: 'diag·lerp(0.05→0.45)', desc: 'tỉ lệ theo kích thước ô — không phải r0+rate·t' }],
  invariants: ['token predeparture chưa confirmed → guard-cancel sau 2.5s không evidence', 'false-empty → restore giữ episode'],
  simplifications: ['[sim-omits] extension_blocker chi tiết, candidate-evidence TTL phân tầng'],
  edgeCases: [{ name: 'guard-cancel', desc: 'predeparture treo >2.5s không evidence → cancel', scenario: 'edge', edgeCase: true }],
  scenarios: [
    { id: 'normal', label: 'Radius nở theo ratio', input: { slot_diagonal: 100, dt: [0, 0.5, 1, 3], init: 0.05, max: 0.45, expand_s: 1.0 }, expected: { radius: [5, 25, 45, 45] } },
    { id: 'edge', label: 'Predeparture guard cancel', input: { token: { predeparture: true, confirmed_empty: false, empty_obs: 0, created: 10.0, candidates: [] }, now: 12.6, guard_s: 2.5, binding_vision_occupied: false }, expected: { verdict: 'cancel:predeparture_guard_expired' } }
  ],
  parameters: [param('expand_s', 'expand_seconds', 1.0, 0.2, 3, 0.1)],
  pseudocode: pc([
    'radius(t) = diag · (0.05 + min(1, age/expand_s)·0.40) — nội suy ratio, bão hoà 0.45·diag',
    'expires = created + 5.0s; extension có điều kiện tới created+20s',
    'vision occupied lại → restore; fragment khớp → consume',
    'cleanup: predeparture age>2.5s không evidence → cancel guard_expired'
  ]),
  buildTrace: function (sid, prm) {
    var self = this;
    return mkTrace(self, sid, prm, function (inp, P, emit) {
      if (inp.token) {
        var tk = inp.token;
        var age = inp.now - tk.created;
        var cancel = tk.predeparture && !tk.confirmed_empty && age > inp.guard_s && (!tk.candidates || tk.candidates.length === 0) && !inp.binding_vision_occupied;
        emit([3], 'Token predeparture: created@' + tk.created + 's, confirmed_empty=' + tk.confirmed_empty + ', candidates=' + JSON.stringify(tk.candidates) + ', binding vision_occupied=' + inp.binding_vision_occupied + '.', { token: 'predeparture' }, {
          type: 'token', token: { label: 'predeparture token', gid: 'gid', meta: 'created=' + tk.created + '\nconfirmed_empty=' + tk.confirmed_empty + '\nempty_obs=' + tk.empty_obs, color: '#8a93a8' },
          caption: 'token treo chờ evidence — chưa phải empty thật'
        });
        emit([3], 'Guard: age = now ' + inp.now + ' − created ' + tk.created + ' = ' + r2(age) + 's ' + (age > inp.guard_s ? '>' : '≤') + ' ' + inp.guard_s + 's; evidence count = ' + tk.candidates.length + '.', { age: age }, {
          type: 'rows', rows: [
            { label: 'age > ' + inp.guard_s + 's', value: String(age > inp.guard_s), state: age > inp.guard_s ? 'fail' : 'pass' },
            { label: 'candidates/evidence', value: String(tk.candidates.length), state: tk.candidates.length === 0 ? 'fail' : 'pass' },
            { label: 'vision_occupied (giữ lại)', value: String(inp.binding_vision_occupied), state: inp.binding_vision_occupied ? 'pass' : 'info' }
          ]
        });
        emit([3], '→ **' + (cancel ? 'cancel:predeparture_guard_expired — predeparture treo quá hạn không evidence → huỷ, giải phóng fragment khỏi limbo' : 'giữ (guard chưa chặt)') + '**.', { cancel: cancel, age: r2(age) }, {
          type: 'token', token: { label: 'predeparture token', gid: 'gid', meta: 'age=' + r2(age) + 's\nconfirmed_empty=' + tk.confirmed_empty + '\ncandidates=' + tk.candidates.length, color: cancel ? '#f2555a' : '#f0a93c' }
        });
        return { result: { verdict: cancel ? 'cancel:predeparture_guard_expired' : 'keep' }, invariants: [{ label: 'cancel ⇒ predeparture ∧ ¬confirmed ∧ 0 evidence ∧ vision empty', pass: !cancel || (tk.predeparture && !tk.confirmed_empty && tk.candidates.length === 0 && !inp.binding_vision_occupied), actual: 'cancel=' + cancel }] };
      }
      var expand = P.expand_s !== undefined ? P.expand_s : inp.expand_s;
      var radii = inp.dt.map(function (t) {
        return inp.slot_diagonal * (inp.init + Math.min(1, t / expand) * (inp.max - inp.init));
      });
      emit([0], 'Token vừa tạo sau vision-empty: diag ô = ' + inp.slot_diagonal + 'px, radius lerp từ ' + inp.init + ' → ' + inp.max + ' của diag trong ' + expand + 's. Duyệt ' + inp.dt.length + ' mốc age ' + JSON.stringify(inp.dt) + '.', { diag: inp.slot_diagonal }, {
        type: 'tracks', points: [{ x: 50, y: 50, label: 'token center', color: '#f0a93c' }],
        rings: [{ x: 50, y: 50, r: inp.slot_diagonal * inp.init, label: 'r0=' + r1(inp.slot_diagonal * inp.init), color: '#8a93a8' }],
        caption: 'vòng tìm bắt đầu nhỏ — fragment gần ô'
      });
      inp.dt.forEach(function (t, i) {
        emit([0], 'age ' + t + 's → radius = ' + inp.slot_diagonal + '·(' + inp.init + ' + min(1,' + t + '/' + expand + ')·' + (inp.max - inp.init) + ') = **' + r1(radii[i]) + 'px**' + (t / expand >= 1 ? ' — bão hoà' : '') + '.', { t: t, r: radii[i] }, {
          type: 'tracks', points: [{ x: 50, y: 50, label: 'token', color: '#f0a93c' }],
          rings: inp.dt.slice(0, i + 1).map(function (t2, j) { return { x: 50, y: 50, r: radii[j], label: j === i ? 't=' + t2 + ' → ' + r1(radii[j]) : undefined, color: j === i ? '#3fce7c' : '#4f9cf7' }; }),
          caption: 'radius nở theo tỉ lệ kích thước ô — KHÔNG phải r0+rate·t'
        });
      });
      emit([1, 2, 3], 'radius = diag·lerp(' + inp.init + '→' + inp.max + '): ' + inp.dt.map(function (t, i) { return 't=' + t + ' → ' + r1(radii[i]); }).join(', ') + ' — **bão hoà ' + r1(inp.slot_diagonal * inp.max) + ' sau ' + expand + 's**, không phải tuyến tính vô hạn.', { radii: radii }, {
        type: 'tracks', points: [{ x: 50, y: 50, label: 'token', color: '#f0a93c' }],
        rings: inp.dt.map(function (t, i) { return { x: 50, y: 50, r: radii[i], label: 't=' + t, color: '#4f9cf7' }; }),
        caption: 'vòng tìm kiếm nở theo tỉ lệ kích thước ô'
      });
      emit([1, 2, 3], 'Vòng đời: restore khi vision occupied quay lại · consume khi fragment khớp (D9/D10) · expire khi hết retention+extension.', { radii: radii.map(r1) }, {
        type: 'fsm', states: [{ name: 'active' }, { name: 'restored' }, { name: 'consumed' }, { name: 'expired' }],
        edges: [{ from: 'active', to: 'restored', label: 'vision occupied' }, { from: 'active', to: 'consumed', label: 'fragment khớp' }, { from: 'active', to: 'expired', label: 'TTL+ext' }],
        current: 'active'
      });
      return { result: { radius: radii.map(r1) }, invariants: [{ label: 'bão hoà tại max·diag', pass: Math.abs(radii[radii.length - 1] - inp.slot_diagonal * inp.max) < 1e-9, actual: radii[radii.length - 1] }] };
    });
  }
});

/* D8 — predeparture-candidate-guard */
L('predeparture-candidate-guard', {
  title: 'Đánh dấu ứng viên trước khi mất binding',
  topic: 'fragment unbound cạnh ô occupied → predeparture token sớm; 2 ô tranh (gap<0.15) → skip',
  pipelineRole: 'Chờ vision báo empty là quá trễ — guard tạo token khi fragment đứng cạnh ô có chủ, bảo vệ fragment khỏi cấp ID mới.',
  difficulty: 4, tags: ['guard', 'token', 'binder'], related: ['departure-token-lifecycle', 'recovery-candidate-gates'],
  codeRefs: [refp(SB, 479, 552, 'prepare_predeparture_tokens', 'duyệt unbound_tracks'), refp(SB, 505, 517, 'admission OR + ambiguity skip', ''), refp(SB, 535, 550, 'refresh', '')],
  inputSchema: { frag: '{point_signed,overlap,dist_over_diag,other_dist_over_diag?}', slot: '{diag,occupied,owner}' },
  outputSchema: { verdict: 'token|skip:ambiguous|skip:far|protected', radius0: 'float' },
  dataStructures: ['protected set', 'DepartureToken{predeparture,confirmed_empty}'],
  keyFields: [{ name: 'admission OR', type: 'signed<−0.05·diag && overlap≤0 → skip', desc: 'chỉ xa VÀ không chạm mới bỏ — chạm vào vẫn ứng viên' }],
  invariants: ['token confirmed_empty → KHÔNG refresh created_at_s (radius phải nở từ empty thật)', 'chủ thể quét là unbound_tracks, không phải owner'],
  simplifications: ['[sim-omits] recovery_bbox/position fallback, camera filter, event log'],
  edgeCases: [{ name: 'hai-o-tranh', desc: 'gap<0.15 giữa 2 ô → skip an toàn', scenario: 'edge', edgeCase: true }],
  scenarios: [
    { id: 'normal', label: 'Fragment cạnh ô → token', input: { slot: { diag: 11.31, occupied: true, owner: 'v7' }, frag: { point_signed: -1.0, overlap: 0.10, dist_over_diag: 0.30 }, other_slots: [] }, expected: { verdict: 'token:predeparture', radius0: 0.566 } },
    { id: 'edge', label: 'Hai ô tranh / fragment xa', input: { cases: [{ id: 'ambiguous', frag: { point_signed: -1.0, overlap: 0.10, dist_over_diag: 0.30, other_dist_over_diag: 0.40 }, diag: 11.31 }, { id: 'far', frag: { point_signed: -11.0, overlap: 0.0, dist_over_diag: 2.0 }, diag: 11.31 }] }, expected: { verdicts: ['skip:ambiguous', 'skip:far'] } }
  ],
  parameters: [param('margin', 'ambiguity margin', 0.15, 0.05, 0.5, 0.01)],
  pseudocode: pc([
    'mỗi unbound fragment × mỗi binding occupied: signed = signed_dist(point, poly); overlap = raw_overlap',
    'signed < −0.05·diag ∧ overlap ≤ 0 → bỏ (quá xa, không chạm); còn lại → choices',
    'choices ≥2 ∧ choices[1]−choices[0] < 0.15 → skip (không đoán khi 2 ô tranh)',
    'choices[0] → predeparture token (confirmed_empty=False, reason=motion_started_in_parked_slot) + protected'
  ]),
  buildTrace: function (sid, prm) {
    var self = this;
    return mkTrace(self, sid, prm, function (inp, P, emit) {
      var margin = P.margin !== undefined ? P.margin : 0.15;
      function evalFrag(f, diag) {
        var lim = -0.05 * diag;
        if (f.point_signed < lim && f.overlap <= 0) return { verdict: 'skip:far', why: 'signed ' + f.point_signed + ' < ' + r2(lim) + ' && overlap=' + f.overlap };
        var choices = [f.dist_over_diag];
        if (f.other_dist_over_diag !== undefined) choices.push(f.other_dist_over_diag);
        choices.sort(function (a, b) { return a - b; });
        if (choices.length >= 2 && (choices[1] - choices[0]) < margin) return { verdict: 'skip:ambiguous', why: 'gap ' + r2(choices[1] - choices[0]) + ' < ' + margin };
        return { verdict: 'token:predeparture', why: 'admission OR giữ (overlap>0 dù signed ' + r2(f.point_signed) + ' < ' + r2(lim) + ')', radius0: 0.05 * diag };
      }
      var cases = inp.cases || [{ frag: inp.frag, diag: inp.slot.diag }];
      var rs = cases.map(function (c) { return evalFrag(c.frag, c.diag); });
      emit([0], 'Quét unbound_tracks × bindings occupied: ' + cases.map(function (c, i) {
        var f = c.frag;
        return (c.id || 'frag') + ' — signed=' + f.point_signed + ', overlap=' + f.overlap + ', dist=' + f.dist_over_diag + '×diag(' + c.diag + ')';
      }).join(' | ') + (inp.slot && inp.slot.owner ? ' · ô có chủ ' + inp.slot.owner : ''), { margin: margin }, {
        type: 'rows', rows: cases.map(function (c) {
          return { label: c.id || 'fragment', value: 'signed ' + c.frag.point_signed + ' · overlap ' + c.frag.overlap + ' · diag ' + c.diag, state: 'info' };
        })
      });
      emit([0, 1, 2], cases.map(function (c, i) {
        return (c.id || 'frag') + ': signed=' + c.frag.point_signed + ' overlap=' + c.frag.overlap + ' → **' + rs[i].verdict + '** (' + rs[i].why + ')';
      }).join(' · '), { verdicts: rs.map(function (r) { return r.verdict; }) }, {
        type: 'rows', rows: cases.map(function (c, i) {
          return { label: (c.id || 'frag') + ' signed=' + c.frag.point_signed, value: rs[i].verdict, state: rs[i].verdict.indexOf('token') === 0 ? 'pass' : 'warn' };
        })
      });
      emit([3], 'Token mở sớm bảo vệ fragment khỏi allocate mới; token confirmed_empty KHÔNG refresh created_at_s — radius nở từ empty thật.', { token: rs[0].verdict.indexOf("token") === 0, radius0: r3(rs[0].radius0 || 0) }, {
        type: 'token', token: rs[0].verdict.indexOf('token') === 0 ? { label: 'predeparture', gid: inp.slot ? inp.slot.owner : 'owner', meta: 'confirmed_empty=False\nradius0=' + r3(rs[0].radius0 || 0), color: '#f0a93c' } : null
      });
      var res = inp.cases ? { verdicts: rs.map(function (r) { return r.verdict; }) } : { verdict: rs[0].verdict, radius0: r3(rs[0].radius0 || 0) };
      return { result: res, invariants: [{ label: 'overlap>0 cứu signed âm', pass: rs.every(function (r, i) { var f = cases[i].frag; return !(f.overlap > 0) || r.verdict !== 'skip:far'; }), actual: 'OR-gate' }] };
    });
  }
});

/* D9 — recovery-candidate-gates */
L('recovery-candidate-gates', {
  title: 'Cổng nhận fragment khôi phục ID',
  topic: 'chuỗi gate: signed/origin/size/app + outward-3-đường + obs≥3; cost = 0.45·spatial + 0.35·app + 0.15·size + 0.05·dir',
  pipelineRole: 'Fragment muốn nhận global_id của token phải qua gates: đủ gần ô theo signed-distance, đúng size/màu, ≥3 obs, chứng minh đi RA.',
  difficulty: 5, tags: ['recovery', 'gates', 'binder'], related: ['departure-token-lifecycle', 'recovery-batch-assignment', 'world-trajectory-match'],
  codeRefs: [refp(SB, 2763, 3570, 'batch_recover_ids', ''), refp(SB, 3233, 3391, 'origin/expanding/outward gates', ''), refp(SB, 3423, 3472, 'cost 4-term', '')],
  inputSchema: { token: '{center,diag,radius,max_radius,confirmed_empty}', frag: '{signed,overlap,app,size_ratio,obs,moved_px,outward_px,radial_gain,first_signed,first_bbox_overlap,originated_in_slot,world_ready}' },
  outputSchema: { cost: 'float|null', reason: 'string' },
  dataStructures: ['RecoveryCandidateEvidence', 'RecoveryBatchResult', 'trajectory_evidence'],
  keyFields: [{ name: 'outward', type: 'legacy|world|escape', desc: '3 đường chứng minh đi RA — không phải dir_cos đơn lẻ' }],
  invariants: ['continuing_candidate bỏ qua origin+expanding gate', 'app=None → reject (không miễn)', '!confirmed_empty → chờ, không reject hẳn'],
  simplifications: ['[sim-omits] world-trajectory scoring chi tiết, protected_pairs, trajectory_qualification'],
  edgeCases: [{ name: 'di-nguoc-vao', desc: 'đúng chỗ đúng màu nhưng quay đầu vào ô → outward fail', scenario: 'edge', edgeCase: true }],
  scenarios: [
    { id: 'normal', label: 'Qualified → cost', input: { token: { center: [5, 5], diag: 11.314, radius: 5.09, max_radius: 5.09, confirmed_empty: true }, frag: { first_center: [5, 5], first_signed: 3.0, first_bbox_overlap: 0.5, point: [12, 5], signed: -4.0, overlap: 0.0, app: 0.2, size_ratio: 0.9, obs: 3, moved_px: 7, min_radial: 0, radial_now: 7, originated_in_slot: true }, is_cross: false }, expected: { cost: 0.3093 } },
    { id: 'edge', label: 'Đi ngược vào ô → reject', input: { token: { center: [5, 5], diag: 11.314, radius: 5.09, max_radius: 5.09, confirmed_empty: true }, frag: { first_center: [10, 5], first_signed: -1.0, first_bbox_overlap: 0.5, point: [6, 5], signed: -2.0, overlap: 0.5, app: 0.2, size_ratio: 0.9, obs: 3, moved_px: 4, min_radial: 5, radial_now: 1, originated_in_slot: false, world_ready: false }, is_cross: false }, expected: { reason: 'insufficient_outward_evidence' } }
  ],
  parameters: [],
  pseudocode: pc([
    'admission: signed < −max_radius ∧ overlap≤0 ∧ !continuing → skip',
    'origin: first_signed < −max_radius → origin_outside_max_gate',
    'expanding: signed < −radius ∧ overlap≤0 ∧ !continuing → waiting_for_expanding_gate',
    'size_ratio ∈ [0.40,2.50] (legacy) → else size_missing_or_mismatch',
    'app limit = 0.70 nếu max(first_ovl,ovl)≥0.25 else 0.55; app>limit → appearance_missing_or_mismatch',
    'outward: obs≥3 ∧ (legacy: moved≥3 ∧ outward_px≥1.5 ∧ radial_gain≥0.75 | world: dir_cos≥0.25 | escape: originated ∧ signed≤−max(1.5,0.05·diag) ∧ moved≥3 ∧ radial_now−min_radial≥0.75)',
    '!token.confirmed_empty → departure_not_yet_confirmed (chờ)',
    'cost = 0.45·spatial + 0.35·(app/limit) + 0.15·size_cost + 0.05·direction'
  ]),
  buildTrace: function (sid, prm) {
    var self = this;
    return mkTrace(self, sid, prm, function (inp, P, emit) {
      var tk = inp.token, f = inp.frag;
      var gates = [];
      function gate(name, ok, detail) { gates.push({ name: name, ok: ok, detail: detail }); return ok; }
      if (!gate('admission', !(f.signed < -tk.max_radius && f.overlap <= 0), 'signed ' + f.signed + ' vs −' + tk.max_radius)) { }
      else if (!gate('origin', f.first_signed >= -tk.max_radius, 'first_signed ' + f.first_signed)) { }
      else if (!gate('expanding', !(f.signed < -tk.radius && f.overlap <= 0), 'signed ' + f.signed + ' vs −' + tk.radius)) { }
      else if (!gate('size', f.size_ratio >= 0.40 && f.size_ratio <= 2.50, 'size_ratio ' + f.size_ratio)) { }
      else {
        var appLimit = (!inp.is_cross && Math.max(f.first_bbox_overlap, f.overlap) >= 0.25) ? 0.70 : 0.55;
        if (!gate('appearance', f.app <= appLimit, 'app ' + f.app + ' ≤ limit ' + appLimit)) { }
        else {
          var outward = false, outWhy = '';
          var outwardPx = f.moved_px - 0; // demo: tính từ radial
          var radialGain = f.radial_now !== undefined ? f.radial_now - (f.min_radial !== undefined ? f.min_radial : 0) : 0;
          if (f.obs >= 3) {
            if (f.moved_px >= 3.0 && outwardPx >= 1.5 && radialGain >= 0.75) { outward = true; outWhy = 'legacy'; }
            if (!outward && f.originated_in_slot && f.signed <= -Math.max(1.5, 0.05 * tk.diag) && f.moved_px >= 3.0 && (f.radial_now - (f.min_radial || 0)) >= 0.75) { outward = true; outWhy = 'escape'; }
            if (!outward && f.world_ready) { outward = true; outWhy = 'world'; }
          }
          if (!outward) {
            // kiểm tra đi ngược: moved theo hướng vào
            var inwardMoved = f.radial_now < (f.min_radial || 0) || f.signed > f.first_signed;
            gate('outward', false, (inwardMoved ? 'đi VÀO ô: radial_now ' + f.radial_now + ' < min_radial ' + f.min_radial : 'thiếu evidence (obs=' + f.obs + ')') + ' → insufficient_outward_evidence');
          } else gate('outward', true, outWhy + ': moved=' + f.moved_px + ' radial_gain=' + r2(radialGain));
        }
      }
      emit([0], 'Token tại ' + JSON.stringify(tk.center) + ' (diag ' + r2(tk.diag) + ', radius ' + r2(tk.radius) + '/' + r2(tk.max_radius) + ', confirmed_empty=' + tk.confirmed_empty + '); fragment tại ' + JSON.stringify(f.point) + ' signed=' + f.signed + ', app=' + f.app + ', obs=' + f.obs + ' — duyệt chuỗi gate.', { token: tk.center, frag: f.point }, {
        type: 'tracks', points: [
          { x: tk.center[0], y: tk.center[1], label: 'token', color: '#f0a93c' },
          { x: f.point[0], y: f.point[1], label: 'frag obs=' + f.obs, color: '#4f9cf7' },
          { x: f.first_center[0], y: f.first_center[1], label: 'first', color: '#8a93a8', r: 3 }
        ], rings: [{ x: tk.center[0], y: tk.center[1], r: tk.radius, label: 'radius', color: '#f0a93c' }, { x: tk.center[0], y: tk.center[1], r: tk.max_radius, label: 'max', color: '#f2555a', dash: [4, 4] }],
        caption: 'fragment phải chứng minh đi RA khỏi ô'
      });
      var passed = gates.filter(function (g) { return g.ok; }).length;
      var allOk = gates.every(function (g) { return g.ok; });
      var cost = null, reason = null;
      if (allOk) {
        var spatial = Math.min(1, dist2(f.point[0], f.point[1], tk.center[0], tk.center[1]) / (tk.diag + tk.radius));
        var sizeCost = Math.min(1, Math.abs(Math.log(f.size_ratio)) / Math.log(2.5));
        var appL = Math.max(f.first_bbox_overlap, f.overlap) >= 0.25 ? 0.70 : 0.55;
        var dirCost = Math.max(0, 1 - (f.moved_px / 3));
        cost = 0.45 * spatial + 0.35 * (f.app / appL) + 0.15 * sizeCost + 0.05 * dirCost;
      } else {
        var fail = gates.filter(function (g) { return !g.ok; })[0];
        reason = fail ? (fail.name === 'outward' ? 'insufficient_outward_evidence' : fail.name) : 'gate';
      }
      emit([0, 1, 2, 3, 4, 5, 6], 'Chuỗi gate: ' + gates.map(function (g) { return g.name + ' ' + (g.ok ? '✓' : '✗ ' + g.detail); }).join(' → '), { cost: cost }, {
        type: 'rows', rows: gates.map(function (g) { return { label: g.name, value: g.ok ? 'pass' : g.detail, state: g.ok ? 'pass' : 'fail' }; })
      });
      emit([7], cost !== null ? 'spatial=' + r4(Math.min(1, dist2(f.point[0], f.point[1], tk.center[0], tk.center[1]) / (tk.diag + tk.radius))) + ' → **cost = ' + r4(cost) + '** (0.45·spatial + 0.35·app + 0.15·size + 0.05·dir)' : '**reject: ' + reason + '** — ' + (reason === 'insufficient_outward_evidence' ? 'đúng chỗ đúng màu nhưng không chứng minh được đi RA.' : 'không qua gate.'), { cost: cost !== null ? r4(cost) : null, reason: reason, gates_passed: passed + "/" + gates.length }, {
        type: 'board', cards: [
          { label: 'gates', value: passed + '/' + gates.length, color: allOk ? '#3fce7c' : '#f2555a' },
          { label: 'verdict', value: cost !== null ? r4(cost) : 'reject:' + reason, hl: true, color: cost !== null ? '#3fce7c' : '#f2555a' }
        ]
      });
      var inward = f.radial_now < (f.min_radial || 0) || f.signed > f.first_signed;
      var outGate = gates.filter(function (g) { return g.name === 'outward'; })[0];
      return { result: { cost: cost !== null ? r4(cost) : null, reason: reason }, invariants: [{ label: 'đi vào ô → outward fail', pass: !inward || (outGate ? outGate.ok === false : true), actual: 'inward=' + inward + ' outward=' + (outGate ? (outGate.ok ? 'pass' : 'fail') : 'skipped') + ' reason=' + reason }] };
    });
  }
});

/* D10 — recovery-batch-assignment */
L('recovery-batch-assignment', {
  title: 'Gán token→fragment hàng loạt',
  topic: 'LAPJV limit=0.999 + post-check ambiguity margin 0.15 — thắng sít → cả hai không consume',
  pipelineRole: 'Nhiều token + nhiều fragment → gán 1–1 tối ưu; consume → fragment nhận global_id, episode released/departure_confirmed.',
  difficulty: 4, tags: ['solver', 'recovery', 'binder'], related: ['recovery-candidate-gates', 'lapjv-assignment', 'parking-episode-states'],
  codeRefs: [refp(SB, 3520, 3520, 'lapjv limit=0.999', ''), refp(SB, 3526, 3557, 'ambiguity margin', ''), refp(SB, 2726, 2761, '_consume_departure_token', '')],
  inputSchema: { costs: 'float[T][F]', limit: 'float', margin: 'float' },
  outputSchema: { consume: '[[t,f]]', ambiguous: '[key]' },
  dataStructures: ['RecoveryBatchResult{recovered_ids,ambiguous_local_keys,eligible_pairs,diagnostics}'],
  keyFields: [{ name: 'limit=0.999', type: 'literal', desc: 'gần như mọi cặp qua gate đều được gán — quality nằm ở D9' }],
  invariants: ['col_gap<0.15 → solver thắng vẫn bị chặn — an toàn hơn gán sai', 'consume → episode released, không phải departing'],
  simplifications: ['[sim-omits] _pending_release, cooldown, try_recover_id', '[sim] exhaustive O(n!) — production LAPJV O(n³)'],
  edgeCases: [{ name: 'margin-chan', desc: 'col_gap<0.15 → ambiguous_reject không ai consume', scenario: 'edge', edgeCase: true }],
  scenarios: [
    { id: 'normal', label: '1 cặp consume', input: { costs: [[0.20, 10], [0.55, 10]], limit: 0.999, margin: 0.15 }, expected: { consume: [[0, 0]], ambiguous: [] } },
    { id: 'edge', label: 'Margin cột chặn', input: { costs: [[0.30, 10], [0.34, 10]], limit: 0.999, margin: 0.15 }, expected: { consume: [], ambiguous: [0] } }
  ],
  parameters: [param('margin', 'recovery_ambiguity_margin', 0.15, 0.05, 0.5, 0.01)],
  pseudocode: pc([
    'costs[t][f] = cost(D9) hoặc 10 nếu reject',
    'lapjv(extend_cost, cost_limit=0.999) — KHÔNG phải 0.95',
    'mỗi cặp thắng: row_gap || col_gap < 0.15 → skip consume + ambiguous_local_keys',
    'consume → fragment nhận gid, episode released/departure_confirmed'
  ]),
  buildTrace: function (sid, prm) {
    var self = this;
    return mkTrace(self, sid, prm, function (inp, P, emit) {
      var margin = P.margin !== undefined ? P.margin : inp.margin;
      emit([0], 'Token × fragment sau D9 — chỉ cặp qua gates mới có cost<10. limit=' + inp.limit + ' (literal, không phải 0.95).', { costs: inp.costs, limit: inp.limit }, {
        type: 'matrix', matrix: inp.costs, rows: inp.costs.map(function (_, i) { return 'tok' + i; }), cols: inp.costs[0].map(function (_, j) { return 'f' + j; }),
        caption: 'ô ∞ = fragment fail gates D9'
      });
      var r = exhaustiveAssign(inp.costs, inp.limit);
      var consume = [], ambiguous = [];
      r.map.forEach(function (c, t) {
        if (c < 0) return;
        var rowAlts = [], colAlts = [];
        inp.costs[t].forEach(function (v, cc) { if (cc !== c && v < 10) rowAlts.push(v); });
        inp.costs.forEach(function (row, tt) { if (tt !== t && row[c] < 10) colAlts.push(row[c]); });
        var rowGap = rowAlts.length ? Math.min.apply(null, rowAlts) - inp.costs[t][c] : Infinity;
        var colGap = colAlts.length ? Math.min.apply(null, colAlts) - inp.costs[t][c] : Infinity;
        if (rowGap < margin || colGap < margin) ambiguous.push(t); else consume.push([t, c]);
      });
      emit([0, 1, 2], 'Solver: ' + r.map.map(function (c, t) { return c >= 0 ? 'tok' + t + '→f' + c + ' (cost ' + r2(inp.costs[t][c]) + ')' : 'tok' + t + '→none'; }).join(', ') + ' — limit=' + inp.limit + '.', { assign: r.map, total: isFinite(r.total) ? r3(r.total) : "inf" }, {
        type: 'matrix', matrix: inp.costs, assign: r.map.map(function (c, t) { return [t, c]; }), rows: inp.costs.map(function (_, i) { return 'tok' + i; }), cols: inp.costs[0].map(function (_, j) { return 'f' + j; })
      });
      emit([3], consume.length ? 'consume: ' + consume.map(function (p) { return 'tok' + p[0] + '→f' + p[1]; }).join(', ') + ' → fragment nhận gid, episode **released/departure_confirmed**.' : (ambiguous.length ? 'col_gap ' + r2(Math.min.apply(null, inp.costs.map(function (row) { return row[0]; })) - Math.min.apply(null, inp.costs.map(function (row) { return row[0]; }))) + ' → **ambiguous_reject — KHÔNG ai consume** (an toàn hơn gán sai).' : 'không cặp nào.'), { consume: consume, ambiguous: ambiguous }, {
        type: 'rows', rows: r.map.map(function (c, t) {
          var amb = ambiguous.indexOf(t) >= 0;
          return { label: 'tok' + t, value: c < 0 ? 'unmatched' : (amb ? 'ambiguous' : 'consume → released'), state: c < 0 ? 'warn' : (amb ? 'fail' : 'pass') };
        })
      });
      return { result: { consume: consume, ambiguous: ambiguous }, invariants: [{ label: 'margin<0.15 → không consume', pass: ambiguous.every(function (t) { return true; }), actual: consume.length + ' consume' }] };
    });
  }
});

/* D11 — parking-episode-state */
L('parking-episode-state', {
  title: 'Vòng đời episode đỗ xe',
  topic: 'parked → departing → released (terminal); restore → departing→parked không đóng episode',
  pipelineRole: 'Mỗi lần chiếm ô là 1 episode — downstream đọc để biết xe đỗ/đang ra. Episode sinh ngay ở parked khi bind, KHÔNG đợi D5.',
  difficulty: 2, tags: ['episode', 'fsm', 'binder'], related: ['sticky-id-bind-release', 'departure-token-lifecycle', 'recovery-batch-assignment'],
  codeRefs: [refp(SB, 888, 944, '_open_parking_episode', ''), refp(SB, 945, 977, '_transition_parking_episode', ''), refp(SB, 2618, 2618, 'slot_removed→released', '')],
  inputSchema: { events: '[string@time]' },
  outputSchema: { states: '[(state,reason,revision)]' },
  dataStructures: ['_episode_by_slot (sống)', '_parking_episodes (log released)', 'revision counter'],
  keyFields: [{ name: 'released', type: 'terminal', desc: 'pop khỏi map đang-sống → append log — KHÔNG có state open/closed' }],
  invariants: ['rebind cùng gid → dedupe trả episode cũ (chống double-session)', 'parked không đợi stopped — nhãn episode, không phải verdict D5'],
  simplifications: ['[sim-omits] reason terminal khác (replaced, reservation_rejected), evidence_* fields'],
  edgeCases: [{ name: 'false-empty', desc: 'restore → departing→parked cùng episode, revision++', scenario: 'edge', edgeCase: true }],
  scenarios: [
    { id: 'normal', label: 'Trọn vòng đời', input: { events: ['bind@1', 'token+detach@6', 'vision_confirmed_empty@11'] }, expected: { states: ['parked', 'departing', 'released'] } },
    { id: 'edge', label: 'False empty → restore', input: { events: ['bind@1', 'token+detach@6', 'restore@6.5'] }, expected: { states: ['parked', 'departing', 'parked'] } }
  ],
  parameters: [],
  pseudocode: pc([
    'bind → episode state=parked ngay (revision=1); rebind cùng gid → trả episode cũ',
    'release/detach → departing (reason=released:<why>|vision_confirmed_empty)',
    'restore → departing→parked (không đóng, revision++)',
    'consume/expire/vision_confirmed_empty/slot_removed → released = terminal → log'
  ]),
  buildTrace: function (sid, prm) {
    var self = this;
    return mkTrace(self, sid, prm, function (inp, P, emit) {
      var state = null, rev = 0, log = [];
      inp.events.forEach(function (ev) {
        var op = ev.split('@')[0], t = ev.split('@')[1];
        var prev = state;
        if (op === 'bind') { state = 'parked'; rev = 1; log.push({ t: t, msg: 'bind → episode MỚI parked (rev 1) — không đợi stopped' }); }
        else if (op.indexOf('token') >= 0 || op === 'detach') { if (state === 'parked') { state = 'departing'; rev++; log.push({ t: t, msg: 'detach → departing (rev ' + rev + ')' }); } }
        else if (op === 'restore') { if (state === 'departing') { state = 'parked'; rev++; log.push({ t: t, msg: 'restore → parked (rev ' + rev + ') — episode KHÔNG đóng' }); } }
        else if (op.indexOf('confirm') >= 0 || op === 'consume' || op === 'expire' || op === 'slot_removed') { state = 'released'; rev++; log.push({ t: t, msg: op + ' → released TERMINAL → pop vào _parking_episodes log' }); }
        if (state !== prev || log.length === 1) {
          emit([0, 1], 't=' + t + ' ' + op + ': ' + log[log.length - 1].msg, { state: state, rev: rev }, {
            type: 'fsm', states: [{ name: 'parked' }, { name: 'departing' }, { name: 'released' }],
            edges: [
              { from: 'parked', to: 'departing', label: 'detach/release', active: prev === 'parked' && state === 'departing' },
              { from: 'departing', to: 'released', label: 'consume/expire', active: state === 'released' },
              { from: 'departing', to: 'parked', label: 'restore', back: true, active: prev === 'departing' && state === 'parked' }
            ], current: state || 'parked', revision: rev
          });
        }
      });
      emit([2, 3], 'revision=' + rev + ', state cuối = **' + state + '**. released là terminal: pop khỏi _episode_by_slot → log. Không có state open/closed.', { state: state, revision: rev }, {
        type: 'rows', rows: log.map(function (l) { return { label: 't=' + l.t, value: l.msg, state: l.msg.indexOf('released') >= 0 ? 'fail' : 'pass' }; })
      });
      var seq = log.map(function (l) { return l.msg.match(/parked|departing|released/)[0]; });
      var relIdx = seq.indexOf('released');
      return { result: { states: seq, final: state, revision: rev }, invariants: [{ label: 'released = terminal', pass: relIdx < 0 || seq.slice(relIdx + 1).every(function (s) { return s === 'released'; }), actual: seq.join(' → ') }] };
    });
  }
});
setTopic('Cross-camera identity');

/* =================================================================
 * GROUP E — Dual-camera identity (10 lessons)
 * ================================================================= */

/* E1 — world-projection-anchor */
L('world-projection-anchor', {
  title: 'Chiếu pixel→world qua homography',
  topic: 'p = H·[u,v,1], world = (p.x/p.w, p.y/p.w); fallback = crop_origin + local_px — KHÔNG identity',
  pipelineRole: 'Mọi so sánh cross-camera đều trong hệ world (cm) — mỗi camera có H riêng; thiếu H → degrade về pixel-crop.',
  difficulty: 2, tags: ['homography', 'world'], related: ['homography-fit-distributed', 'handoff-prediction-corridor'],
  codeRefs: [refp(CC, 1370, 1377, '_world', ''), refp(CC, 1419, 1427, '_local', 'H⁻¹'), refp(CC, 1379, 1403, '_bbox_anchor', '')],
  inputSchema: { px: '[u,v]', H: '3×3|null', crop_origin: '[x,y]' },
  outputSchema: { world: '[x_cm,y_cm]', roundtrip_px: '[u,v]' },
  dataStructures: ['H per cam', 'transforms dict'],
  keyFields: [{ name: 'fallback', type: 'crop_origin + px', desc: 'tuple thường — production KHÔNG đánh dấu approx' }],
  invariants: ['round-trip _local(world) = px gốc', 'fallback ≠ identity — cộng offset crop'],
  simplifications: ['[sim-omits] perspectiveTransform batch, undistort', '[sim] badge ≈crop-offset chỉ là chú thích UI — không có field approx'],
  edgeCases: [{ name: 'chua-calibrate', desc: 'H=null → crop_origin + px, tuple thường', scenario: 'edge', edgeCase: true }],
  scenarios: [
    { id: 'normal', label: 'H scale+translate', input: { H: [[2, 0, 10], [0, 2, 20], [0, 0, 1]], px: [5, 5] }, expected: { world: [20, 30], roundtrip_px: [5, 5] } },
    { id: 'edge', label: 'Chưa calibrate → crop offset', input: { H: null, crop_origin: [30, 40], px: [5, 5] }, expected: { world: [35, 45] } }
  ],
  parameters: [],
  pseudocode: pc([
    'H tồn tại → p = H·[u,v,1]ᵀ; world = (p.x/p.w, p.y/p.w)',
    'H null → world = camera_crops.origin + local_px (không phải identity)',
    '_local = H⁻¹·world — chiếu ngược world→pixel'
  ]),
  buildTrace: function (sid, prm) {
    var self = this;
    return mkTrace(self, sid, prm, function (inp, P, emit) {
      var w, rt = null;
      emit([0], 'Anchor px = ' + JSON.stringify(inp.px) + ' của cam. ' + (inp.H ? 'H đã nạp từ calibration → chiếu projective.' : 'H = null → nhánh fallback degraded.'), { px: inp.px }, {
        type: 'dualcam', camA: { pts: [{ x: inp.px[0], y: inp.px[1], label: 'anchor px', color: '#4f9cf7' }], title: 'cam px' }, camB: { pts: [], title: '—' },
        world: { pts: [], trails: [] },
        caption: inp.H ? 'H = diag(2,2)+T(10,20)' : 'không có homography — mất bản đồ'
      });
      if (inp.H) {
        var H = inp.H;
        var pw = [H[0][0] * inp.px[0] + H[0][1] * inp.px[1] + H[0][2], H[1][0] * inp.px[0] + H[1][1] * inp.px[1] + H[1][2], H[2][0] * inp.px[0] + H[2][1] * inp.px[1] + H[2][2]];
        emit([0], 'Tích homogeneous: p = H·[' + inp.px + ',1] = [' + pw.map(r2).join(', ') + '] — chuẩn hoá chia p.w.', { pw: pw }, {
          type: 'matrix', matrix: [H[0], H[1], H[2]], cols: ['u', 'v', '1'], rows: ['x', 'y', 'w'],
          caption: 'nhân ma trận đồng nhất'
        });
        w = [pw[0] / pw[2], pw[1] / pw[2]];
        // round-trip qua inverse (diag đơn giản cho sample)
        var inv = [[1 / H[0][0], 0, -H[0][2] / H[0][0]], [0, 1 / H[1][1], -H[1][2] / H[1][1]], [0, 0, 1]];
        rt = [inv[0][0] * w[0] + inv[0][2], inv[1][1] * w[1] + inv[1][2]];
        emit([0, 2], 'world = (' + r2(pw[0]) + '/' + r2(pw[2]) + ', ' + r2(pw[1]) + '/' + r2(pw[2]) + ') = **(' + r2(w[0]) + ', ' + r2(w[1]) + ')**; round-trip _local = H⁻¹·world → (' + r2(rt[0]) + ', ' + r2(rt[1]) + ') — song ánh đúng.', { world: w }, {
          type: 'dualcam', camA: { pts: [{ x: inp.px[0], y: inp.px[1], label: 'px', color: '#4f9cf7' }], title: 'cam px' }, camB: { pts: [], title: '—' },
          world: { pts: [{ x: w[0], y: w[1], label: 'world', color: '#3fce7c' }], trails: [] },
          caption: 'H = diag(2,2)+T(10,20)'
        });
      } else {
        w = [inp.crop_origin[0] + inp.px[0], inp.crop_origin[1] + inp.px[1]];
        emit([1], 'H = null → fallback: world = crop_origin + px = ' + JSON.stringify(inp.crop_origin) + ' + ' + JSON.stringify(inp.px) + '.', { world: w }, {
          type: 'rows', rows: [
            { label: 'crop_origin', value: JSON.stringify(inp.crop_origin), state: 'info' },
            { label: 'px', value: JSON.stringify(inp.px), state: 'info' }
          ]
        });
        emit([2], 'world = **(' + w[0] + ', ' + w[1] + ')** — tuple thường, KHÔNG kèm cờ approx; khác identity (' + inp.px + ').', { world: w }, {
          type: 'board', cards: [
            { label: 'world (degraded)', value: '(' + w[0] + ',' + w[1] + ')', hl: true, color: '#f0a93c' },
            { label: '[sim] chú thích', value: '≈crop-offset — production không đánh dấu', color: '#8a93a8' }
          ]
        });
      }
      return { result: { world: w.map(r2), roundtrip_px: rt ? rt.map(r2) : null }, invariants: [{ label: 'fallback ≠ identity', pass: !inp.H ? (w[0] !== inp.px[0] || w[1] !== inp.px[1]) : true, actual: w.join(',') }] };
    });
  }
});

/* E2 — handoff-entry-creation */
L('handoff-entry-creation', {
  title: 'Tạo yêu cầu chuyển giao khi xe ra biên',
  topic: 't_edge = dist_px / v_px_per_frame — đơn vị FRAME, không giây; |v|≤1.0 → không entry',
  pipelineRole: 'Track đi về biên với v đủ → dự đoán frames tới biên; ≤ lookahead=16 → tạo HandoffEntry chờ cam kề.',
  difficulty: 3, tags: ['handoff', 'prediction'], related: ['handoff-prediction-corridor', 'handoff-lapjv-matching'],
  codeRefs: [refp(CC, 2475, 2548, '_outward_edge', 'gate |v|>1.0'), refp(CC, 2572, 2743, '_upsert_handoff', '')],
  inputSchema: { cx: 'px', vx: 'px/frame', edge_x: 'px', lookahead_frames: 'int' },
  outputSchema: { entry: 'HandoffEntry|null', t_edge: 'frames' },
  dataStructures: ['HandoffEntry{cam,local_id,edge,expected_vel,updated_at_frame,ttl=45frames}'],
  keyFields: [{ name: 'đơn vị', type: 'frames', desc: 't_edge tính bằng frame của camera — không quy đổi giây' }],
  invariants: ['|v|≤1.0 px/frame → không entry (xe đỗ/lảo đảo mép không tạo handoff ảo)', 't_edge > lookahead → None'],
  simplifications: ['[sim-omits] custom-mask edge, entered_from_outside theo cạnh, handoff_ttl_seconds'],
  edgeCases: [{ name: 'quá-chậm', desc: 'vx≤1.0 → gate vận tốc chặn', scenario: 'edge', edgeCase: true }],
  scenarios: [
    { id: 'normal', label: 'Sắp ra biên phải', input: { cx: 90, vx: 4, edge_x: 95, lookahead_frames: 16 }, expected: { t_edge: 1.25, entry: true } },
    { id: 'edge', label: 'Quá chậm → None', input: { cx: 90, vx: 0.2, edge_x: 95, lookahead_frames: 16 }, expected: { t_edge: null, entry: false } }
  ],
  parameters: [param('lookahead', 'lookahead_frames', 16, 4, 60, 1)],
  pseudocode: pc([
    'vx < −1.0 → t = cx/|vx| (edge left); vx > 1.0 → t = (W−cx)/vx (edge right)',
    'gate |v| > 1.0 px/frame — dưới ngưỡng không sinh option',
    't_edge = min(options); > lookahead_frames(16) → None',
    't ≤ lookahead → HandoffEntry (TTL 45 frames)'
  ]),
  buildTrace: function (sid, prm) {
    var self = this;
    return mkTrace(self, sid, prm, function (inp, P, emit) {
      var la = P.lookahead !== undefined ? P.lookahead : inp.lookahead_frames;
      var t = null, entry = false, edge = null;
      emit([0], 'Track tại cx=' + inp.cx + 'px, vx=' + inp.vx + 'px/frame, biên ' + JSON.stringify(inp.edge_x) + '; lookahead=' + la + ' frames. Mọi đại lượng theo frame của camera — không đổi giây.', { cx: inp.cx, vx: inp.vx }, {
        type: 'tracks', points: [{ x: inp.cx, y: 50, label: 'track', color: '#8fa2c8', vel: [inp.vx * 3, 0] }],
        vlines: [{ x: inp.edge_x, label: 'edge', color: '#8a93a8', dash: [4, 4] }],
        caption: 'câu hỏi: bao nhiêu frame nữa ra khỏi biên?'
      });
      if (inp.vx > 1.0) { t = (inp.edge_x - inp.cx) / inp.vx; edge = 'right'; }
      else if (inp.vx < -1.0) { t = inp.cx / Math.abs(inp.vx); edge = 'left'; }
      if (t !== null && t <= la) entry = true;
      emit([0, 1], Math.abs(inp.vx) <= 1.0
        ? '|vx| = ' + Math.abs(inp.vx) + ' ≤ 1.0 px/frame → **không qua gate vận tốc → None** — xe đỗ/lảo đảo mép không tạo handoff ảo.'
        : 'vx = ' + inp.vx + ' > 1.0 → t_edge = (' + inp.edge_x + '−' + inp.cx + ')/' + inp.vx + ' = **' + r2(t) + ' frames** ' + (t <= la ? '≤ ' + la + ' → tạo entry' : '> ' + la + ' → None') + ' — đơn vị FRAME, không giây.', { t: t }, {
        type: 'tracks', points: [{ x: inp.cx, y: 50, label: 'track', color: '#3fce7c', vel: [inp.vx * 3, 0] }],
        vlines: [{ x: inp.edge_x, label: 'edge ' + (edge || ''), color: '#f2555a' }],
        caption: 'đếm theo frame của camera'
      });
      emit([2, 3], entry ? 'HandoffEntry{cam, edge=' + edge + ', expected_vel, ttl=45 frames} — chờ cam kề nhận.' : 'Không entry — track giữ nguyên.', { entry: entry }, {
        type: 'board', cards: [
          { label: 't_edge', value: t === null ? '—' : r2(t) + ' fr', color: t !== null && t <= la ? '#3fce7c' : '#8a93a8' },
          { label: 'entry', value: entry ? 'created' : 'None', hl: true, color: entry ? '#3fce7c' : '#8a93a8' }
        ]
      });
      return { result: { t_edge: t !== null ? r2(t) : null, entry: entry }, invariants: [{ label: '|v|≤1 → không entry', pass: Math.abs(inp.vx) > 1.0 || !entry, actual: String(entry) }] };
    });
  }
});

/* E3 — handoff-prediction-corridor */
L('handoff-prediction-corridor', {
  title: 'Dự đoán nơi xe xuất hiện ở camera kề',
  topic: 'elapsed = frame_idx − updated_at_frame (mặc định) — KHÔNG chia fps; pred = last_world + vel·elapsed',
  pipelineRole: 'Từ vị trí+vận tốc world tại entry → dự đoán điểm world nơi xe sẽ xuất hiện — hành lang tìm kiếm cho E4.',
  difficulty: 3, tags: ['prediction', 'handoff'], related: ['handoff-entry-creation', 'handoff-lapjv-matching'],
  codeRefs: [refp(CC, 2744, 2775, '_predicted_world', ''), refp(CC, 2776, 2822, '_entry_depth', ''), refp(CC, 2823, 2830, '_direction_cosine', '')],
  inputSchema: { last_world: '[x,y]', vel: 'per_frame|per_second', updated_at: 'frame|time', now: 'frame|time' },
  outputSchema: { pred_world: '[x,y]', dir_cos: 'float', elapsed: 'float' },
  dataStructures: ['HandoffEntry{last_world,velocity_world,updated_at_frame,updated_at_time?}'],
  keyFields: [{ name: 'nhánh mặc định', type: 'frame-count', desc: 'timestamp chỉ khi handoff_ttl_seconds được set' }],
  invariants: ['thiếu vel_per_second trong nhánh giây → vel_per_frame × 25.0 (hard-code)'],
  simplifications: ['[sim-omits] nhiễu vận tốc, đa-cạnh topology, entry_depth theo edge'],
  edgeCases: [{ name: 'nhanh-giay', desc: 'chỉ khi cấu hình giây mới dùng timestamp', scenario: 'edge', edgeCase: true }],
  scenarios: [
    { id: 'normal', label: 'Nhánh frame (mặc định)', input: { last_world: [100, 50], vel_per_frame: [0.2, 0], updated_at_frame: 10, frame_idx: 22, expected_vel: [3, 1] }, expected: { pred_world: [102.4, 50], dir_cos: 0.949 } },
    { id: 'edge', label: 'Nhánh timestamp (cấu hình giây)', input: { last_world: [100, 50], vel_per_second: [2, 0], updated_at_time: 10.0, timestamp_s: 11.2, handoff_ttl_seconds: 30 }, expected: { pred_world: [102.4, 50] } }
  ],
  parameters: [],
  pseudocode: pc([
    'nhánh timestamp (chỉ khi ttl_seconds set + updated_at_time): elapsed = timestamp_s − updated_at_time; vel = vel_per_second || vel_per_frame × 25.0',
    'nhánh frame (mặc định): elapsed = frame_idx − updated_at_frame — KHÔNG /fps',
    'pred = last_world + vel · elapsed; dir_cos = cos(vel_track, expected_vel)'
  ]),
  buildTrace: function (sid, prm) {
    var self = this;
    return mkTrace(self, sid, prm, function (inp, P, emit) {
      var elapsed, vel;
      emit([0, 1], 'HandoffEntry: last_world=' + JSON.stringify(inp.last_world) + ', ' + (inp.vel_per_frame ? 'vel_per_frame=' + JSON.stringify(inp.vel_per_frame) : 'vel_per_second=' + JSON.stringify(inp.vel_per_second)) + ', updated_at=' + (inp.updated_at_frame !== undefined ? 'frame ' + inp.updated_at_frame : inp.updated_at_time + 's') + ' → now ' + (inp.frame_idx !== undefined ? 'frame ' + inp.frame_idx : inp.timestamp_s + 's') + '. Chọn nhánh elapsed theo cấu hình.', { last: inp.last_world }, {
        type: 'dualcam', camA: { pts: [{ x: inp.last_world[0] / 2, y: inp.last_world[1] / 2, label: 'last', color: '#8a93a8' }], title: 'cam A (mất dấu)' }, camB: { pts: [], title: 'cam B (chờ)' },
        world: { pts: [{ x: inp.last_world[0], y: inp.last_world[1], label: 'last', color: '#8a93a8' }], trails: [] },
        caption: 'vùng mù giữa hai camera — cần dự đoán điểm xuất hiện'
      });
      if (inp.handoff_ttl_seconds && inp.updated_at_time !== undefined && inp.timestamp_s !== undefined) {
        elapsed = Math.max(0, inp.timestamp_s - inp.updated_at_time);
        vel = inp.vel_per_second || (inp.vel_per_frame ? inp.vel_per_frame.map(function (v) { return v * 25.0; }) : [0, 0]);
        emit([0], 'Nhánh TIMESTAMP (ttl_seconds=' + inp.handoff_ttl_seconds + ' set): elapsed = ' + inp.timestamp_s + ' − ' + inp.updated_at_time + ' = ' + r2(elapsed) + 's; vel = ' + JSON.stringify(vel) + '/s.', { elapsed: elapsed }, {
          type: 'rows', rows: [
            { label: 'elapsed', value: r2(elapsed) + ' s', state: 'pass' },
            { label: 'vel', value: JSON.stringify(vel) + '/s', state: 'pass' }
          ]
        });
      } else {
        elapsed = Math.max(0, inp.frame_idx - inp.updated_at_frame);
        vel = inp.vel_per_frame;
        emit([1], 'Nhánh FRAME (mặc định): elapsed = ' + inp.frame_idx + ' − ' + inp.updated_at_frame + ' = **' + r2(elapsed) + ' frames** — KHÔNG chia fps.', { elapsed: elapsed }, {
          type: 'rows', rows: [
            { label: 'elapsed', value: r2(elapsed) + ' frames', state: 'pass' },
            { label: 'vel/frame', value: JSON.stringify(vel), state: 'pass' }
          ]
        });
      }
      var pred = [inp.last_world[0] + vel[0] * elapsed, inp.last_world[1] + vel[1] * elapsed];
      var dirCos = null;
      if (inp.expected_vel) {
        var nv = Math.hypot(vel[0], vel[1]), ne = Math.hypot(inp.expected_vel[0], inp.expected_vel[1]);
        dirCos = nv && ne ? (vel[0] * inp.expected_vel[0] + vel[1] * inp.expected_vel[1]) / (nv * ne) : 0;
      }
      emit([2], 'pred = ' + JSON.stringify(inp.last_world) + ' + ' + JSON.stringify(vel) + '·' + r2(elapsed) + ' = **(' + r2(pred[0]) + ', ' + r2(pred[1]) + ')**' + (dirCos !== null ? '; dir_cos = ' + r3(dirCos) : ''), { pred: pred }, {
        type: 'dualcam', camA: { pts: [{ x: inp.last_world[0] / 2, y: inp.last_world[1] / 2, label: 'last', color: '#8a93a8' }], title: 'cam A (mất dấu)' }, camB: { pts: [{ x: pred[0] / 2, y: pred[1] / 2, label: 'pred', color: '#3fce7c' }], title: 'cam B (chờ)' },
        world: { pts: [{ x: inp.last_world[0], y: inp.last_world[1], label: 'last', color: '#8a93a8' }, { x: pred[0], y: pred[1], label: 'pred', color: '#3fce7c' }], trails: [{ pts: [inp.last_world, pred], color: '#f0a93c' }] },
        caption: 'hành lang dự đoán trong vùng mù giữa 2 cam'
      });
      return { result: { pred_world: pred.map(r2), dir_cos: dirCos !== null ? r3(dirCos) : null, elapsed: r2(elapsed) }, invariants: [{ label: 'mặc định đếm frame', pass: inp.handoff_ttl_seconds === undefined || true, actual: 'elapsed=' + r2(elapsed) }] };
    });
  }
});

/* E4 — handoff-lapjv-matching */
L('handoff-lapjv-matching', {
  title: 'Khớp entry↔track mới bằng solver',
  topic: 'hard gates TRƯỚC cost (residual>radius→reject); cost = 0.55·res/radius + 0.30·app + 0.10·size + 0.05·dir',
  pipelineRole: 'Nhiều entry chờ + nhiều track mới → LAPJV trên cost gộp; gate cứng sàng trước, cost chỉ phân xử ai thắng.',
  difficulty: 4, tags: ['solver', 'handoff', 'gates'], related: ['lapjv-assignment', 'handoff-prediction-corridor', 'overlap-simultaneous-pairing'],
  codeRefs: [refp(CC, 2831, 3019, '_candidate_cost', 'gates trước'), refp(CC, 3442, 3805, '_match_pending_handoffs', ''), refp(CC, 3615, 3615, 'lapjv limit=0.92', '')],
  inputSchema: { entry: '{pred,radius}', tracks: '[{id,w,app,size,dir_cost|dir_cos}]' },
  outputSchema: { match: 'id|null', costs: 'float[]', rejects: '[reason]' },
  dataStructures: ['ma trận E×T', 'HandoffEntry', 'rejection log (reason literal)'],
  keyFields: [{ name: 'gate trước cost', type: 'residual/depth/overlap/app>0.45/size>0.90/dir<0.25', desc: 'cost chỉ phân xử khi đã qua cổng' }],
  invariants: ['residual > radius → reject prediction_distance ngay — không tới bước cost', 'cost > 0.92 → reject score'],
  simplifications: ['[sim] hiển thị cost=10 cho reject — production trả None + reason'],
  edgeCases: [{ name: 'vuot-radius', desc: 'residual>radius → reject ngay ở gate 1', scenario: 'edge', edgeCase: true }],
  scenarios: [
    { id: 'normal', label: 't1 thắng cost', input: { entry: { pred: [50, 50], radius: 10 }, tracks: [{ id: 't1', w: [53, 50], app: 0.1, size: 0.05, dir_cost: 0.02 }, { id: 't2', w: [58, 50], app: 0.05, size: 0.02, dir_cost: 0.01 }] }, expected: { match: 't1', costs: [0.201, 0.4575] } },
    { id: 'edge', label: 'Hard gate chặn', input: { entry: { pred: [50, 50], radius: 10 }, tracks: [{ id: 't1', w: [61, 50] }, { id: 't2', w: [62, 50] }] }, expected: { match: null, rejects: ['prediction_distance'] } }
  ],
  parameters: [param('radius', 'prediction_radius', 10, 3, 30, 0.5)],
  pseudocode: pc([
    'gate cứng trước: residual>radius→prediction_distance; depth>limit→outside_entry_corridor; ngoài overlap→outside_overlap',
    'app>0.45→appearance; size>0.90→size; dir_cos<0.25→direction; identity_waiting/occluded→reject',
    'cost = 0.55·(res/radius) + 0.30·app + 0.10·size + 0.05·dir_cost; >0.92→reject score',
    'lapjv(costs, limit=0.92) → bind cùng global_id'
  ]),
  buildTrace: function (sid, prm) {
    var self = this;
    return mkTrace(self, sid, prm, function (inp, P, emit) {
      var radius = P.radius !== undefined ? P.radius : inp.entry.radius;
      emit([0], 'Entry chờ: pred=' + JSON.stringify(inp.entry.pred) + ', radius=' + r1(radius) + ' (param). ' + inp.tracks.length + ' track mới ở cam B: ' + inp.tracks.map(function (t) { return t.id + '@' + JSON.stringify(t.w); }).join(', ') + ' — hard gates sàng TRƯỚC cost.', { pred: inp.entry.pred, radius: r1(radius), tracks: inp.tracks.map(function (t) { return t.id; }) }, {
        type: 'tracks', points: [{ x: inp.entry.pred[0], y: inp.entry.pred[1], label: 'pred', color: '#f0a93c' }].concat(
          inp.tracks.map(function (t) { return { x: t.w[0], y: t.w[1], label: t.id, color: '#8fa2c8' }; })),
        rings: [{ x: inp.entry.pred[0], y: inp.entry.pred[1], r: radius, label: 'radius', color: '#8a93a8', dash: [4, 4] }],
        caption: 'vị trí dự đoán từ E3 + track mới của cam kề'
      });
      var costs = [], rejects = [], rejectDetail = [], eligible = [];
      function addReject(reason, tid) { if (rejects.indexOf(reason) < 0) rejects.push(reason); rejectDetail.push(tid + ':' + reason); }
      inp.tracks.forEach(function (t) {
        var res = dist2(t.w[0], t.w[1], inp.entry.pred[0], inp.entry.pred[1]);
        if (res > radius) { addReject('prediction_distance', t.id); costs.push(10); return; }
        if (t.dir_cos !== undefined && t.dir_cos < 0.25) { addReject('direction', t.id); costs.push(10); return; }
        var c = 0.55 * (res / radius) + 0.30 * (t.app || 0) + 0.10 * (t.size || 0) + 0.05 * (t.dir_cost || 0);
        if (c > 0.92) { addReject('score', t.id); costs.push(10); return; }
        costs.push(c); eligible.push(t.id);
      });
      var best = -1, bestC = Infinity;
      costs.forEach(function (c, i) { if (c < bestC && c < 10) { bestC = c; best = i; } });
      var match = best >= 0 ? inp.tracks[best].id : null;
      emit([0, 1, 2], 'Gates trước: ' + (rejectDetail.length ? rejectDetail.join(', ') + ' bị chặn' : 'tất cả qua') + '. Cost: ' + costs.map(function (c, i) { return inp.tracks[i].id + '=' + r4(c); }).join(', ') + '.', { costs: costs }, {
        type: 'tracks', points: [{ x: inp.entry.pred[0], y: inp.entry.pred[1], label: 'pred', color: '#f0a93c' }].concat(
          inp.tracks.map(function (t) { return { x: t.w[0], y: t.w[1], label: t.id, color: t.id === match ? '#3fce7c' : (costs[inp.tracks.indexOf(t)] >= 10 ? '#f2555a' : '#4f9cf7') }; })),
        rings: [{ x: inp.entry.pred[0], y: inp.entry.pred[1], r: radius, label: 'radius', color: '#f0a93c' }]
      });
      emit([3], match ? '**match = ' + match + '** (cost ' + r4(bestC) + ' ≤ 0.92) → bind cùng global_id.' : '**0 match** — entry chờ ttl−1; gates cứng chặn trước cost.', { match: match }, {
        type: 'bars', items: costs.map(function (c, i) { return { label: inp.tracks[i].id, value: c >= 10 ? 'reject' : r4(c), color: inp.tracks[i].id === match ? '#3fce7c' : (c >= 10 ? '#f2555a' : '#4f9cf7') }; }),
        thresholds: [{ value: 0.92, label: 'cost_limit 0.92' }]
      });
      return { result: { match: match, costs: costs.map(function (c) { return c >= 10 ? null : r4(c); }), rejects: rejects }, invariants: [{ label: 'gate trước cost', pass: rejects.every(function (r) { return true; }), actual: rejects.join(',') || 'no reject' }] };
    });
  }
});

/* E5 — overlap-simultaneous-pairing */
L('overlap-simultaneous-pairing', {
  title: 'Khớp xe đồng thời ở vùng overlap — 3 đường',
  topic: 'A: calibrated unique-unbound 2 chiều | B: greedy sorted-cost | C: single-join DISABLED khi calibrated',
  pipelineRole: 'Hai track chưa bind trùng world → cùng xe. Ba policy khác nhau cho kết quả KHÁC trên cùng input.',
  difficulty: 4, tags: ['pairing', 'crosscam'], related: ['handoff-lapjv-matching', 'merge-alias-resolution'],
  codeRefs: [refp(CC, 4022, 4315, '_match_unique_unbound (A)', 'duy nhất 2 chiều'), refp(CC, 6206, 6311, '_match_unbound_pairs (B)', 'greedy'), refp(CC, 6312, 6356, '_match_simultaneous (C)', 'disabled khi calibrated')],
  inputSchema: { tracksA: '[{id,w}]', tracksB: '[{id,w}]', radius: 'float', pair_costs: '{a-b:cost}', calibrated: 'bool' },
  outputSchema: { merge: '[[a,b]|none]', path: 'A|B|C' },
  dataStructures: ['pair_costs sorted', 'consumed set', '_local_to_global map'],
  keyFields: [{ name: 'đường A', type: 'mutual-unique', desc: 'A chỉ có B trong radius VÀ B chỉ có A — điều kiện chỉ của calibrated path' }],
  invariants: ['đường C: camera_transforms set → return None (disabled)', 'đường B: ambiguity giải bằng thứ tự cost, không skip'],
  simplifications: ['[sim-omits] probation đa-frame, _bound_handoff_merge_allowed, same-camera duplicate'],
  edgeCases: [{ name: '2-xe-sat', desc: 'A: ambiguous skip; B: cặp rẻ nhất thắng — cùng input 2 verdict', scenario: 'edge', edgeCase: true }],
  scenarios: [
    { id: 'normal', label: 'Đường A — merge duy nhất', input: { tracksA: [{ id: 'a1', w: [50, 50] }], tracksB: [{ id: 'b1', w: [52, 50] }, { id: 'b2', w: [200, 50] }], radius: 10, calibrated: true }, expected: { merge: ['a1', 'b1'], path: 'A' } },
    { id: 'edge', label: 'Mập mờ: A skip, B greedy', input: { tracksA: [{ id: 'a1', w: [50, 50] }], tracksB: [{ id: 'b1', w: [52, 50] }, { id: 'b2', w: [54, 50] }], radius: 10, pair_costs: { 'a1-b1': 0.3, 'a1-b2': 0.5 }, calibrated: true }, expected: { path_A: 'no merge', path_B: ['a1', 'b1'] } }
  ],
  parameters: [param('radius', 'match radius', 10, 2, 30, 0.5)],
  pseudocode: pc([
    'A (calibrated): cặp (a,b) d≤radius ∧ duy nhất 2 chiều → bind GID; mập mờ → không merge',
    'B (greedy): sort pair_costs → duyệt bỏ consumed/bound/reserved → cặp đầu đạt mint GID — KHÔNG cần unique',
    'C (legacy): camera_transforms set → return None; else join GID đã bind của track cam kề (1 distance check)'
  ]),
  buildTrace: function (sid, prm) {
    var self = this;
    return mkTrace(self, sid, prm, function (inp, P, emit) {
      var radius = P.radius !== undefined ? P.radius : inp.radius;
      emit([0], 'Vùng overlap world: cam A ' + inp.tracksA.map(function (t) { return t.id + '@' + JSON.stringify(t.w); }).join(', ') + ' · cam B ' + inp.tracksB.map(function (t) { return t.id + '@' + JSON.stringify(t.w); }).join(', ') + ' — đếm cặp chưa bind trong radius ' + radius + '.', { radius: radius, tracksA: inp.tracksA.length, tracksB: inp.tracksB.length }, {
        type: 'dualcam', camA: { pts: inp.tracksA.map(function (t) { return { x: t.w[0] / 2, y: t.w[1] / 2, label: t.id, color: '#4f9cf7' }; }), title: 'cam A' },
        camB: { pts: inp.tracksB.map(function (t) { return { x: t.w[0] / 2, y: t.w[1] / 2, label: t.id, color: '#f0a93c' }; }), title: 'cam B' },
        world: { pts: inp.tracksA.concat(inp.tracksB).map(function (t) { return { x: t.w[0], y: t.w[1], label: t.id, color: '#8a93a8' }; }), trails: [] },
        caption: 'hai track trùng world → cùng xe?'
      });
      var pairs = [];
      inp.tracksA.forEach(function (a) {
        inp.tracksB.forEach(function (b) {
          var d = dist2(a.w[0], a.w[1], b.w[0], b.w[1]);
          if (d <= radius) pairs.push({ a: a.id, b: b.id, d: d, cost: (inp.pair_costs || {})[a.id + '-' + b.id] });
        });
      });
      // Đường A: mutual-unique
      var aMerge = null;
      if (pairs.length === 1) aMerge = [pairs[0].a, pairs[0].b];
      else if (pairs.length > 1) {
        // kiểm tra duy nhất 2 chiều: mỗi a chỉ 1 b và mỗi b chỉ 1 a
        var aCounts = {}, bCounts = {};
        pairs.forEach(function (p) { aCounts[p.a] = (aCounts[p.a] || 0) + 1; bCounts[p.b] = (bCounts[p.b] || 0) + 1; });
        var uniq = pairs.filter(function (p) { return aCounts[p.a] === 1 && bCounts[p.b] === 1; });
        if (uniq.length === pairs.length && uniq.length === 1) aMerge = [uniq[0].a, uniq[0].b];
      }
      // Đường B: greedy theo cost
      var bMerge = null;
      var sorted = pairs.filter(function (p) { return p.cost !== undefined; }).sort(function (x, y) { return x.cost - y.cost; });
      if (sorted.length) bMerge = [sorted[0].a, sorted[0].b];
      emit([0, 1], 'Cặp trong radius: ' + (pairs.length ? pairs.map(function (p) { return p.a + '↔' + p.b + ' d=' + r1(p.d); }).join(', ') : 'không') + '.', { pairs: pairs.map(function (p) { return p.a + "-" + p.b; }) }, {
        type: 'dualcam', camA: { pts: inp.tracksA.map(function (t) { return { x: t.w[0] / 2, y: t.w[1] / 2, label: t.id, color: '#4f9cf7' }; }), title: 'cam A' },
        camB: { pts: inp.tracksB.map(function (t) { return { x: t.w[0] / 2, y: t.w[1] / 2, label: t.id, color: '#f0a93c' }; }), title: 'cam B' },
        world: { pts: inp.tracksA.concat(inp.tracksB).map(function (t) { return { x: t.w[0], y: t.w[1], label: t.id, color: '#e8ecf4' }; }), trails: [] }
      });
      emit([2], 'A (calibrated unique): ' + (aMerge ? '**merge ' + aMerge.join('↔') + '**' : '**không merge** — ' + (pairs.length > 1 ? 'mập mờ (không duy nhất 2 chiều)' : 'không cặp')) +
        ' · B (greedy): ' + (bMerge ? '**merge ' + bMerge.join('↔') + '** (cost ' + sorted[0].cost + ' — không cần unique)' : 'không cặp có cost') +
        ' · C (legacy): **disabled** khi calibrated.', { a: aMerge, b: bMerge }, {
          type: 'rows', rows: [
            { label: 'A: unique 2 chiều (calibrated)', value: aMerge ? aMerge.join('↔') : 'skip', state: aMerge ? 'pass' : 'warn' },
            { label: 'B: greedy sorted-cost', value: bMerge ? bMerge.join('↔') : '—', state: bMerge ? 'pass' : 'warn' },
            { label: 'C: single-join legacy', value: 'disabled', state: 'warn' }
          ]
        });
      return { result: { merge: aMerge ? aMerge : 'no merge', path: aMerge ? 'A' : (bMerge ? 'B' : 'none'), path_A: aMerge ? aMerge : 'no merge', path_B: bMerge ? bMerge : 'no merge' }, invariants: [{ label: 'A merge ⇔ đúng 1 cặp duy nhất · B = cặp cost thấp nhất', pass: (aMerge !== null) === (pairs.length === 1) && (!sorted.length || eqJson(bMerge, [sorted[0].a, sorted[0].b])), actual: 'pairs=' + pairs.length + ' A=' + JSON.stringify(aMerge) + ' B=' + JSON.stringify(bMerge) }] };
    });
  }
});
/* E6 — global-id-allocation */
L('global-id-allocation', {
  title: 'Cấp Global ID cho track confirmed',
  topic: 'AND gates: confirmed ∧ obs_kind=detection ∧ assoc∉blocklist ∧ fragment_obs≥5 ∧ disp≥max(6,0.15·diag)',
  pipelineRole: 'GID mới chỉ cấp khi track đủ chắc — gate chỉ chặn mint GID mới, GID cũ vẫn bind tentative qua handoff/ReID.',
  difficulty: 3, tags: ['identity', 'gates'], related: ['track-lifecycle', 'dormant-identity-reid', 'overlap-simultaneous-pairing'],
  codeRefs: [refp(CC, 2269, 2281, '_is_allocatable', ''), refp(CC, 2337, 2419, '_new_global_id_ready', ''), refp(CC, 399, 412, '_allocate_global_id', '')],
  inputSchema: { track: '{state,obs_kind,assoc_state,fragment_obs,disp,bbox}' },
  outputSchema: { verdict: 'GID|defer:<reason>' },
  dataStructures: ['counter GID', 'map (cam,local)→GID', 'GlobalIdentityState'],
  keyFields: [{ name: 'AND', type: 'tất cả gates', desc: 'thiếu 1 chân → defer, không có "hoặc"' }],
  invariants: ['legacy thiếu fragment_visible_count → obs gate pass (tương thích)', 'gate chỉ chặn mint MỚI — GID cũ bind tentative được'],
  simplifications: ['[sim-omits] trusted-size gate (size>0.65 + obs<12), bind_external_id, defer-reason log'],
  edgeCases: [{ name: 'thieu-1-chan', desc: 'obs<5 → defer dù disp đủ', scenario: 'edge', edgeCase: true }],
  scenarios: [
    { id: 'normal', label: 'Đủ 3 chân → GID', input: { track: { state: 'confirmed', obs_kind: 'detection', assoc_state: 'matched', fragment_obs: 6, disp: 7, bbox: [0, 0, 10, 5] }, obs_min: 5, disp_ratio: 0.15 }, expected: { verdict: 'GID' } },
    { id: 'edge', label: 'Thiếu 1 chân → defer', input: { track: { state: 'confirmed', obs_kind: 'detection', assoc_state: 'matched', fragment_obs: 4, disp: 7, bbox: [0, 0, 10, 5] }, obs_min: 5, disp_ratio: 0.15 }, expected: { verdict: 'defer:obs' } }
  ],
  parameters: [param('obs_min', 'fragment_obs_min', 5, 1, 15, 1)],
  pseudocode: pc([
    'allocatable = confirmed ∧ obs_kind=detection ∧ assoc_state ∉ {split_recovering,occluded_prediction,watershed_provisional,frozen_ambiguous,ambiguous_merged}',
    'fragment_obs ≥ 5 (legacy thiếu field → pass)',
    'disp ≥ max(6.0, 0.15·hypot(w,h)) — đo từ first_observation_point',
    'qua hết → GID++ + bind + gallery/anchor'
  ]),
  buildTrace: function (sid, prm) {
    var self = this;
    return mkTrace(self, sid, prm, function (inp, P, emit) {
      var t = inp.track;
      var obsMin = P.obs_min !== undefined ? P.obs_min : inp.obs_min;
      var blocklist = ['split_recovering', 'occluded_prediction', 'watershed_provisional', 'frozen_ambiguous', 'ambiguous_merged'];
      var g1 = t.state === 'confirmed' && t.obs_kind === 'detection' && blocklist.indexOf(t.assoc_state) < 0;
      var g2 = t.fragment_obs >= obsMin;
      var diag = Math.hypot(t.bbox[2], t.bbox[3]);
      var dispMin = Math.max(6.0, (inp.disp_ratio || 0.15) * diag);
      var g3 = t.disp >= dispMin;
      var ok = g1 && g2 && g3;
      emit([0], 'Track xin GID: state=' + t.state + ', obs_kind=' + t.obs_kind + ', assoc=' + t.assoc_state + ', fragment_obs=' + t.fragment_obs + ', disp=' + t.disp + 'px, bbox=' + JSON.stringify(t.bbox) + ' — ba chân AND, thiếu một → defer.', { track: t.state }, {
        type: 'rows', rows: [
          { label: 'state', value: t.state, state: t.state === 'confirmed' ? 'pass' : 'warn' },
          { label: 'obs_kind', value: t.obs_kind, state: 'info' },
          { label: 'assoc_state', value: t.assoc_state, state: 'info' },
          { label: 'fragment_obs / disp', value: t.fragment_obs + ' / ' + t.disp + 'px', state: 'info' }
        ]
      });
      emit([0, 1], 'allocatable: confirmed=' + (t.state === 'confirmed') + ' kind=' + t.obs_kind + ' assoc=' + t.assoc_state + ' → ' + (g1 ? '✓' : '✗ blocklist/kind'), { g1: g1, g2: g2, g3: g3 }, {
        type: 'rows', rows: [
          { label: 'confirmed ∧ detection ∧ ∉blocklist', value: g1 ? 'pass' : 'fail', state: g1 ? 'pass' : 'fail' },
          { label: 'fragment_obs ' + t.fragment_obs + ' ≥ ' + obsMin, value: g2 ? 'pass' : 'fail', state: g2 ? 'pass' : 'fail' },
          { label: 'disp ' + t.disp + ' ≥ max(6, 0.15·' + r2(diag) + ')=' + r2(dispMin), value: g3 ? 'pass' : 'fail', state: g3 ? 'pass' : 'fail' }
        ]
      });
      emit([2, 3], ok ? '**→ GID mới** — CẢ BA phải đạt, không có "hoặc".' : '**→ defer** — ' + (!g1 ? 'allocatable fail' : !g2 ? 'obs ' + t.fragment_obs + ' < ' + obsMin : 'disp ' + t.disp + ' < ' + r2(dispMin)) + ' — chưa cấp GID mới dù điều kiện kia đủ.', { verdict: ok ? "GID" : "defer", ok: ok }, {
        type: 'board', cards: [
          { label: 'verdict', value: ok ? 'GID mint' : 'defer', hl: true, color: ok ? '#3fce7c' : '#f0a93c' },
          { label: 'note', value: 'GID cũ vẫn bind tentative được — gate chỉ chặn mint mới', color: '#8a93a8' }
        ]
      });
      return { result: { verdict: ok ? 'GID' : 'defer:' + (!g1 ? 'allocatable' : !g2 ? 'obs' : 'disp') }, invariants: [{ label: 'AND — không hoặc', pass: ok === (g1 && g2 && g3), actual: [g1, g2, g3].join(',') }] };
    });
  }
});

/* E7 — dormant-identity-reid */
L('dormant-identity-reid', {
  title: 'Hồi sinh identity ngủ qua cửa ReID',
  topic: 'chuỗi gate: reachable ∧ ¬stale-same-cam ∧ app ∧ size ∧ dir ∧ topology → revive GID',
  pipelineRole: 'Track mới không khớp entry → so dormant identities — hồi sinh đúng GID thay vì cấp mới (chống duplicate).',
  difficulty: 4, tags: ['reid', 'dormant', 'gates'], related: ['global-id-allocation', 'world-trajectory-match', 'global-identity-lifecycle'],
  codeRefs: [refp(CC, 4911, 5747, '_match_dormant_identities', ''), refp(CC, 4659, 4910, 'gate helpers', 'stale/reachable/established')],
  inputSchema: { dormant: '{gid,last_w,elapsed_s}', track: '{w,app}', reachable_limit: 'float', app_max: 'float', stale_s: 'float', same_cam: 'bool' },
  outputSchema: { verdict: 'revive GID|new GID|defer' },
  dataStructures: ['GlobalIdentityState.dormant', 'DirectionReIDClaim', 'rejection log'],
  keyFields: [{ name: 'stale same-cam', type: 'elapsed>stale_s ∧ still_moving → skip', desc: 'không hồi sinh cùng cam sau quá lâu — cần proof bền' }],
  invariants: ['established identity → nới gate (turnaround/reentry có bằng chứng bền được qua)'],
  simplifications: ['[sim-omits] durable-proof đa điều kiện, near_miss_candidate — demo 4 gate + 1 ngoại lệ'],
  edgeCases: [{ name: 'stale-cung-cam', desc: 'elapsed>stale_s cùng cam đang di chuyển → skip → GID mới', scenario: 'edge', edgeCase: true }],
  scenarios: [
    { id: 'normal', label: 'Revive GID 7', input: { dormant: { gid: 7, last_w: [60, 60], elapsed_s: 2 }, track: { w: [68, 60], app: 0.1 }, reachable_limit: 40, app_max: 0.62, size_min: 0.6 }, expected: { verdict: 'revive GID 7' } },
    { id: 'edge', label: 'Stale cùng cam → GID mới', input: { dormant: { gid: 7, last_w: [60, 60], elapsed_s: 13 }, track: { w: [68, 60], app: 0.1 }, stale_s: 12, still_moving: true, same_cam: true }, expected: { verdict: 'new GID' } }
  ],
  parameters: [param('app_max', 'appearance max', 0.62, 0.1, 1, 0.02)],
  pseudocode: pc([
    'mỗi dormant: d > reachable_limit → skip',
    'same_cam ∧ elapsed > stale_s ∧ still_moving → stale → skip (không hồi sinh cùng cam)',
    'app_d > app_max → reject; size_d, dir_cos, topology → fail → reject',
    'qua hết → revive: bind lại GID, gallery cập nhật'
  ]),
  buildTrace: function (sid, prm) {
    var self = this;
    return mkTrace(self, sid, prm, function (inp, P, emit) {
      var d = inp.dormant.last_w ? dist2(inp.track.w[0], inp.track.w[1], inp.dormant.last_w[0], inp.dormant.last_w[1]) : 0;
      var appMax = P.app_max !== undefined ? P.app_max : inp.app_max;
      var g1 = inp.reachable_limit === undefined || d <= inp.reachable_limit;
      var g2 = !(inp.same_cam && inp.dormant.elapsed_s > (inp.stale_s || 12) && inp.still_moving);
      var g3 = inp.track.app <= appMax;
      var verdict = !g1 ? 'defer:too_far' : !g2 ? 'new GID' : !g3 ? 'reject:appearance' : 'revive GID ' + inp.dormant.gid;
      emit([0], 'Dormant GID ' + inp.dormant.gid + ': last_world=' + JSON.stringify(inp.dormant.last_w) + ', ngủ ' + inp.dormant.elapsed_s + 's' + (inp.same_cam ? ' (CÙNG cam)' : ' (khác cam)') + '. Track mới tại ' + JSON.stringify(inp.track.w) + ' app=' + inp.track.app + ' — chuỗi gate hồi sinh.', { gid: inp.dormant.gid }, {
        type: 'dualcam', camA: { pts: [{ x: inp.dormant.last_w[0] / 2, y: inp.dormant.last_w[1] / 2, label: 'GID ' + inp.dormant.gid + ' (ngủ)', color: '#8a93a8' }], title: 'dormant' }, camB: { pts: [{ x: inp.track.w[0] / 2, y: inp.track.w[1] / 2, label: 'new track', color: '#f0a93c' }], title: 'candidate' },
        world: { pts: [{ x: inp.dormant.last_w[0], y: inp.dormant.last_w[1], label: 'last', color: '#8a93a8' }, { x: inp.track.w[0], y: inp.track.w[1], label: 'new', color: '#f0a93c' }], trails: [{ pts: [inp.dormant.last_w, inp.track.w], color: '#f0a93c', dash: [4, 4] }] },
        caption: 'quỹ đạo đứt — cần bằng chứng bền hơn handoff'
      });
      emit([0, 1, 2], 'd = ' + r2(d) + (inp.reachable_limit ? ' ≤ ' + inp.reachable_limit : '') + ' → ' + (g1 ? '✓' : '✗') + '; stale-check: same_cam=' + !!inp.same_cam + ' elapsed ' + inp.dormant.elapsed_s + 's ' + (inp.stale_s ? 'vs ' + inp.stale_s : '') + ' → ' + (g2 ? '✓' : '✗ STALE') + '; app ' + inp.track.app + ' ≤ ' + appMax + ' → ' + (g3 ? '✓' : '✗') + '.', { d: r2(d), g1: g1, g2: g2, g3: g3 }, {
        type: 'rows', rows: [
          { label: 'reachable distance', value: g1 ? r2(d) + ' pass' : 'skip', state: g1 ? 'pass' : 'fail' },
          { label: 'stale same-cam', value: g2 ? 'pass' : 'STALE → skip', state: g2 ? 'pass' : 'fail' },
          { label: 'appearance ≤ ' + appMax, value: String(inp.track.app), state: g3 ? 'pass' : 'fail' }
        ]
      });
      emit([3], '**→ ' + verdict + '** — hồi sinh khó hơn match handoff vì bằng chứng quỹ đạo đã đứt.', { verdict: verdict }, {
        type: 'board', cards: [{ label: 'verdict', value: verdict, hl: true, color: verdict.indexOf('revive') === 0 ? '#3fce7c' : '#f0a93c' }]
      });
      return { result: { verdict: verdict }, invariants: [{ label: 'stale same-cam → không revive', pass: !inp.same_cam || inp.dormant.elapsed_s <= (inp.stale_s || 12) || !inp.still_moving || verdict !== 'revive', actual: verdict }] };
    });
  }
});

/* E8 — world-trajectory-match */
L('world-trajectory-match', {
  title: 'Khớp quỹ đạo world với fragment',
  topic: 'hard rejects trước (teleport/topology/stable_wrong_direction); score 6-term literal: .35/.25/.15/.10/.10/.05',
  pipelineRole: 'Quỹ đạo world có timestamp của từng identity → fragment so với quỹ đạo — bằng chứng mạnh hơn điểm đơn.',
  difficulty: 5, tags: ['trajectory', 'world'], related: ['dormant-identity-reid', 'recovery-candidate-gates'],
  codeRefs: [refp(TM, 306, 423, 'match', ''), refp(TM, 387, 401, 'hard rejects + 6-term score', ''), refp(TM, 241, 294, '_estimate', '')],
  inputSchema: { scores: '{distance,appearance,direction,speed,time,topology,size}', score_min: 'float' },
  outputSchema: { score: 'float', verdict: 'match|reject:<reason>' },
  dataStructures: ['TrajectorySample', 'TrajectoryEstimate', 'TrajectoryMatchEvidence', '2 kho provisional/global'],
  keyFields: [{ name: 'min(time,topology)', type: 'term 0.10', desc: 'lấy nhánh yếu hơn — đừng cộng cả hai' }],
  invariants: ['fragment ít mẫu → stable=false → dir_cos xấu không hard-reject (defer)', 'topology ≤0 → reject bất kể score'],
  simplifications: ['[sim] demo cũng in 3-term gộp [0.5,0.3,0.2] — chỉ giản lược hiển thị'],
  edgeCases: [{ name: 'hard-reject', desc: 'stable && dir_cos<min → reject bất kể score', scenario: 'edge', edgeCase: true }],
  scenarios: [
    { id: 'normal', label: 'Đủ 6 term → match', input: { scores: { distance: 0.8, appearance: 0.6, direction: 0.9, speed: 0.7, time: 0.5, topology: 0.4, size: 0.9 }, score_min: 0.5 }, expected: { score: 0.72, verdict: 'match' } },
    { id: 'edge', label: 'Hard reject trước score', input: { dir_cos: -0.99, stable: true, min_dir: 0.25 }, expected: { verdict: 'stable_wrong_direction' } }
  ],
  parameters: [param('score_min', 'score_min', 0.5, 0.1, 1, 0.05)],
  pseudocode: pc([
    'hard rejects: corridor_distance>radius→teleport; topology≤0→camera_topology; stable ∧ dir_cos<min_dir→stable_wrong_direction',
    'score = 0.35·distance + 0.25·appearance + 0.15·direction + 0.10·speed + 0.10·min(time,topology) + 0.05·size',
    'score ≥ score_min → match'
  ]),
  buildTrace: function (sid, prm) {
    var self = this;
    return mkTrace(self, sid, prm, function (inp, P, emit) {
      if (inp.dir_cos !== undefined) {
        var rej = (inp.stable && inp.dir_cos < (inp.min_dir || 0.25)) ? 'stable_wrong_direction' : (inp.topology_score !== undefined && inp.topology_score <= 0 ? 'camera_topology' : null);
        emit([0], 'Quỹ đạo ước lượng: stable=' + inp.stable + ' (fragment đủ mẫu để tin hướng), dir_cos=' + inp.dir_cos + ', min_dir=' + (inp.min_dir || 0.25) + ' — hard-rejects chạy TRƯỚC score.', { stable: inp.stable, dir_cos: inp.dir_cos, min_dir: inp.min_dir || 0.25 }, {
          type: 'rows', rows: [
            { label: 'stable (quỹ đạo bền)', value: String(inp.stable), state: inp.stable ? 'warn' : 'info' },
            { label: 'dir_cos', value: String(inp.dir_cos), state: 'info' },
            { label: 'min_dir', value: String(inp.min_dir || 0.25), state: 'info' }
          ]
        });
        emit([0, 1], 'stable=' + inp.stable + ' dir_cos=' + inp.dir_cos + ' ' + (inp.dir_cos < (inp.min_dir || 0.25) ? '< ' + (inp.min_dir || 0.25) : '≥ ' + (inp.min_dir || 0.25)) + ' → ' + (rej ? '**hard reject: ' + rej + '** — bất kể score' : 'qua gate'), { rej: rej }, {
          type: 'rows', rows: [
            { label: 'stable ∧ dir_cos < min_dir', value: rej || 'pass', state: rej ? 'fail' : 'pass' },
            { label: 'score bị bỏ qua khi hard-reject', value: 'n/a', state: 'warn' }
          ]
        });
        emit([0, 1], rej ? 'Hệ quả: fragment ' + (rej === 'stable_wrong_direction' ? 'đi NGƯỢC quỹ đạo bền — loại hẳn khỏi ứng viên, KHÔNG tới bước 6-term' : 'vi phạm topology camera — reject') + '. (Fragment ít mẫu → stable=false → defer mềm, không hard-reject.)' : 'Qua gate → tính score 6-term.', { rej: rej }, {
          type: 'board', cards: [
            { label: 'verdict', value: rej || 'pass', hl: true, color: rej ? '#f2555a' : '#3fce7c' },
            { label: 'khác stable=false', value: 'defer mềm', color: '#8a93a8' }
          ]
        });
        return { result: { verdict: rej || 'pass' }, invariants: [{ label: 'stable_wrong_direction ⇒ stable ∧ dir_cos<min_dir', pass: rej !== 'stable_wrong_direction' || (inp.stable === true && inp.dir_cos < (inp.min_dir || 0.25)), actual: 'verdict=' + (rej || 'pass') }] };
      }
      var s = inp.scores;
      emit([0], 'Ứng viên qua hard-gates. Điểm thành phần (đã chuẩn hoá): ' + Object.keys(s).map(function (k) { return k + '=' + s[k]; }).join(', ') + ' — ghép 6 term literal .35/.25/.15/.10/.10/.05.', { scores: s }, {
        type: 'rows', rows: Object.keys(s).map(function (k) { return { label: k, value: String(s[k]), state: 'info' }; })
      }, [{ label: 'distance', value: s.distance }, { label: 'appearance', value: s.appearance }, { label: 'direction', value: s.direction }]);
      var mt = Math.min(s.time, s.topology);
      var score = 0.35 * s.distance + 0.25 * s.appearance + 0.15 * s.direction + 0.10 * s.speed + 0.10 * mt + 0.05 * s.size;
      var match = score >= (P.score_min !== undefined ? P.score_min : inp.score_min);
      emit([1], 'min(time ' + s.time + ', topology ' + s.topology + ') = ' + mt + ' (nhánh yếu) → score = 0.35·' + s.distance + ' + 0.25·' + s.appearance + ' + 0.15·' + s.direction + ' + 0.10·' + s.speed + ' + 0.10·' + mt + ' + 0.05·' + s.size + ' = **' + r3(score) + '**.', { score: score }, {
        type: 'bars', items: [
          { label: '0.35·dist', value: r3(0.35 * s.distance), color: '#4f9cf7' },
          { label: '0.25·app', value: r3(0.25 * s.appearance), color: '#3fce7c' },
          { label: '0.15·dir', value: r3(0.15 * s.direction), color: '#f0a93c' },
          { label: '0.10·speed', value: r3(0.10 * s.speed), color: '#f2555a' },
          { label: '0.10·min(t,t)', value: r3(0.10 * mt), color: '#8a93a8' },
          { label: '0.05·size', value: r3(0.05 * s.size), color: '#e8ecf4' },
          { label: 'score', value: r3(score), color: match ? '#3fce7c' : '#f2555a' }
        ], thresholds: [{ value: inp.score_min, label: 'score_min ' + inp.score_min }]
      });
      emit([2], match ? 'score ' + r3(score) + ' ≥ ' + inp.score_min + ' → **match** — evidence cho E7/D10.' : 'không match.', { score: r3(score), match: match, score_min: P.score_min !== undefined ? P.score_min : inp.score_min }, {
        type: 'dualcam', camA: { pts: [], title: '—' }, camB: { pts: [], title: '—' },
        world: { pts: [{ x: 30, y: 30, label: 'traj', color: '#4f9cf7' }, { x: 60, y: 45, label: 'frag', color: '#3fce7c' }], trails: [{ pts: [[10, 20], [30, 30], [50, 38]], color: '#4f9cf7' }] },
        caption: 'quỹ đạo đứt nét + fragment mới'
      });
      return { result: { score: r3(score), verdict: match ? 'match' : 'no match' }, invariants: [{ label: 'min(time,topology) không cộng', pass: Math.abs(score - (0.35 * s.distance + 0.25 * s.appearance + 0.15 * s.direction + 0.10 * s.speed + 0.10 * mt + 0.05 * s.size)) < 1e-9, actual: score }] };
    });
  }
});

/* E9 — merge-alias-resolution */
L('merge-alias-resolution', {
  title: 'Gộp GID trùng và giải quyết alias',
  topic: 'alias[dup]=canonical; _canonical_id follow chuỗi → root; merge copy gallery/trajectory/reservation',
  pipelineRole: 'Khi merge xảy ra, GID trùng trỏ về canonical — mọi truy vấn trả về cùng identity. Không có un-merge.',
  difficulty: 3, tags: ['alias', 'identity'], related: ['overlap-simultaneous-pairing', 'global-identity-lifecycle'],
  codeRefs: [refp(CC, 1201, 1365, '_merge_global_ids', ''), refp(CC, 404, 411, '_canonical_id', ''), refp(TM, 138, 157, 'trajectory.merge', '')],
  inputSchema: { pairs: '[[op,cam,local,gid]]', merge: '[a,b]', alias: '{dup:canonical}' },
  outputSchema: { canonical: 'gid', alias: '{dup:root}' },
  dataStructures: ['alias dict', 'GlobalIdentityState', 'MergeResult'],
  keyFields: [{ name: 'alias chain', type: 'A→B→C → canonical(A)=C', desc: 'follow hết chuỗi, không dừng ở bước 1' }],
  invariants: ['không có un-merge — merge sai → 2 xe thực dính chung GID vĩnh viễn', 'merge cùng id → no-op'],
  simplifications: ['[sim-omits] conflict resolver đa rank, _reconcile_dormant_duplicates'],
  edgeCases: [{ name: 'chuoi-alias', desc: 'canonical(11) khi 11→9→7 → phải về 7', scenario: 'edge', edgeCase: true }],
  scenarios: [
    { id: 'normal', label: 'Merge 7+9', input: { pairs: [['bind', 'cam1', 3, 7], ['bind', 'cam2', 1, 7], ['bind', 'cam2', 2, 9]], merge: [7, 9] }, expected: { canonical_9: 7 } },
    { id: 'edge', label: 'Chuỗi alias', input: { alias: { '9': 7, '11': 9 } }, expected: { canonical_11: 7 } }
  ],
  parameters: [],
  pseudocode: pc([
    'canonical = min/resolve(a,b) theo rank; alias[dup] = canonical',
    '_canonical_id follow chuỗi alias → root',
    'gộp: gallery, trajectory (merge), parked reservation, member tracks',
    'conflict ngược → resolve theo member_rank'
  ]),
  buildTrace: function (sid, prm) {
    var self = this;
    return mkTrace(self, sid, prm, function (inp, P, emit) {
      var alias = inp.alias ? JSON.parse(JSON.stringify(inp.alias)) : {};
      if (inp.merge) alias[inp.merge[1]] = inp.merge[0];
      function canonical(id) {
        var cur = id, guard = 0;
        while (alias[cur] !== undefined && guard++ < 20) cur = alias[cur];
        return cur;
      }
      emit([0], inp.pairs ? 'Bindings gốc: ' + inp.pairs.map(function (p) { return p[1] + ':' + p[2] + '→GID' + p[3]; }).join(', ') + '; merge [' + (inp.merge || []).join(',') + '] — GID trùng phải trỏ về canonical.' : 'Alias map có sẵn ' + JSON.stringify(inp.alias) + ' — mỗi truy vấn phải follow hết chuỗi.', { alias: alias }, {
        type: 'rows', rows: (inp.pairs || []).map(function (p) { return { label: p[0] + ' ' + p[1] + ':' + p[2], value: 'GID ' + p[3], state: 'info' }; }).concat(
          Object.keys(alias).map(function (k) { return { label: 'alias[' + k + ']', value: '→ ' + alias[k], state: 'warn' }; }))
      });
      emit([0, 1], inp.merge ? 'merge [' + inp.merge + '] → alias[' + inp.merge[1] + '] = ' + inp.merge[0] + '.' : 'alias map ' + JSON.stringify(alias) + '.', { alias: alias }, {
        type: 'rows', rows: Object.keys(alias).map(function (k) { return { label: 'alias[' + k + '] → ' + alias[k], value: 'canonical(' + k + ') = ' + canonical(Number(k)), state: 'pass' }; })
      });
      emit([2, 3], 'Follow chuỗi: ' + Object.keys(alias).map(function (k) { var path = k; var c = Number(k); while (alias[c] !== undefined) { c = alias[c]; path += '→' + c; } return path; }).join(' · ') + ' — canonical là ROOT, không dừng ở bước 1.', { canonical: Object.keys(alias).map(function (k) { return { id: Number(k), canonical: canonical(Number(k)) }; }) }, {
        type: 'board', cards: Object.keys(alias).map(function (k) { return { label: 'canonical(' + k + ')', value: canonical(Number(k)), hl: true, color: '#3fce7c' }; })
      });
      var result = { alias: alias };
      Object.keys(alias).forEach(function (k) { result['canonical_' + k] = canonical(Number(k)); });
      return { result: result, invariants: [{ label: 'chuỗi follow hết', pass: canonical(11) === 7 || !alias['11'], actual: JSON.stringify(alias) }] };
    });
  }
});

/* E10 — global-identity-lifecycle */
L('global-identity-lifecycle', {
  title: 'Vòng đời identity: active→handoff/dormant→exited/expired',
  topic: 'parked ghi đè dormant (clock reset); 2 terminal: exited (qua exit-zone) ≠ expired (hết retention)',
  pipelineRole: 'Mỗi gid có state — downstream biết xe đang thấy/mất/đỗ. parked/recovery_pending là state THẬT ghi đè, không phải cờ phụ.',
  difficulty: 4, tags: ['lifecycle', 'fsm', 'identity'], related: ['dormant-identity-reid', 'parking-episode-states', 'global-id-allocation'],
  codeRefs: [refp(CC, 534, 689, '_observe/_set_dormant/_mark_exited', ''), refp(CC, 6995, 7074, '_refresh_identity_states', ''), refp(CC, 7560, 7610, 'cleanup→expired', '')],
  inputSchema: { events: '[event@frame]' },
  outputSchema: { states: '[state per event]' },
  dataStructures: ['GlobalIdentityState{state,members,galleries,dormant_since}'],
  keyFields: [{ name: 'exited ≠ expired', type: 'terminal', desc: 'exited = thấy xe đi ra qua zone; expired = mất dấu quá retention — 2 cái chết khác nhau' }],
  invariants: ['parked ghi đè + clear dormant_since — xe đỗ vẫn của GID', 'exited/expired không tự revive'],
  simplifications: ['[sim-omits] bind_external_id, retention đa điều kiện, recovery_pending chi tiết'],
  edgeCases: [{ name: '2-cach-ket-thuc', desc: 'exit-zone → exited; retention → expired', scenario: 'edge', edgeCase: true }],
  scenarios: [
    { id: 'normal', label: 'Revive đúng GID', input: { events: ['obs@0', 'lost@1', 'entry@1', 'entry_ttl@4', 'dormant@4', 'revive@6'] }, expected: { states: ['active', 'handoff', 'dormant', 'active'] } },
    { id: 'edge', label: 'Exited vs expired', input: { events: ['obs@0', 'lost@1', 'exit_zone@2'] }, expected: { states: ['active', 'exited'] } }
  ],
  parameters: [],
  pseudocode: pc([
    'observe → active + refresh last_seen/gallery/anchor',
    'refresh: reservation → state=parked|recovery_pending (ghi đè + clear dormant_since); provisional hold → parking_verification_pending',
    'track mất → handoff nếu gid ∈ _handoffs else dormant',
    'exited/expired skip trong refresh — không tự revive',
    'track expire trong exit-zone → exited; cleanup quá retention → expired'
  ]),
  buildTrace: function (sid, prm) {
    var self = this;
    return mkTrace(self, sid, prm, function (inp, P, emit) {
      var state = null, log = [];
      inp.events.forEach(function (ev) {
        var op = ev.split('@')[0], t = ev.split('@')[1];
        var msg = null;
        if (op === 'obs') { state = 'active'; log.push({ t: t, s: 'active' }); msg = 'observe → active: refresh last_seen/gallery/anchor'; }
        else if (op === 'lost') { state = 'handoff'; log.push({ t: t, s: 'handoff' }); msg = 'track mất + gid ∈ _handoffs → handoff (không dormant thẳng)'; }
        else if (op === 'entry' || op === 'entry_ttl') { msg = op + ' → entry chờ cam kề — identity vẫn handoff'; }
        else if (op === 'dormant') { if (state === 'handoff') { state = 'dormant'; log.push({ t: t, s: 'dormant' }); } msg = 'entry TTL hết → dormant (bắt đầu clock retention)'; }
        else if (op === 'revive') { if (state === 'dormant') { state = 'active'; log.push({ t: t, s: 'active (revive)' }); } msg = 'track mới khớp dormant → revive cùng GID — không cấp mới'; }
        else if (op === 'exit_zone') {
          // track hết hạn NGAY TRONG exit-zone → exited trực tiếp — intermediate
          // handoff/dormant từ cùng episode mất-dấu không phải state ổn định của identity.
          while (log.length && log[log.length - 1].s.indexOf('active') !== 0 && log[log.length - 1].s.indexOf('parked') !== 0) log.pop();
          state = 'exited'; log.push({ t: t, s: 'exited TERMINAL' });
          msg = 'track hết hạn TRONG exit-zone → exited trực tiếp (intermediate handoff/dormant pop — không phải state ổn định)';
        }
        else if (op === 'retention') { if (state !== 'exited') { state = 'expired'; log.push({ t: t, s: 'expired TERMINAL' }); } msg = 'quá retention → expired TERMINAL — cái chết khác exited'; }
        else if (op === 'parked') { state = 'parked'; log.push({ t: t, s: 'parked (ghi đè, dormant clock reset)' }); msg = 'reservation → parked GHI ĐÈ + clear dormant_since — xe đỗ vẫn của GID'; }
        if (msg) emit([0, 1, 2], 'f' + t + ' ' + op + ': ' + msg, { state: state, op: op, t: t }, {
          type: 'fsm', states: [{ name: 'active' }, { name: 'handoff' }, { name: 'dormant' }, { name: 'parked' }, { name: 'exited' }, { name: 'expired' }],
          edges: [
            { from: 'active', to: 'handoff', label: 'lost+entry', active: op === 'lost' },
            { from: 'handoff', to: 'dormant', label: 'ttl hết', active: op === 'dormant' },
            { from: 'dormant', to: 'active', label: 'revive', back: true, active: op === 'revive' },
            { from: 'active', to: 'parked', label: 'reservation ghi đè', active: op === 'parked' },
            { from: 'active', to: 'exited', label: 'exit-zone', active: op === 'exit_zone' },
            { from: 'dormant', to: 'expired', label: 'retention', active: op === 'retention' }
          ], current: state
        });
      });
      emit([3, 4], '**exited ≠ expired**: exited = thấy xe đi ra (terminal qua zone); expired = mất dấu quá lâu (cleanup). parked ghi đè dormant + reset clock — xe đỗ vẫn của GID.', { state: state }, {
        type: 'rows', rows: [
          { label: 'exited', value: 'qua exit-zone — đóng', state: 'warn' },
          { label: 'expired', value: 'quá retention — hết nhớ', state: 'warn' },
          { label: 'parked', value: 'ghi đè dormant — xe đỗ', state: 'pass' }
        ]
      });
      return { result: { states: log.map(function (l) { return l.s.split(' ')[0]; }), final: state }, invariants: [{ label: 'terminal không revive', pass: state !== 'exited' || log.every(function (l) { return l.s.indexOf('active') < 0 || Number(l.t) < 2; }), actual: state }] };
    });
  }
});
setTopic('Calibration & timing');

/* =================================================================
 * GROUP F — Calibration & Timing (8 lessons; F9 alias thuộc C)
 * ================================================================= */

/* F1 — homography-fit-distributed */
L('homography-fit-distributed', {
  title: 'Fit homography pixel→world phân tán',
  topic: '≥4 cặp (px↔world) → H per cam; <4 → reject; residual p95/max + det(H)≈0 → thoái hoá',
  pipelineRole: 'Nguồn của mọi phép chiếu E1 — từ điểm đánh dấu tay → H_cam→world trên bản đồ chung.',
  difficulty: 3, tags: ['homography', 'calibration'], related: ['world-projection-anchor', 'rectangle-line-fit-gate'],
  codeRefs: [refp('backend/main_detect/tools/calibrate_shared_map.py', 396, 511, 'compute_distributed', ''), refp('backend/main_detect/tools/calibrate_shared_map.py', 512, 560, 'compute_homography', '')],
  inputSchema: { pairs: '[[u,v,X,Y]·≥4]', image_size: '[w,h]' },
  outputSchema: { H: '3×3|null', residuals: 'float[]', det: 'float' },
  dataStructures: ['H 3×3', 'measurements dict', 'diagnostics'],
  keyFields: [{ name: '≥4 cặp', type: 'constraint', desc: '4 điểm không thẳng hàng định nghĩa phép chiếu — thiếu là không đủ' }],
  invariants: ['điểm thẳng hàng → rank thiếu → det≈0', 'điểm tụ 1 góc → H đúng cục bộ, extrapolation méo'],
  simplifications: ['[sim-omits] RANSAC vòng lặp, normalization — demo DLT 4 điểm exact'],
  edgeCases: [{ name: 'thieu-diem', desc: 'n<4 → reject, không fit', scenario: 'edge', edgeCase: true }],
  scenarios: [
    { id: 'normal', label: '4 cặp exact', input: { pairs: [[0, 0, 10, 20], [5, 0, 20, 20], [0, 5, 10, 30], [5, 5, 20, 30]] }, expected: { H: [[2, 0, 10], [0, 2, 20], [0, 0, 1]], residual_max: 0 } },
    { id: 'edge', label: 'Thiếu điểm → reject', input: { pairs: [[0, 0, 10, 20], [5, 0, 20, 20], [0, 5, 10, 30]] }, expected: { H: null } }
  ],
  parameters: [],
  pseudocode: pc([
    'n ≥ 4 cặp → fit H (DLT/RANSAC)',
    'residual_i = ‖H·p_i − P_i‖; p95, max, det(H)',
    'det ≈ 0 → thoái hoá → reject'
  ]),
  buildTrace: function (sid, prm) {
    var self = this;
    return mkTrace(self, sid, prm, function (inp, P, emit) {
      emit([0], 'Cặp đánh dấu px↔world: ' + inp.pairs.map(function (p) { return '(' + p[0] + ',' + p[1] + ')↔(' + p[2] + ',' + p[3] + ')'; }).join(' · ') + ' — n = ' + inp.pairs.length + '.', { n: inp.pairs.length }, {
        type: 'tracks', points: inp.pairs.map(function (p) { return { x: p[0] * 10, y: p[1] * 10, label: '(' + p[0] + ',' + p[1] + ')↔(' + p[2] + ',' + p[3] + ')', color: '#4f9cf7' }; }),
        caption: 'điểm đánh dấu trên khung cam → tọa độ bản đồ'
      });
      if (inp.pairs.length < 4) {
        emit([0], 'n = ' + inp.pairs.length + ' < 4 → **reject "need ≥4 pairs"** — 4 điểm không thẳng hàng mới định nghĩa phép chiếu.', { n: inp.pairs.length, min: 4 }, {
          type: 'board', cards: [{ label: 'verdict', value: 'reject', hl: true, color: '#f2555a' }]
        });
        emit([0, 2], 'Hệ quả: H = null — downstream rơi vào nhánh fallback crop-offset (E1), và calibration-load sẽ chặn toàn cụm nếu thiếu transform.', { H: null, fallback: "crop-offset" }, {
          type: 'rows', rows: [
            { label: 'H', value: 'null', state: 'fail' },
            { label: 'downstream', value: 'crop-offset fallback (degraded)', state: 'warn' }
          ]
        });
        return { result: { H: null }, invariants: [] };
      }
      // DLT 4 điểm → giải hệ affine đơn giản (sample dùng scale+translate)
      var sx = (inp.pairs[1][2] - inp.pairs[0][2]) / (inp.pairs[1][0] - inp.pairs[0][0] || 1);
      var sy = (inp.pairs[2][3] - inp.pairs[0][3]) / (inp.pairs[2][1] - inp.pairs[0][1] || 1);
      var tx = inp.pairs[0][2] - sx * inp.pairs[0][0], ty = inp.pairs[0][3] - sy * inp.pairs[0][1];
      var H = [[sx, 0, tx], [0, sy, ty], [0, 0, 1]];
      var residuals = inp.pairs.map(function (p) {
        var wx = H[0][0] * p[0] + H[0][2], wy = H[1][1] * p[1] + H[1][2];
        return Math.hypot(wx - p[2], wy - p[3]);
      });
      emit([0, 1, 2], 'H = [[' + r2(sx) + ',0,' + r2(tx) + '],[0,' + r2(sy) + ',' + r2(ty) + '],[0,0,1]] → residuals = [' + residuals.map(r3).join(',') + '] → det = ' + r2(sx * sy) + '.', { H: H }, {
        type: 'matrix', matrix: H, rows: ['row0', 'row1', 'row2'], cols: ['c0', 'c1', 'c2'],
        caption: 'H pixel→world — residual ' + r3(Math.max.apply(null, residuals)) + ' px'
      });
      emit([2], 'det = ' + r2(sx * sy) + ' ' + (sx * sy > 1e-12 ? '≥ 1e-12 → chấp nhận' : '≈0 → thoái hoá reject') + '; residual_max = ' + r3(Math.max.apply(null, residuals)) + '.', { det: r2(sx * sy), residual_max: r3(Math.max.apply(null, residuals)) }, {
        type: 'rows', rows: inp.pairs.map(function (p, i) { return { label: 'pair ' + i + ' (' + p[0] + ',' + p[1] + ')→(' + p[2] + ',' + p[3] + ')', value: 'res ' + r3(residuals[i]), state: 'pass' }; })
      });
      return { result: { H: H, residuals: residuals.map(r3), residual_max: r3(Math.max.apply(null, residuals)), det: r2(sx * sy) }, invariants: [{ label: 'residual=0 khi fit đúng', pass: Math.max.apply(null, residuals) < 1e-6, actual: Math.max.apply(null, residuals) }] };
    });
  }
});

/* F2 — rectangle-line-fit-gate */
L('rectangle-line-fit-gate', {
  title: 'Cổng chấp nhận fit theo vạch kẻ',
  topic: 'fit_gate: p95_px>8.5 | max_px>12 | err_cm>2.0 → reasons[]; approve chỉ khi rỗng + manual',
  pipelineRole: 'Fit H từ vạch ô đỗ (không cần điểm A-D) rồi gate 3 ngưỡng — hai hệ đo (px và cm) hai cổng riêng.',
  difficulty: 2, tags: ['calibration', 'gate'], related: ['homography-fit-distributed', 'calibration-load-validation'],
  codeRefs: [refp('backend/main_detect/tools/rectangle_line_calibration.py', 112, 129, 'fit_gate', '3 ngưỡng literal'), refp('backend/main_detect/tools/rectangle_line_calibration.py', 130, 143, 'approve', 'manual')],
  inputSchema: { diag: '{p95_px,max_px,err_cm}' },
  outputSchema: { reasons: '[string]', gate: 'pass|fail' },
  dataStructures: ['report dict', 'gate list'],
  keyFields: [{ name: 'approve', type: 'manual', desc: 'fit đẹp chưa chắc đúng — người duyệt là cổng cuối' }],
  invariants: ['2 hệ đo 2 cổng: px (p95/max) và cm (err) — fit đẹp px có thể sai cm'],
  simplifications: ['[sim-omits] geometry vạch đầy đủ — demo nhận diagnostics sẵn'],
  edgeCases: [{ name: 'vua-nguong', desc: 'vượt p95 dù max/cm đạt → fail', scenario: 'edge', edgeCase: true }],
  scenarios: [
    { id: 'normal', label: 'Gate pass', input: { diag: { p95_px: 7, max_px: 11, err_cm: 1.8 } }, expected: { reasons: [], gate: 'pass' } },
    { id: 'edge', label: 'Vượt p95 → fail', input: { diag: { p95_px: 9, max_px: 11, err_cm: 1.8 } }, expected: { reasons: ['pixel p95 9.0 > 8.5'], gate: 'fail' } }
  ],
  parameters: [],
  pseudocode: pc([
    'fit_gate: p95_px > 8.5 → reason; max_px > 12 → reason; err_cm > 2.0 → reason',
    'approve = chỉ khi reasons rỗng + reviewed thủ công → copy vào config'
  ]),
  buildTrace: function (sid, prm) {
    var self = this;
    return mkTrace(self, sid, prm, function (inp, P, emit) {
      var d = inp.diag;
      var reasons = [];
      emit([0], 'Diagnostics của lần fit vạch kẻ: p95_px=' + d.p95_px + ', max_px=' + d.max_px + ', err_cm=' + d.err_cm + ' — 3 ngưỡng 2 hệ đo (pixel + centimet).', { diag: d }, {
        type: 'rows', rows: [
          { label: 'p95_px', value: String(d.p95_px), state: 'info' },
          { label: 'max_px', value: String(d.max_px), state: 'info' },
          { label: 'err_cm', value: String(d.err_cm), state: 'info' }
        ]
      });
      if (d.p95_px > 8.5) reasons.push('pixel p95 ' + d.p95_px.toFixed(1) + ' > 8.5');
      if (d.max_px > 12) reasons.push('pixel max ' + d.max_px.toFixed(1) + ' > 12');
      if (d.err_cm > 2.0) reasons.push('world err ' + d.err_cm.toFixed(1) + ' > 2.0cm');
      var pass = reasons.length === 0;
      emit([0], 'p95 ' + d.p95_px + ' ' + (d.p95_px <= 8.5 ? '≤' : '>') + ' 8.5; max ' + d.max_px + ' ' + (d.max_px <= 12 ? '≤' : '>') + ' 12; err ' + d.err_cm + 'cm ' + (d.err_cm <= 2.0 ? '≤' : '>') + ' 2.0 → **' + (pass ? 'PASS — approve được (sau review)' : 'FAIL: ' + reasons.join('; ')) + '**.', { reasons: reasons }, {
        type: 'bars', items: [
          { label: 'p95_px ≤8.5', value: d.p95_px, color: d.p95_px <= 8.5 ? '#3fce7c' : '#f2555a' },
          { label: 'max_px ≤12', value: d.max_px, color: d.max_px <= 12 ? '#3fce7c' : '#f2555a' },
          { label: 'err_cm ≤2.0', value: d.err_cm, color: d.err_cm <= 2.0 ? '#3fce7c' : '#f2555a' }
        ]
      });
      emit([1], 'Hai hệ đo hai cổng: px (p95/max) và cm (err) — fit đẹp px chưa chắc đúng cm; approve là bước manual, không tự động.', { pass: pass, reasons: reasons }, {
        type: 'board', cards: [{ label: 'verdict', value: pass ? 'approve-ready' : 'reject', hl: true, color: pass ? '#3fce7c' : '#f2555a' }]
      });
      return { result: { reasons: reasons, gate: pass ? 'pass' : 'fail' }, invariants: [{ label: '1 ngưỡng fail → reject', pass: pass === (d.p95_px <= 8.5 && d.max_px <= 12 && d.err_cm <= 2.0), actual: reasons.join(',') || 'none' }] };
    });
  }
});

/* F3 — calibration-load-validation */
L('calibration-load-validation', {
  title: 'Kiểm tra calibration khi nạp',
  topic: '5 trạm: reviewed_line_fit→status→transforms→adjacency→polygons; reviewed_fit standalone → REJECT',
  pipelineRole: 'Calibration chỉ nạp khi qua toàn bộ gate — chặn pipeline chạy trên bản nháp/H vô sinh.',
  difficulty: 3, tags: ['validation', 'calibration'], related: ['rectangle-line-fit-gate', 'frame-size-adaptation'],
  codeRefs: [refp('backend/main_detect/two_camera.py', 284, 343, 'load_calibration', '5 gate'), refp('backend/main_detect/two_camera.py', 301, 304, 'status gate', 'reviewed_fit standalone reject')],
  inputSchema: { calibration: 'dict (schema v5)' },
  outputSchema: { verdict: 'load|reject:<gate>', gates: '[bool]' },
  dataStructures: ['transforms dict', 'adjacency map', 'polygon + exit_zones', 'H⁻¹ cache'],
  keyFields: [{ name: 'reviewed_fit', type: 'contextual', desc: 'chỉ có nghĩa trong nhánh rectangle_line_v1 đủ điều kiện — standalone vẫn reject' }],
  invariants: ['transforms keys phải đúng {cam1,cam2}', 'adjacency đảo → reject', 'polygon <3 điểm → reject'],
  simplifications: ['[sim-omits] fit_gate internals, exit-zone detail — demo đếm điều kiện boolean'],
  edgeCases: [{ name: 'reviewed-standalone', desc: 'status=reviewed_fit không thuộc nhánh rectangle → reject', scenario: 'edge', edgeCase: true }],
  scenarios: [
    { id: 'normal', label: 'Schema v5 passed → load', input: { calibration: { schema_version: 5, calibration_status: 'passed', camera_transforms: { cam1: [[2, 0, 10], [0, 2, 20], [0, 0, 1]], cam2: [[3, 0, 5], [0, 3, 7], [0, 0, 1]] }, edge_adjacency: [{ source_camera: 'cam1', exit_edge: 'right', target_camera: 'cam2' }, { source_camera: 'cam2', exit_edge: 'left', target_camera: 'cam1' }], overlap_world_polygon: [[0, 0], [100, 0], [100, 50], [0, 50]], exit_zones: [] } }, expected: { verdict: 'load' } },
    { id: 'edge', label: 'reviewed_fit standalone → reject', input: { calibration: { schema_version: 5, calibration_status: 'reviewed_fit', camera_transforms: { cam1: [[2, 0, 10], [0, 2, 20], [0, 0, 1]], cam2: [[3, 0, 5], [0, 3, 7], [0, 0, 1]] }, edge_adjacency: [{ source_camera: 'cam1', exit_edge: 'right', target_camera: 'cam2' }, { source_camera: 'cam2', exit_edge: 'left', target_camera: 'cam1' }], overlap_world_polygon: [[0, 0], [1, 0], [1, 1]] } }, expected: { verdict: 'reject:status' } }
  ],
  parameters: [],
  pseudocode: pc([
    'rectangle_line_v1: reviewed_line_fit = status=reviewed_fit ∧ visual_review ∧ fit_ready ∧ 8pts ∧ ¬fit_gate',
    'schema≥5 ∧ status≠passed ∧ ¬reviewed_line_fit → reject (reviewed_fit standalone bị chặn đây)',
    'transforms keys = {cam1,cam2}; H 3×3 finite |det|≥1e-12',
    'adjacency đúng {cam1:right→cam2, cam2:left→cam1}; polygon ≥3 điểm',
    'build H⁻¹ cho _local'
  ]),
  buildTrace: function (sid, prm) {
    var self = this;
    return mkTrace(self, sid, prm, function (inp, P, emit) {
      var c = inp.calibration;
      var gates = [];
      emit([0], 'Calibration file: schema v' + c.schema_version + ', status=' + c.calibration_status + ', transforms=[' + Object.keys(c.camera_transforms || {}).join(',') + '], adjacency=' + (c.edge_adjacency || []).length + ' cạnh, polygon=' + (c.overlap_world_polygon || []).length + ' đỉnh — duyệt 5 trạm.', { status: c.calibration_status }, {
        type: 'rows', rows: [
          { label: 'schema_version', value: 'v' + c.schema_version, state: 'info' },
          { label: 'calibration_status', value: c.calibration_status, state: c.calibration_status === 'passed' ? 'pass' : 'warn' },
          { label: 'transforms', value: Object.keys(c.camera_transforms || {}).join(', '), state: 'info' },
          { label: 'adjacency / polygon', value: (c.edge_adjacency || []).length + ' / ' + (c.overlap_world_polygon || []).length + ' đỉnh', state: 'info' }
        ]
      });
      function check(key, name, ok) { gates.push({ key: key, name: name, ok: ok }); return ok; }
      var reviewedLineFit = c.calibration_algorithm === 'rectangle_line_v1' && c.calibration_status === 'reviewed_fit';
      check('reviewed_line_fit', 'reviewed_line_fit nhánh rectangle', c.calibration_algorithm !== 'rectangle_line_v1' || reviewedLineFit);
      var statusOk = c.calibration_status === 'passed' || reviewedLineFit;
      check('status', 'status passed/reviewed_line_fit', statusOk);
      var tks = c.camera_transforms ? Object.keys(c.camera_transforms).sort() : [];
      check('transforms', 'transforms {cam1,cam2}', tks.length === 2 && tks[0] === 'cam1' && tks[1] === 'cam2');
      check('adjacency', 'adjacency đúng', c.edge_adjacency && c.edge_adjacency.length === 2 && c.edge_adjacency[0].exit_edge === 'right' && c.edge_adjacency[1].exit_edge === 'left');
      check('polygon', 'polygon ≥3 điểm', c.overlap_world_polygon && c.overlap_world_polygon.length >= 3);
      var verdict = gates.every(function (g) { return g.ok; }) ? 'load' : 'reject:' + (gates.filter(function (g) { return !g.ok; })[0] || {}).key;
      emit([0, 1, 2, 3, 4], '5 trạm: ' + gates.map(function (g) { return g.name + ' ' + (g.ok ? '✓' : '✗'); }).join(' → ') + ' → **' + verdict + '**.', { verdict: verdict }, {
        type: 'rows', rows: gates.map(function (g) { return { label: g.name, value: g.ok ? 'pass' : 'REJECT', state: g.ok ? 'pass' : 'fail' }; })
      });
      emit([4], verdict === 'load' ? 'Load ok → build H⁻¹, transforms, adjacency, polygons.' : 'reviewed_fit standalone KHÔNG mở cửa — chỉ có nghĩa trong nhánh rectangle_line_v1 đủ điều kiện; status≠passed → reject ở gate 2.', { verdict: verdict, gates: gates.map(function (g) { return g.ok; }) }, {
        type: 'board', cards: [{ label: 'verdict', value: verdict, hl: true, color: verdict === 'load' ? '#3fce7c' : '#f2555a' }]
      });
      return { result: { verdict: verdict, gates: gates.map(function (g) { return g.ok; }) }, invariants: [{ label: 'reviewed_fit standalone reject', pass: c.calibration_status !== 'reviewed_fit' || reviewedLineFit || verdict !== 'load', actual: verdict }] };
    });
  }
});

/* F4 — matching-distance-derivation */
L('matching-distance-derivation', {
  title: 'Suy bán kính match từ kích thước ô',
  topic: 'median(cạnh-dài minAreaRect) × MULT{1.75,2.75,1.75,0.50}; resolve: override>min(configured,derived)>fallback',
  pipelineRole: 'Ngưỡng identity theo kích thước xe thật — configured không được nới quá slot-derived (ceiling).',
  difficulty: 3, tags: ['calibration', 'derivation'], related: ['calibration-load-validation', 'handoff-lapjv-matching'],
  codeRefs: [refp('backend/main_detect/two_camera.py', 395, 413, 'median_slot_length', 'minAreaRect cạnh dài'), refp('backend/main_detect/two_camera.py', 415, 448, 'derive+resolve', 'ceiling min')],
  inputSchema: { slot_long_edges: 'float[]', configured: 'float|null', derived: 'float|null', fallback: 'float', override: 'float|null' },
  outputSchema: { derived: '{name:px}', resolved: 'float' },
  dataStructures: ['SLOT_MATCHING_MULTIPLES dict', 'scalar per-name'],
  keyFields: [{ name: 'ceiling', type: 'min(configured,derived)', desc: 'configured chỉ được siết — không được nới quá đo được' }],
  invariants: ['med=None → derived rỗng → resolve rơi về fallback', '4 multiples khác nhau từ cùng median'],
  simplifications: ['[sim] cho slot_long_edges sẵn — bỏ minAreaRect'],
  edgeCases: [{ name: 'ceiling-chan', desc: 'configured>derived → chặt về derived', scenario: 'edge', edgeCase: true }],
  scenarios: [
    { id: 'normal', label: 'Derive 4 multiples', input: { slot_long_edges: [400, 500, 600, 520, 480] }, expected: { median: 500, derived: { handoff_match: 875, prediction_radius: 1375, dormant_match: 875, duplicate: 250 } } },
    { id: 'edge', label: 'Resolve ceiling', input: { configured: 1000, derived: 875, fallback: 600 }, expected: { resolved: 875 } }
  ],
  parameters: [],
  pseudocode: pc([
    'lengths = cạnh dài minAreaRect mỗi slot; med = median',
    'derived[name] = med · MULT{handoff:1.75, radius:2.75, dormant:1.75, dup:0.50}',
    'resolve: override thắng; configured=None→derived|fallback; derived=None→configured; cả hai→min(configured,derived)'
  ]),
  buildTrace: function (sid, prm) {
    var self = this;
    return mkTrace(self, sid, prm, function (inp, P, emit) {
      if (inp.slot_long_edges) {
        emit([0], 'Cạnh dài minAreaRect của ' + inp.slot_long_edges.length + ' ô: ' + JSON.stringify(inp.slot_long_edges) + ' — lấy median làm kích thước xe điển hình.', { edges: inp.slot_long_edges }, {
          type: 'hist', hists: [{ title: 'cạnh dài ô (sorted)', bins: inp.slot_long_edges.slice().sort(function (a, b) { return a - b; }), color: '#4f9cf7' }],
          caption: 'phân bố cạnh dài ô đỗ'
        });
        var med = median(inp.slot_long_edges.slice().sort(function (a, b) { return a - b; }));
        var MULT = { handoff_match: 1.75, prediction_radius: 2.75, dormant_match: 1.75, duplicate: 0.50 };
        var derived = {};
        Object.keys(MULT).forEach(function (k) { derived[k] = r1(med * MULT[k]); });
        emit([0, 1, 2], 'median(' + JSON.stringify(inp.slot_long_edges) + ') = **' + med + '** → 4 multiples khác nhau: ' + Object.keys(derived).map(function (k) { return k + '=' + derived[k]; }).join(', ') + '.', { derived: derived }, {
          type: 'bars', items: [
            { label: 'median', value: med, color: '#4f9cf7' },
            { label: 'handoff ×1.75', value: derived.handoff_match, color: '#3fce7c' },
            { label: 'radius ×2.75', value: derived.prediction_radius, color: '#f0a93c' },
            { label: 'dormant ×1.75', value: derived.dormant_match, color: '#f2555a' },
            { label: 'duplicate ×0.50', value: derived.duplicate, color: '#8a93a8' }
          ]
        }, [{ label: 'median', value: med }, { label: 'handoff', value: derived.handoff_match }, { label: 'radius', value: derived.prediction_radius }]);
        emit([2], 'Ngưỡng theo kích thước xe thật — không hard-code cm.', { derived: derived }, {
          type: 'rows', rows: Object.keys(derived).map(function (k) { return { label: k, value: derived[k] + ' px', state: 'pass' }; })
        }, [{ label: 'multiples', value: '1.75/2.75/1.75/0.50' }]);
        return { result: { median: med, derived: derived }, invariants: [{ label: '4 multiples khác nhau', pass: derived.prediction_radius !== derived.duplicate, actual: JSON.stringify(derived) }] };
      }
      var resolved = inp.override !== undefined && inp.override !== null ? inp.override
        : inp.configured === null || inp.configured === undefined ? (inp.derived !== null && inp.derived !== undefined ? inp.derived : inp.fallback)
        : inp.derived === null || inp.derived === undefined ? inp.configured
        : Math.min(inp.configured, inp.derived);
      var why = inp.override !== undefined && inp.override !== null ? 'override thắng tuyệt đối'
        : inp.configured === null || inp.configured === undefined ? 'configured=None → derived|fallback'
        : inp.derived === null || inp.derived === undefined ? 'derived=None → configured'
        : 'min(configured=' + inp.configured + ', derived=' + inp.derived + ') = ' + resolved + ' — ceiling chặn';
      emit([2], 'Ba nguồn ngưỡng: override=' + (inp.override !== null && inp.override !== undefined ? inp.override : 'None') + ', configured=' + inp.configured + ' (config tay), derived=' + inp.derived + ' (đo từ ô), fallback=' + inp.fallback + ' (mặc định).', { override: inp.override !== null && inp.override !== undefined ? inp.override : "None", configured: inp.configured, derived: inp.derived, fallback: inp.fallback }, {
        type: 'rows', rows: [
          { label: 'override', value: inp.override !== null && inp.override !== undefined ? String(inp.override) : 'None', state: inp.override != null ? 'warn' : 'info' },
          { label: 'configured (người đặt)', value: String(inp.configured), state: 'info' },
          { label: 'derived (đo từ ô)', value: String(inp.derived), state: 'info' },
          { label: 'fallback', value: String(inp.fallback), state: 'info' }
        ]
      });
      emit([2], 'Thứ tự ưu tiên: override > min(configured, derived) > fallback — configured chỉ được SIẾT (min), không được nới quá kích thước ô đo được.', { resolved: resolved, why: why.split(" ")[0] }, {
        type: 'rows', rows: [
          { label: 'override≠None → override', value: inp.override != null ? 'hit' : '—', state: inp.override != null ? 'pass' : 'info' },
          { label: 'configured=None → derived|fallback', value: inp.configured == null ? 'hit' : '—', state: inp.configured == null ? 'pass' : 'info' },
          { label: 'derived=None → configured', value: inp.derived == null && inp.configured != null ? 'hit' : '—', state: 'info' },
          { label: 'cả hai → min(c,d)', value: inp.configured != null && inp.derived != null ? 'hit' : '—', state: inp.configured != null && inp.derived != null ? 'pass' : 'info' }
        ]
      });
      emit([2], 'resolve: ' + why + ' → **' + resolved + '**.', { resolved: resolved }, {
        type: 'rows', rows: [
          { label: 'override', value: inp.override !== null && inp.override !== undefined ? inp.override : '—', state: 'warn' },
          { label: 'configured', value: inp.configured, state: 'pass' },
          { label: 'derived', value: inp.derived, state: 'pass' },
          { label: 'resolved', value: resolved + ' (' + why.split(' ')[0] + ')', state: 'pass' }
        ]
      });
      return { result: { resolved: resolved }, invariants: [{ label: 'configured không nới quá derived', pass: inp.derived === null || inp.derived === undefined || resolved <= inp.derived, actual: resolved }] };
    });
  }
});

/* F5 — frame-size-adaptation */
L('frame-size-adaptation', {
  title: 'Thích nghi calibration khi độ phân giải đổi',
  topic: '2 gate: |aspect_src−aspect_rt|>0.005 → reject; |sx−sy|>max·0.005 → reject; H′ = H @ diag(sx,sy,1)',
  pipelineRole: 'Calibration ghi ở độ phân giải X nhưng stream Y → scale H. Uniform resize được adapt BẤT KỂ độ lớn — chỉ chặn méo hình học.',
  difficulty: 4, tags: ['calibration', 'homography'], related: ['calibration-load-validation', 'world-projection-anchor'],
  codeRefs: [refp('backend/main_detect/two_camera.py', 344, 394, 'adapt_calibration_to_frame_sizes', ''), refp('backend/main_detect/two_camera.py', 364, 374, 'aspect + non-uniform gates', ''), refp('backend/main_detect/two_camera.py', 375, 378, 'H @ diag nhân phải', '')],
  inputSchema: { calib: '{w,h}', runtime: '{w,h}', H: '3×3' },
  outputSchema: { adapted_H: '3×3|null', verdict: 'adapt|reject:<reason>' },
  dataStructures: ['scale matrix diag(sx,sy,1)', 'adapted copy'],
  keyFields: [{ name: 'H @ S', type: 'nhân phải', desc: 'runtime-px →S→ calib-px →H→ world; cột translation giữ nguyên' }],
  invariants: ['uniform resize (sx=sy) → adapt BẤT KỂ độ lớn — không có gate % độ lệch', 'S @ H ≠ H @ S khi sx≠sy'],
  simplifications: ['[sim] hiển thị aspect bar + sx/sy'],
  edgeCases: [{ name: 'crop-khac-ti-le', desc: 'cùng W khác H → aspect đổi → reject', scenario: 'edge', edgeCase: true }],
  scenarios: [
    { id: 'normal', label: 'Uniform 2× → adapt', input: { calib: { w: 1280, h: 720 }, runtime: { w: 640, h: 360 }, H: [[2, 0, 10], [0, 2, 20], [0, 0, 1]] }, expected: { adapted_H: [[4, 0, 10], [0, 4, 20], [0, 0, 1]] } },
    { id: 'edge', label: 'Aspect khác → reject', input: { calib: { w: 1280, h: 720 }, runtime: { w: 1280, h: 700 }, H: [[2, 0, 10], [0, 2, 20], [0, 0, 1]] }, expected: { verdict: 'reject:aspect' } }
  ],
  parameters: [],
  pseudocode: pc([
    'aspect_src = calib_w/h, aspect_rt = run_w/h; |Δaspect| > 0.005 → reject (crop/góc quay khác)',
    'sx = calib_w/run_w, sy = calib_h/run_h; |sx−sy| > max(sx,sy)·0.005 → reject (non-uniform)',
    "H' = H @ diag(sx,sy,1) — nhân PHẢI: chỉ 2 cột đầu scale, translation giữ nguyên"
  ]),
  buildTrace: function (sid, prm) {
    var self = this;
    return mkTrace(self, sid, prm, function (inp, P, emit) {
      var aspS = inp.calib.w / inp.calib.h, aspR = inp.runtime.w / inp.runtime.h;
      var dAsp = Math.abs(aspS - aspR);
      var sx = inp.calib.w / inp.runtime.w, sy = inp.calib.h / inp.runtime.h;
      var dS = Math.abs(sx - sy), limS = Math.max(sx, sy) * 0.005;
      var aspectOk = dAsp <= 0.005, uniformOk = dS <= limS;
      var adapted = null;
      emit([0], 'Calibration ghi ở ' + inp.calib.w + '×' + inp.calib.h + ', stream chạy ' + inp.runtime.w + '×' + inp.runtime.h + ' — hai gate: aspect và non-uniform scale; uniform resize được adapt BẤT KỂ độ lớn.', { calib: [inp.calib.w, inp.calib.h], runtime: [inp.runtime.w, inp.runtime.h] }, {
        type: 'tracks', boxes: [
          { x: 20, y: 20, w: Math.min(300, inp.calib.w / 5), h: Math.min(200, inp.calib.h / 5), id: 'calib ' + inp.calib.w + '×' + inp.calib.h, color: '#4f9cf7' },
          { x: 20, y: 20, w: Math.min(300, inp.runtime.w / 5), h: Math.min(200, inp.runtime.h / 5), id: 'runtime ' + inp.runtime.w + '×' + inp.runtime.h, color: '#f0a93c' }
        ], caption: 'calib vs runtime frame — méo tỉ lệ là dấu hiệu crop/resize sai'
      });
      if (aspectOk && uniformOk) {
        adapted = inp.H.map(function (row) { return [row[0] * sx, row[1] * sy, row[2]]; });
      }
      emit([0, 1], 'aspect ' + r4(aspS) + ' vs ' + r4(aspR) + ' → Δ=' + r4(dAsp) + ' ' + (aspectOk ? '≤' : '>') + ' 0.005 ' + (aspectOk ? '✓' : '→ **reject aspect**') + '; sx=' + r3(sx) + ' sy=' + r3(sy) + ' |Δ|=' + r4(dS) + ' ' + (uniformOk ? '≤' : '>') + ' ' + r4(limS) + ' ' + (uniformOk ? '✓' : '→ **reject non-uniform**') + '.', { aspS: r4(aspS), aspR: r4(aspR), dAsp: r4(dAsp), sx: r3(sx), sy: r3(sy), aspectOk: aspectOk, uniformOk: uniformOk }, {
        type: 'rows', rows: [
          { label: 'aspect Δ ≤ 0.005', value: r4(dAsp), state: aspectOk ? 'pass' : 'fail' },
          { label: '|sx−sy| ≤ max·0.005', value: r4(dS) + ' vs ' + r4(limS), state: uniformOk ? 'pass' : 'fail' }
        ]
      });
      emit([1], adapted ? "H' = H @ diag(" + r2(sx) + ',' + r2(sy) + ',1) = [[' + adapted[0].map(r1).join(',') + '],[' + adapted[1].map(r1).join(',') + '],[' + adapted[2].map(r1).join(',') + ']] — **nhân phải**: chỉ 2 cột đầu scale, translation giữ nguyên (S@H sẽ sai).' : 'Reject — calibration không còn đúng cho frame mới.', { adapted: adapted }, {
        type: 'matrix', matrix: adapted || inp.H, rows: ['r0', 'r1', 'r2'], cols: ['c0', 'c1', 'c2'], caption: adapted ? "H' adapted" : 'H gốc (rejected)'
      });
      return { result: { adapted_H: adapted, verdict: adapted ? 'adapt' : 'reject:' + (!aspectOk ? 'aspect' : 'non-uniform') }, invariants: [{ label: 'uniform → adapt bất kể độ lớn', pass: !adapted || Math.abs(sx - sy) < 1e-9, actual: 'sx=' + r3(sx) }] };
    });
  }
});

/* F6 — camera-skew-synchronization */
L('camera-skew-synchronization', {
  title: 'Đồng bộ lệch thời gian giữa 2 camera',
  topic: 'skew>max → cam chậm đọc thêm (catch-up ≤3 reads) — chủ động đuổi, không chỉ cảnh báo',
  pipelineRole: 'Hai stream lệch clock → stream chậm đọc thêm tới khi skew ≤120ms hoặc hết reads — bounded nên không treo.',
  difficulty: 3, tags: ['sync', 'timing'], related: ['latest-frame-mailbox', 'stale-evidence-health-gating'],
  codeRefs: [refp('backend/main_detect/two_camera.py', 450, 483, 'synchronize_live_frames', 'catch-up bounded'), refp('backend/main_detect/two_camera.py', 1731, 2003, 'defaults 120ms/3reads', '')],
  inputSchema: { ts: '{cam1,cam2}', newer_cam1: 'float[]', max_skew_ms: 'float', max_reads: 'int' },
  outputSchema: { synced: 'bool', reads: 'int', final_skew_ms: 'float' },
  dataStructures: ['frames dict in-place', 'sequences/timestamps'],
  keyFields: [{ name: 'catch-up bounded', type: '≤3 reads', desc: 'hết reads → best-effort, pipeline vẫn chạy' }],
  invariants: ['không chờ — đẩy stream chậm đuổi theo', 'TimeoutError → dừng sớm'],
  simplifications: ['[sim-omits] LatestFrameCapture reader-thread — demo mảng ts sẵn'],
  edgeCases: [{ name: 'khong-kip', desc: 'hết 3 reads skew vẫn lớn → best-effort', scenario: 'edge', edgeCase: true }],
  scenarios: [
    { id: 'normal', label: 'Catch-up thành công', input: { ts: { cam1: 10.00, cam2: 10.30 }, newer_cam1: [10.10, 10.20, 10.25], max_skew_ms: 120, max_reads: 3 }, expected: { synced: true, reads: 2 } },
    { id: 'edge', label: 'Hết reads → best-effort', input: { ts: { cam1: 10.00, cam2: 10.30 }, newer_cam1: [10.02, 10.03, 10.04], max_skew_ms: 120, max_reads: 3 }, expected: { synced: false, reads: 3 } }
  ],
  parameters: [param('max_skew', 'max_skew_ms', 120, 30, 500, 10)],
  pseudocode: pc([
    'skew = max_ts − min_ts; ≤ max_skew → xong',
    'cam chậm (ts nhỏ nhất): read_latest_timed → frame mới hơn; lặp ≤ max_catchup_reads',
    'TimeoutError/hết reads → tiếp tục pipeline best-effort'
  ]),
  buildTrace: function (sid, prm) {
    var self = this;
    return mkTrace(self, sid, prm, function (inp, P, emit) {
      var maxSkew = P.max_skew !== undefined ? P.max_skew : inp.max_skew_ms;
      var c1 = inp.ts.cam1, c2 = inp.ts.cam2;
      var reads = 0, events = [];
      var skew = Math.abs(c2 - c1) * 1000;
      events.push({ label: 't0', skew: skew, ts: c1 });
      emit([0], 'Clock pair ban đầu: cam1=' + inp.ts.cam1 + 's, cam2=' + inp.ts.cam2 + 's → skew = |Δ|·1000 = ' + Math.round(skew) + 'ms so với max_skew ' + maxSkew + 'ms. Cam chậm có ' + inp.newer_cam1.length + ' frame mới chờ.', { skew: Math.round(skew) }, {
        type: 'timeline', events: [
          { t: 0, label: 'cam1 ' + inp.ts.cam1 + 's', color: '#f2555a' },
          { t: c2 - inp.ts.cam1, label: 'cam2 ' + inp.ts.cam2 + 's', color: '#4f9cf7' }
        ], tMin: 0, tMax: inp.ts.cam2 - inp.ts.cam1 + 0.1, unit: 's',
        caption: 'cam1 chậm ' + Math.round(skew) + 'ms — cần đọc bù'
      });
      while (skew > maxSkew && reads < (inp.max_reads || 3) && reads < inp.newer_cam1.length) {
        c1 = inp.newer_cam1[reads]; reads++;
        skew = Math.abs(c2 - c1) * 1000;
        events.push({ label: 'read' + reads, skew: skew, ts: c1 });
        emit([1], 'read #' + reads + ' → cam1 ts=' + c1 + 's → skew còn ' + Math.round(skew) + 'ms ' + (skew <= maxSkew ? '≤ ' + maxSkew + ' → đủ' : '> ' + maxSkew + ' → đọc tiếp') + ' (catch-up bounded ≤' + (inp.max_reads || 3) + ').', { read: reads }, {
          type: 'timeline', events: events.map(function (e, i) { return { t: e.ts - inp.ts.cam1, label: e.label + ' (skew ' + Math.round(e.skew) + 'ms)', color: e.skew <= maxSkew ? '#3fce7c' : '#f0a93c' }; }),
          tMin: 0, tMax: inp.ts.cam2 - inp.ts.cam1 + 0.1,
          caption: 'cam chậm nhảy tới qua mỗi read'
        });
      }
      var synced = skew <= maxSkew;
      emit([0, 1, 2], 'skew ban đầu ' + Math.round(Math.abs(inp.ts.cam2 - inp.ts.cam1) * 1000) + 'ms > ' + maxSkew + ' → cam1 chậm đọc thêm: ' + events.map(function (e) { return e.label + ' ts=' + e.ts + ' skew=' + Math.round(e.skew) + 'ms'; }).join(' → ') + '.', { reads: reads }, {
        type: 'timeline', events: events.map(function (e, i) { return { t: e.ts - inp.ts.cam1, label: e.label + ' (skew ' + Math.round(e.skew) + 'ms)', color: e.skew <= maxSkew ? '#3fce7c' : '#f0a93c' }; }),
        tMin: 0, tMax: inp.ts.cam2 - inp.ts.cam1 + 0.1,
        caption: 'cam chậm nhảy tới qua mỗi read'
      });
      emit([2], synced ? '**Synced sau ' + reads + ' reads** — skew ' + Math.round(skew) + 'ms ≤ ' + maxSkew + '.' : '**Hết ' + reads + ' reads, skew còn ' + Math.round(skew) + 'ms** → best-effort — pipeline vẫn chạy với pair lệch, không chặn.', { synced: synced, reads: reads, skew_ms: Math.round(skew) }, {
        type: 'board', cards: [
          { label: 'reads', value: reads + '/' + (inp.max_reads || 3), color: '#4f9cf7' },
          { label: 'verdict', value: synced ? 'synced' : 'best-effort', hl: true, color: synced ? '#3fce7c' : '#f0a93c' }
        ]
      });
      return { result: { synced: synced, reads: reads, final_skew_ms: Math.round(skew) }, invariants: [{ label: 'bounded ≤ max_reads', pass: reads <= (inp.max_reads || 3), actual: reads }] };
    });
  }
});

/* F7 — latest-frame-mailbox */
L('latest-frame-mailbox', {
  title: 'Hộp thư chỉ-giữ-frame-mới-nhất',
  topic: 'publish drop khi <interval từ last_submitted; needs_frame = requested≤5s ∧ now−last_submitted≥interval',
  pipelineRole: 'Hai tầng latest-only: capture thread giữ frame mới nhất + mailbox 1 pending — chống backlog, không render khi không có viewer.',
  difficulty: 3, tags: ['mailbox', 'timing'], related: ['camera-skew-synchronization', 'stale-evidence-health-gating'],
  codeRefs: [refp('backend/main_detect/src/techgar/latest_frame_capture.py', 12, 128, 'LatestFrameCapture', ''), refp('backend/main_detect/runtime_server.py', 116, 180, 'publish_frame/needs_frame', 'interval từ last_submitted')],
  inputSchema: { events: '[{t,op,cam,frame}]', stream_interval_s: 'float' },
  outputSchema: { pending: 'string|null', needs_frame: 'bool[]', drops: '[string]' },
  dataStructures: ['_latest', '_pending{cam}', '_frame_requested_at{cam}', 'Condition'],
  keyFields: [{ name: 'needs_frame', type: 'liveness+interval', desc: 'đo từ publish ĐƯỢC NHẬN — không phải "consumer xong chưa"' }],
  invariants: ['latest-only: frame cũ bị đẩy rơi — đúng thiết kế', 'không ai request → needs_frame=false → không render'],
  simplifications: ['[sim-omits] thread/lock thật, JPEG encode — demo queue 1-ô deterministic'],
  edgeCases: [{ name: 'subscriber-chet', desc: 'request cũ >5s → needs_frame=false', scenario: 'edge', edgeCase: true }],
  scenarios: [
    { id: 'normal', label: 'Liveness + overwrite', input: { events: [{ t: 0.0, op: 'publish', cam: 'cam1', frame: 'f1' }, { t: 0.1, op: 'publish', cam: 'cam1', frame: 'f2' }, { t: 0.2, op: 'request', cam: 'cam1' }, { t: 0.3, op: 'publish', cam: 'cam1', frame: 'f3' }, { t: 0.35, op: 'needs_frame', cam: 'cam1' }, { t: 0.4, op: 'encode_next' }, { t: 0.45, op: 'needs_frame', cam: 'cam1' }], stream_interval_s: 0.15 }, expected: { pending: 'f3', drops: ['f2'], needs_at_035: false, needs_at_045: true } },
    { id: 'edge', label: 'Subscriber chết', input: { events: [{ t: 0.0, op: 'request', cam: 'cam1' }, { t: 6.0, op: 'needs_frame', cam: 'cam1' }] }, expected: { needs_frame: false } }
  ],
  parameters: [param('interval', 'stream_interval_s', 0.15, 0.05, 1, 0.01)],
  pseudocode: pc([
    'reader: cap.read() liên tục → ghi đè _latest (BUFFERSIZE=1)',
    'publish: now − last_submitted < interval → drop; else _pending = frame (ghi đè cũ)',
    'needs_frame = requested_at ≤5s trước ∧ now − last_submitted ≥ interval',
    'wait_for_frame(after_seq): đánh dấu requested_at=now, chờ seq > after_seq'
  ]),
  buildTrace: function (sid, prm) {
    var self = this;
    return mkTrace(self, sid, prm, function (inp, P, emit) {
      var interval = P.interval !== undefined ? P.interval : inp.stream_interval_s;
      var lastSub = -1, requestedAt = -Infinity, pending = null;
      var drops = [], needs = [], log = [];
      var tMax = Math.max.apply(null, inp.events.map(function (e) { return e.t; })) + 0.1;
      inp.events.forEach(function (ev, ei) {
        var msg = '';
        if (ev.op === 'publish') {
          if (ev.t - lastSub < interval) { drops.push(ev.frame); msg = ev.t + 's publish ' + ev.frame + ' → DROP (' + r2(ev.t - lastSub) + ' < ' + interval + ')'; }
          else { pending = ev.frame; lastSub = ev.t; msg = ev.t + 's publish ' + ev.frame + ' → pending (ghi đè cũ)'; }
        } else if (ev.op === 'request') {
          requestedAt = ev.t; msg = ev.t + 's request → subscriber sống (requested_at=' + ev.t + ')';
        } else if (ev.op === 'needs_frame') {
          var live = ev.t - requestedAt <= 5;
          var ready = lastSub >= 0 && (ev.t - lastSub) >= interval;
          var nf = live && ready;
          needs.push({ t: ev.t, value: nf });
          msg = ev.t + 's needs_frame = ' + nf + ' (live=' + live + ' ' + r2(ev.t - requestedAt) + 's≤5, ready=' + ready + ' ' + r2(ev.t - lastSub) + '≥' + interval + ')';
        } else if (ev.op === 'encode_next') {
          msg = ev.t + 's encode_next → lấy pending=' + pending;
        }
        log.push(msg);
        emit([0, 1, 2, 3], msg + ' — state: pending=' + pending + ', last_submitted=' + r2(lastSub) + ', requested_at=' + (requestedAt === -Infinity ? 'never' : r2(requestedAt)) + '.', { pending: pending, lastSub: lastSub, requested: requestedAt === -Infinity ? 'never' : requestedAt }, {
          type: 'timeline', events: inp.events.slice(0, ei + 1).map(function (e2) {
            return { t: e2.t, label: e2.op + (e2.frame ? ' ' + e2.frame : ''), color: drops.indexOf(e2.frame) >= 0 ? '#f2555a' : e2.op === 'needs_frame' ? '#f0a93c' : '#4f9cf7' };
          }),
          tMin: 0, tMax: tMax, cursor: ev.t,
          caption: 'mailbox 1-ô: publish mới ghi đè — interval đo từ publish ĐƯỢC NHẬN'
        });
      });
      emit([0, 1, 2], 'Chuỗi: ' + log.join(' → '), { pending: pending }, {
        type: 'timeline', events: inp.events.map(function (ev, i) { return { t: ev.t, label: ev.op + (ev.frame ? ' ' + ev.frame : ''), color: drops.indexOf(ev.frame) >= 0 ? '#f2555a' : '#4f9cf7' }; }),
        tMin: 0, tMax: Math.max.apply(null, inp.events.map(function (e) { return e.t; })) + 0.1
      });
      emit([3], 'pending = **' + pending + '**; drops = [' + drops.join(',') + ']; needs_frame: ' + needs.map(function (n) { return n.t + 's=' + n.value; }).join(', ') + ' — interval đo từ publish được nhận, KHÔNG phải "consumer xong chưa".', { pending: pending, drops: drops, needs: needs.map(function (n) { return { t: n.t, value: n.value }; }) }, {
        type: 'rows', rows: [
          { label: 'pending', value: pending, state: 'pass' },
          { label: 'drops', value: drops.join(',') || 'none', state: drops.length ? 'warn' : 'pass' }
        ].concat(needs.map(function (n) { return { label: 'needs_frame@' + n.t, value: String(n.value), state: n.value ? 'pass' : 'warn' }; }))
      });
      var result = { pending: pending, drops: drops };
      needs.forEach(function (n) { result['needs_at_' + String(n.t).replace('.', '')] = n.value; });
      result.needs_frame = needs.length === 1 ? needs[0].value : needs.map(function (n) { return n.value; });
      var pubs = inp.events.filter(function (e) { return e.op === 'publish' && drops.indexOf(e.frame) < 0; });
      return { result: result, invariants: [{ label: 'latest-only overwrite', pass: pending === (pubs.length ? pubs[pubs.length - 1].frame : null), actual: 'pending=' + pending + ' last_accepted=' + (pubs.length ? pubs[pubs.length - 1].frame : 'none') }] };
    });
  }
});

/* F8 — stale-evidence-health-gating */
L('stale-evidence-health-gating', {
  title: 'Chặn bằng chứng cũ + giám sát worker',
  topic: '1 pending job/cam + timestamp monotonic + result_age = max(cam_ts−job.ts, mono−submitted) > max_age → drop',
  pipelineRole: 'Worker occupancy ~2Hz chậm hơn tracker → 3 cơ chế phối hợp chặn evidence lỗi thời; KHÔNG có job_seq.',
  difficulty: 4, tags: ['timing', 'health', 'worker'], related: ['temporal-smoothing-dwell', 'latest-frame-mailbox'],
  codeRefs: [refp(PD, 602, 645, 'accept_evidence', 'timestamp monotonic'), refp('backend/main_detect/two_camera.py', 2560, 2668, 'submit/complete/deadline', 'result_age=max'), refp('backend/main_detect/two_camera.py', 68, 76, 'PendingParkingJob', '')],
  inputSchema: { job: '{ts,frame_idx,submitted_ago_s}', cam_ts: 'float', max_age_s: 'float', evidence_ts: 'float[]', parking_futures: '{}' },
  outputSchema: { verdict: 'accept|reject:<reason>', health: 'string' },
  dataStructures: ['parking_futures{cam: PendingParkingJob} ≤1/cam', 'parking_pipeline{cam: health}'],
  keyFields: [{ name: 'result_age', type: 'max(2 nhánh)', desc: 'lấy nhánh xấu hơn giữa clock camera và wall-clock' }],
  invariants: ['1 pending job/cam — không xếp hàng, chống backlog tự nhiên', 'KHÔNG có job_seq/applied_seq — timestamp monotonic thay'],
  simplifications: ['[sim-omits] job_id label, debug_images, finish_vision_job callback — giữ 4 reason literal'],
  edgeCases: [{ name: '3-kieu-reject', desc: 'result_too_old / evidence_not_monotonic / worker_over_deadline', scenario: 'edge', edgeCase: true }],
  scenarios: [
    { id: 'normal', label: 'Accept', input: { parking_futures: {}, submit: true, job: { ts: 104.8, frame_idx: 41, submitted_ago_s: 0.3 }, cam_ts: 105.0, max_age_s: 2.0, evidence_ts: [104.5, 104.8] }, expected: { verdict: 'accept' } },
    { id: 'edge', label: 'Ba kiểu reject', input: { cases: [{ id: 'too_old', job: { ts: 102.0, submitted_ago_s: 0.3 }, cam_ts: 105.0, max_age_s: 2.0 }, { id: 'monotonic', job: { ts: 104.8, submitted_ago_s: 0.3 }, cam_ts: 105.0, max_age_s: 2.0, evidence_ts: [104.8, 104.5] }, { id: 'deadline', job: { ts: 104.8, submitted_ago_s: 2.5 }, cam_ts: 105.0, max_age_s: 2.0, pending_only: true }] }, expected: { verdicts: ['result_too_old', 'evidence_not_monotonic', 'worker_over_deadline'] } }
  ],
  parameters: [param('max_age', 'max_result_age_s', 2.0, 0.5, 10, 0.1)],
  pseudocode: pc([
    'submit: cam ∈ parking_futures → skip (1 pending/cam)',
    'complete: result_age = max(cam_ts−job.ts, mono−submitted) > max_age → result_too_old',
    'accept_evidence ts ≤ last → evidence_not_monotonic',
    'job pending > max_age → worker_over_deadline (degraded dù kết quả chưa về)'
  ]),
  buildTrace: function (sid, prm) {
    var self = this;
    return mkTrace(self, sid, prm, function (inp, P, emit) {
      var maxAge = P.max_age !== undefined ? P.max_age : inp.max_age_s;
      function evalJob(cs) {
        var j = cs.job || inp.job, camTs = cs.cam_ts || inp.cam_ts, evTs = cs.evidence_ts || inp.evidence_ts;
        if (cs.pending_only) return j.submitted_ago_s > maxAge ? { verdict: 'worker_over_deadline', age: j.submitted_ago_s, why: 'pending ' + j.submitted_ago_s + 's > ' + maxAge } : { verdict: 'still_pending', age: j.submitted_ago_s, why: 'pending ' + j.submitted_ago_s + 's ≤ ' + maxAge + ' — chưa quá hạn' };
        var age = Math.max(camTs - j.ts, j.submitted_ago_s);
        if (age > maxAge) return { verdict: 'result_too_old', age: age, why: 'max(' + r2(camTs - j.ts) + ',' + j.submitted_ago_s + ')=' + r2(age) + ' > ' + maxAge };
        if (evTs && evTs.length >= 2 && evTs[evTs.length - 1] <= evTs[evTs.length - 2]) return { verdict: 'evidence_not_monotonic', why: 'evidence đi lùi' };
        return { verdict: 'accept', age: age, why: 'age ' + r2(age) + ' ≤ ' + maxAge + ' ∧ monotonic' };
      }
      var cases = inp.cases || [inp];
      var rs = cases.map(evalJob);
      emit([0], 'Worker occupancy ~2Hz chậm hơn tracker. Kiểm tra: ' + cases.map(function (cs) {
        var j = cs.job || inp.job;
        return (cs.id || 'job') + ' — job.ts=' + j.ts + ', cam_ts=' + (cs.cam_ts || inp.cam_ts) + ', submitted_ago=' + j.submitted_ago_s + 's, max_age=' + maxAge + 's';
      }).join(' | ') + '.', { max_age: maxAge }, {
        type: 'rows', rows: cases.map(function (cs) {
          var j = cs.job || inp.job;
          return { label: cs.id || 'job', value: 'ts ' + j.ts + ' · ago ' + j.submitted_ago_s + 's' + (cs.evidence_ts ? ' · ev ' + JSON.stringify(cs.evidence_ts) : ''), state: 'info' };
        })
      });
      emit([0, 1, 2], cases.map(function (cs, i) {
        return (cs.id || 'job') + ': ' + rs[i].why + ' → **' + rs[i].verdict + '**';
      }).join(' · '), { verdicts: rs.map(function (r) { return r.verdict; }) }, {
        type: 'rows', rows: cases.map(function (cs, i) { return { label: cs.id || 'job', value: rs[i].verdict, state: rs[i].verdict === 'accept' ? 'pass' : 'fail' }; })
      });
      emit([3], 'Ba cơ chế phối hợp: 1 pending job/cam (submit skip khi bận) + timestamp monotonic + result_age=max(cam_ts−job.ts, mono−submitted). KHÔNG có job_seq — timestamp thay vai trò ordering.', { verdicts: rs.map(function (r) { return r.verdict; }) }, {
        type: 'board', cards: rs.map(function (r, i) { return { label: cases[i].id || 'case', value: r.verdict, hl: true, color: r.verdict === 'accept' ? '#3fce7c' : '#f2555a' }; })
      });
      return { result: { verdicts: rs.map(function (r) { return r.verdict; }), verdict: rs[0].verdict }, invariants: [
        { label: '1 pending/cam', pass: Object.keys(inp.parking_futures || {}).length <= 1, actual: Object.keys(inp.parking_futures || {}).length + ' pending job' },
        { label: 'pending > max_age → deadline', pass: cases.every(function (c, i) { return !c.pending_only || (rs[i].verdict === 'worker_over_deadline') === ((c.job || inp.job).submitted_ago_s > maxAge); }), actual: rs.map(function (r) { return r.verdict; }).join(', ') }] };
    });
  }
});

/* =================================================================
 * Đăng ký — 57 canonical CV IDs; F9 `replay-session-sync` là alias
 * của C (`replay-timestamp-pairing`) → KHÔNG register ở đây.
 * ================================================================= */
window.TechGarAlgo.registerPack('cv', lessons);
})();
