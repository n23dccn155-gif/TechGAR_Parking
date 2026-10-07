/* =================================================================
 * TechGar2 algo-web V2 — pack "local" (builder A)
 * 5 node pipeline cục bộ một camera: roi, motion, kalman, assignment, coasting
 * Contract SPEC §5: window.TechGarPipelinePacks.local = [node...]
 * Classic script, deterministic, không fetch/CDN. Dữ liệu frame là minh họa
 * giáo dục — ngưỡng production được trích trong answers/refs, không trộn.
 * ================================================================= */
(function () {
'use strict';
var P = (window.TechGarPipelinePacks = window.TechGarPipelinePacks || {});
var SRC = 'backend/main_detect/src/techgar/motion_tracker.py';
var TC = 'backend/main_detect/two_camera.py';

function fr(title, lines, expl, state, scene, ms) {
  return { title: title, activeLines: lines, explanation: expl, state: state, scene: scene, durationMs: ms };
}
function clone(o) { return JSON.parse(JSON.stringify(o)); }

/* ---------- draw helpers (canvas tọa độ ảo 800×480, scale vào view) ---------- */
function viewScale(ctx, view) {
  var s = Math.min(view.width / 800, view.height / 480);
  ctx.save();
  ctx.translate((view.width - 800 * s) / 2, (view.height - 480 * s) / 2);
  ctx.scale(s, s);
  return s;
}
function lerp(a, b, t) { return a + (b - a) * t; }
function ease(t) { return t < 0 ? 0 : t > 1 ? 1 : t * t * (3 - 2 * t); }
function txt(ctx, x, y, s, c, size, align, bold) {
  ctx.fillStyle = c; ctx.font = (bold ? 'bold ' : '') + (size || 13) + 'px sans-serif';
  ctx.textAlign = align || 'left'; ctx.textBaseline = 'middle'; ctx.fillText(s, x, y);
}
function rr(ctx, x, y, w, h, r, fill, stroke, lw) {
  ctx.beginPath();
  if (ctx.roundRect) ctx.roundRect(x, y, w, h, r); else ctx.rect(x, y, w, h);
  if (fill) { ctx.fillStyle = fill; ctx.fill(); }
  if (stroke) { ctx.strokeStyle = stroke; ctx.lineWidth = lw || 1.5; ctx.stroke(); }
}
function arrow(ctx, x1, y1, x2, y2, c, lw, dash) {
  ctx.save(); ctx.strokeStyle = c; ctx.lineWidth = lw || 2.5;
  if (dash && ctx.setLineDash) ctx.setLineDash(dash);
  ctx.beginPath(); ctx.moveTo(x1, y1); ctx.lineTo(x2, y2); ctx.stroke();
  var a = Math.atan2(y2 - y1, x2 - x1);
  ctx.beginPath(); ctx.moveTo(x2, y2);
  ctx.lineTo(x2 - 9 * Math.cos(a - 0.45), y2 - 9 * Math.sin(a - 0.45));
  ctx.lineTo(x2 - 9 * Math.cos(a + 0.45), y2 - 9 * Math.sin(a + 0.45));
  ctx.closePath(); ctx.fillStyle = c; ctx.fill(); ctx.restore();
}
function car(ctx, x, y, w, h, c, label) {
  rr(ctx, x - w / 2, y - h / 2, w, h, 5, c, '#0c0f1a', 1.5);
  rr(ctx, x - w * 0.32, y - h * 0.22, w * 0.64, h * 0.44, 3, 'rgba(255,255,255,.25)');
  if (label) txt(ctx, x, y + h / 2 + 12, label, '#e8ecf4', 12, 'center', true);
}
function badge(ctx, x, y, s, c) {
  var w = 9 + ctx.measureText ? s.length * 7.2 + 12 : 60;
  rr(ctx, x, y, w, 22, 11, c, null);
  txt(ctx, x + w / 2, y + 11, s, '#fff', 12, 'center', true);
}
function cells(ctx, grid, x, y, cs, colors) {
  for (var r = 0; r < grid.length; r++) for (var c = 0; c < grid[r].length; c++) {
    var col = colors[grid[r][c]]; if (!col) continue;
    ctx.fillStyle = col; ctx.fillRect(x + c * cs, y + r * cs, cs - 1, cs - 1);
  }
}
function dot(ctx, x, y, r, c, ring) {
  ctx.beginPath(); ctx.arc(x, y, r, 0, 6.2832); ctx.fillStyle = c; ctx.fill();
  if (ring) { ctx.strokeStyle = ring; ctx.lineWidth = 2; ctx.stroke(); }
}
function poly(ctx, pts, fill, stroke, lw, dash) {
  ctx.save(); if (dash && ctx.setLineDash) ctx.setLineDash(dash);
  ctx.beginPath(); ctx.moveTo(pts[0][0], pts[0][1]);
  for (var i = 1; i < pts.length; i++) ctx.lineTo(pts[i][0], pts[i][1]);
  ctx.closePath();
  if (fill) { ctx.fillStyle = fill; ctx.fill(); }
  if (stroke) { ctx.strokeStyle = stroke; ctx.lineWidth = lw || 2; ctx.stroke(); }
  ctx.restore();
}
function lerpPt(a, b, t) { return [lerp(a[0], b[0], t), lerp(a[1], b[1], t)]; }
/* nhãn tách khỏi tâm đối tượng + đường leader — không bao giờ chồng nhau */
function callout(ctx, s, ox, oy, dx, dy, c) {
  var tx = ox + dx, ty = oy + dy;
  ctx.strokeStyle = 'rgba(232,236,244,.5)'; ctx.lineWidth = 1;
  ctx.beginPath(); ctx.moveTo(ox, oy); ctx.lineTo(tx, ty); ctx.stroke();
  dot(ctx, tx, ty, 2.5, c);
  txt(ctx, tx + (dx < 0 ? -6 : 6), ty, s, c, 11, dx < 0 ? 'right' : 'left', true);
}

/* ================================================================
 * NODE 1 — roi : vùng được quan sát (strict + context band + anchor)
 * ================================================================ */
var ROI_POLY = [[150, 120], [660, 110], [700, 330], [520, 400], [140, 380]];
var ROI_BAND = 26;
function roiScene(step, blobs, verdict, focus) {
  return { type: 'roi', poly: ROI_POLY, band: ROI_BAND, blobs: blobs, step: step, verdict: verdict || {}, focus: focus || null };
}
function drawRoi(ctx, frame, view) {
  var s = frame.scene, t = ease(view.progress);
  var k = viewScale(ctx, view);
  rr(ctx, 40, 60, 720, 360, 10, '#161b2e', '#2a3248');
  ctx.save(); ctx.beginPath(); ctx.rect(40, 60, 720, 360); ctx.clip();
  // context band = poly lớn hơn (đứt), ROI cứng (đặc)
  var band = s.poly.map(function (p) {
    var cx = 425, cy = 250, dx = p[0] - cx, dy = p[1] - cy, d = Math.hypot(dx, dy) || 1;
    var f = (d + s.band) / d; return [cx + dx * f, cy + dy * f];
  });
  poly(ctx, band, 'rgba(79,156,247,.10)', 'rgba(79,156,247,.55)', 1.5, [6, 5]);
  poly(ctx, s.poly, 'rgba(63,206,124,.07)', '#3fce7c', 2.5);
  // blobs
  s.blobs.forEach(function (b) {
    var pos = b.from && b.to ? lerpPt(b.from, b.to, t) : b.at;
    var col = s.verdict[b.id] === 'detect' ? '#3fce7c' : s.verdict[b.id] === 'reject' ? '#f2555a' : s.verdict[b.id] === 'rescue' ? '#f0a93c' : '#8a93a8';
    car(ctx, pos[0], pos[1], b.w || 46, b.h || 30, col, b.id);
    var ax = pos[0], ay = pos[1] + (b.h || 30) / 2;
    if (s.step >= 2) { dot(ctx, ax, ay, 4, '#ffd166'); }
  });
  if (s.focus && s.step >= 2) {
    // zoom tỉ lệ fill thật của blob được focus
    var f = s.focus;
    txt(ctx, 70, 96, 'strict support: ' + f.support + '/' + f.required + ' px', '#e8ecf4', 13);
    var bw = 300, filled = Math.min(1, f.support / f.required);
    rr(ctx, 70, 106, bw, 14, 7, '#2a3248'); rr(ctx, 70, 106, bw * filled, 14, 7, filled >= 1 ? '#3fce7c' : '#f0a93c');
    if (f.context) txt(ctx, 70, 136, 'context support: ' + f.context + ' px — anchor trong band: ' + (f.anchorIn ? 'có' : 'không'), '#8a93a8', 12);
  }
  // verdict badges xuất hiện ở step cuối
  if (s.step >= 3) {
    var bx = 70;
    s.blobs.forEach(function (b) {
      var v = s.verdict[b.id]; if (!v) return;
      var col = v === 'detect' ? '#2e8b57' : v === 'rescue' ? '#b8791f' : '#a02c34';
      badge(ctx, bx, 400, b.id + ' → ' + v, col); bx += ctx.measureText ? (b.id + ' → ' + v).length * 7.2 + 30 : 90;
    });
  }
  ctx.restore(); ctx.restore();
}
var nodeRoi = {
  id: 'roi', title: 'ROI: vùng được quan sát', group: 'local',
  summary: 'Chỉ chuyển động nằm trong vùng quan sát đã vẽ (ROI) mới được tính là xe; vùng đệm mỏng ngoài mép chỉ để đo, không để nhận xe mới.',
  answers: {
    does: 'Cắt mọi kết quả theo vùng ROI đã cấu hình; mỗi blob phải chứng minh có đủ pixel nằm trong ROI, và có "điểm chân" — tâm đáy khung xe — rơi trong vùng quan sát.',
    role: 'Đứng sau bước lọc pixel chuyển động, trước khi blob được gọi là detection. Mất nó: mọi chuyển động ngoài bãi — cây rung, người đi bộ, xe trên đường — đều tạo track rác.',
    where: 'ROI nạp từ file JSON tại two_camera.py:2409-2420; kiểm từng blob trong _detect tại motion_tracker.py:794-816, :855-921, :977-1010.',
    why: 'ROI còn có "vùng đệm" hẹp ngoài mép chỉ để đo trọn xe đứng sát biên — comment nguồn ghi band "không mở rộng vùng cấp identity" (:812-816); blob nằm trọn trong đệm vẫn bị loại (:887-888).'
  },
  refs: [
    { path: SRC, line: 812, symbol: '_detect — context band', excerptStart: 812,
      excerpt: '            # Keep a bounded context band so a vehicle touching the configured\n            # ROI is measured as a whole object.  A component still needs real\n            # support inside the strict ROI below; this does not expand the\n            # area in which unrelated blobs may create identities.\n            mask = cv2.bitwise_and(mask, self._roi_context_mask)' },
    { path: SRC, line: 876, symbol: 'required strict-ROI support', excerptStart: 876,
      excerpt: '                required_support = max(\n                    20,\n                    min(self.motion_min_pixels, int(round(0.08 * component_pixels))),\n                )\n                if roi_support_pixels < required_support:' },
    { path: TC, line: 2416, symbol: 'ROI polygon → roi_mask', excerptStart: 2415,
      excerpt: '                pts = np.array([[p["x"], p["y"]] for p in data["polygon"]], np.int32)\n                cv2.fillPoly(mask, [pts], 255)\n                trackers[cam_id].roi_mask = mask' }
  ],
  pseudocode: [
    'band = ROI nở ra padding px (chỉ để đo)',
    'mask &= band',
    'với mỗi blob: đếm pixel trong ROI cứng',
    'strict < ngưỡng? → thử cứu bằng band (clipped + anchor trong band + đủ px)',
    'anchor = tâm đáy bbox phải ∈ ROI/band',
    'qua hết → detection; không → reject'
  ],
  scenarios: [
    {
      id: 'normal', label: 'Xe trong ROI được nhận, nhiễu ngoài bị bỏ',
      build: function () {
        return [
          fr('Polygon ROI và vùng đệm ngoài', [0], 'ROI cứng (xanh lá) là vùng quan sát đã vẽ trong cấu hình; vùng đệm đứt ngoài chỉ dùng để đo xe đứng sát mép, không phải nơi nhận xe mới.',
            { roi: 'cam1', band_px: 'padding [minh họa 26px]' },
            roiScene(0, [], {}), 2200),
          fr('Các blob xuất hiện khắp nơi', [2], 'Ba blob đang chuyển động: A sâu trong ROI, B ngoài hẳn, C nhỏ ngoài đệm. Cả ba đều "động thật" nhưng chưa chắc là detection.',
            { blobs: 3 },
            roiScene(1, [
              { id: 'A', from: [300, 340], to: [360, 330], w: 52, h: 32 },
              { id: 'B', from: [700, 90], to: [740, 80], w: 48, h: 30 },
              { id: 'C', at: [96, 240], w: 20, h: 14 }
            ], {}), 2200),
          fr('Đếm pixel nằm trong ROI cứng', [2, 3], 'Với mỗi blob: đếm pixel thật sự nằm trong ROI cứng; ngưỡng tối thiểu theo cỡ blob (sản xuất: 8% diện tích hoặc tối đa 160px). A đạt, B/C trượt.',
            { support_A: '120/60', support_B: '0/60', support_C: '0/20' },
            roiScene(2, [
              { id: 'A', at: [360, 330], w: 52, h: 32 },
              { id: 'B', at: [740, 80], w: 48, h: 30 },
              { id: 'C', at: [96, 240], w: 20, h: 14 }
            ], {}, { support: 120, required: 60 }), 2600),
          fr('Điểm chân xe quyết định', [4], '"Điểm chân" — tâm đáy khung xe (chấm vàng) — của B, C nằm ngoài vùng → loại. A qua cả hai cửa → thành detection cho bước ghép.',
            { verdict: 'A:detect, B:reject, C:reject' },
            roiScene(3, [
              { id: 'A', at: [360, 330], w: 52, h: 32 },
              { id: 'B', at: [740, 80], w: 48, h: 30 },
              { id: 'C', at: [96, 240], w: 20, h: 14 }
            ], { A: 'detect', B: 'reject', C: 'reject' }), 2600)
        ];
      }
    },
    {
      id: 'edge', label: 'Mép ROI: cứu được hay vẫn chết',
      build: function () {
        return [
          fr('Xe bị mép ROI cắt một nửa', [0, 2], 'Blob D bị đường biên cắt ngang thân xe: chỉ ~60% pixel nằm trong ROI cứng — dưới ngưỡng tối thiểu.',
            { roi_clipped: true },
            roiScene(1, [{ id: 'D', from: [515, 392], to: [540, 385], w: 64, h: 34 }], {},
              { support: 34, required: 60 }), 2400),
          fr('Được cứu bằng vùng đệm', [3], 'Blob sát mép được cứu nếu đủ 3 điều kiện: vẫn còn chạm ROI cứng + điểm chân nằm trong đệm + đếm lại trên ROI+đệm đủ ngưỡng. D đủ cả ba → được giữ (source gọi roi_context_rescued).',
            { context_support: '92/60', anchor: 'trong đệm', rescued: true },
            roiScene(2, [{ id: 'D', from: [532, 388], to: [540, 385], w: 64, h: 34 }], {}, { support: 92, required: 60, context: 92, anchorIn: true }), 2800),
          fr('Blob chỉ nằm trong đệm vẫn bị loại', [3, 4], 'E nằm trọn trong đệm nhưng 0 pixel trong ROI cứng → không được đo lại, loại thẳng. Đệm chỉ để đo xe đã chạm ROI, không phải đất sống.',
            { support_E: '0/60 — từ chối không cứu' },
            roiScene(2, [
              { id: 'D', at: [540, 385], w: 64, h: 34 },
              { id: 'E', from: [720, 205], to: [730, 200], w: 40, h: 26 }
            ], {}), 2600),
          fr('Kết quả cuối', [5], 'D được cứu thành detection; E có điểm chân ngoài đệm → loại. Cùng "gần ROI" nhưng chỉ blob thật-sự-chạm-ROI mới sống.',
            { verdict: 'D:rescue→detect, E:reject' },
            roiScene(3, [
              { id: 'D', at: [540, 385], w: 64, h: 34 },
              { id: 'E', from: [724, 202], to: [730, 200], w: 40, h: 26 }
            ], { D: 'rescue', E: 'reject' }), 2600)
        ];
      }
    }
  ],
  draw: function (ctx, frame, view) { drawRoi(ctx, frame, view); }
};

/* ================================================================
 * NODE 2 — motion : pixel chuyển động → blob xe
 * ================================================================ */
function mgrid(init) {
  var g = [], r, c;
  for (r = 0; r < 10; r++) { g.push([]); for (c = 0; c < 18; c++) g[r].push('.'); }
  if (init) init(g); return g;
}
function carCells(g, cx, cy, w, h, ch) {
  for (var r = cy; r < cy + h && r < g.length; r++)
    for (var c = cx; c < cx + w && c < g[r].length; c++) g[r][c] = ch;
}
var MCOL = { '.': '#12172a', 'f': '#4f9cf7', 'm': '#f0a93c', 's': '#b98ae0', 'x': '#223', 'k': '#3fce7c', 'r': '#f2555a' };
function motionScene(stage, grid, caption, extra) {
  var s = { type: 'motion', stage: stage, grid: grid, caption: caption };
  if (extra) for (var k2 in extra) s[k2] = extra[k2];
  return s;
}
function drawMotion(ctx, frame, view) {
  var s = frame.scene, t = view.progress;
  viewScale(ctx, view);
  var x = 90, y = 80, cs = 34;
  rr(ctx, x - 20, y - 40, 18 * cs + 40, 10 * cs + 100, 10, '#161b2e', '#2a3248');
  cells(ctx, s.grid, x, y, cs, MCOL);
  ctx.strokeStyle = '#2a3248'; ctx.lineWidth = 1; ctx.strokeRect(x, y, 18 * cs, 10 * cs);
  // lướt sáng theo progress để thấy đây là biến đổi mask
  var sx = x + 18 * cs * Math.min(1, Math.max(0, (t - 0.15) / 0.7));
  ctx.fillStyle = 'rgba(255,255,255,.06)'; ctx.fillRect(x, y, sx - x, 10 * cs);
  if (s.stage === 'contour' || s.stage === 'verdict') {
    (s.boxes || []).forEach(function (b, i) {
      var col = b.ok ? '#3fce7c' : '#f2555a';
      ctx.strokeStyle = col; ctx.lineWidth = 3;
      var t2 = Math.min(1, t * 1.6); ctx.globalAlpha = Math.min(1, t2);
      ctx.strokeRect(x + b.x * cs - 4, y + b.y * cs - 4, b.w * cs + 8, b.h * cs + 8);
      txt(ctx, x + b.x * cs, y + b.y * cs - 14, b.label, col, 13, 'left', true);
      ctx.globalAlpha = 1;
    });
  }
  if (s.caption) txt(ctx, x - 10, y + 10 * cs + 34, s.caption, '#8a93a8', 13);
  ctx.restore();
}
var nodeMotion = {
  id: 'motion', title: 'Pixel chuyển động → blob xe', group: 'local',
  summary: 'Từ ảnh thô: tách pixel khác nền, bắt buộc pixel phải thật-sự-động so với frame cũ, rồi gom thành blob xe.',
  answers: {
    does: 'Trừ-nền (MOG2) gán mỗi pixel một mức: nền / nghi-là-bóng (giá trị 127) / chắc-chắn-khác-nền. Một kiểm tra so-frame-cũ yêu cầu pixel phải thật sự đổi — mọi bài kiểm phải-qua kiểu này gọi là một "cổng". Phần giao của hai lớp được dọn nhiễu rồi gom thành blob — đám pixel dính nhau nghi là xe; blob qua hết cổng thành detection, một bản đo.',
    role: 'Đứng sau bước dự đoán Kalman, trước bước ghép: biến ảnh thô thành các "điểm đo" ứng viên. Mất nó: tracking không có gì để ghép — toàn bộ pipeline im.',
    where: 'Chuỗi mask tại motion_tracker.py:768-827; mask so-frame-cũ :522-574; cổng từng blob :844-1085.',
    why: 'Docstring: "MOG2 có thể đánh dấu xe đỗ khi ánh sáng/độ nén đổi… diff nhiều frame bỏ blob đứng yên" (:527-532). Cổng nghi-bóng tồn tại vì "xe đồ chơi tối màu hay bị xếp 127 — lọc cứng >200 mất thân xe" (:772-779).'
  },
  refs: [
    { path: SRC, line: 768, symbol: 'MOG2 + threshold', excerptStart: 768,
      excerpt: '        raw_background_mask = self.bg_sub.apply(frame)\n        _, definite_foreground = cv2.threshold(\n            raw_background_mask, 200, 255, cv2.THRESH_BINARY\n        )' },
    { path: SRC, line: 790, symbol: 'temporal motion là cổng ∧', excerptStart: 790,
      excerpt: '        temporal_motion = self._temporal_motion_mask(frame, timestamp_s=timestamp_s)\n        # Motion mask là cổng bắt buộc: foreground đứng yên không được thành xe.\n        support = cv2.dilate(temporal_motion, np.ones((17, 17), np.uint8), iterations=1)\n        mask = cv2.bitwise_and(background_mask, support)' },
    { path: SRC, line: 1015, symbol: 'motion-fill per box', excerptStart: 1015,
      excerpt: '            motion_pixels = cv2.countNonZero(temporal_motion[y:y + h, x:x + w])\n            min_pixels = self.priority_motion_min_pixels if is_priority else self.motion_min_pixels\n            min_ratio = self.priority_motion_min_ratio if is_priority else self.motion_min_ratio\n            if motion_pixels < min_pixels or motion_pixels / float(w * h) < min_ratio:\n                continue' }
  ],
  pseudocode: [
    'fg = MOG2(frame); fg255 = fg > 200 (+127 nếu bật shadow-gate)',
    'motion = OR(|gray − reference| > ngưỡng) với reference cũ',
    'support = giãn(motion); mask = fg ∧ support',
    'OPEN nhỏ xóa chấm nhiễu; CLOSE nối mảnh cùng xe',
    'contour → box; pixel-motion trong box đủ → detection',
    'không đủ → reject (nhiễu/bóng/đứng yên)'
  ],
  scenarios: [
    {
      id: 'normal', label: 'Xe đang chạy → một detection',
      build: function () {
        var g1 = mgrid(function (g) { carCells(g, 7, 4, 4, 3, 'f'); });
        var g2 = mgrid(function (g) { carCells(g, 7, 4, 4, 3, 'f'); g[2][14] = 's'; g[8][3] = 's'; });
        var g3 = mgrid(function (g) { for (var r = 3; r < 8; r++) for (var c = 6; c < 12; c++) g[r][c] = 'm'; });
        var g4 = mgrid(function (g) { carCells(g, 7, 4, 4, 3, 'k'); });
        var g5 = mgrid(function (g) { carCells(g, 7, 4, 4, 3, 'k'); });
        return [
          fr('Trừ-nền đoán pixel khác nền', [0], 'Xe tối màu trên nền xám: trừ-nền (MOG2) đánh dấu phần thân là "chắc chắn khác nền" (xanh dương), vài pixel tối hơn nền bị xếp "nghi là bóng" (tím, giá trị 127) — chưa ai gọi là xe.',
            { fg: '255×12 px + 127×2 px' }, motionScene('fg', g2, 'mask nền: xanh=255 chắc, tím=127 nghi-bóng'), 2400),
          fr('So frame cũ: bắt buộc "đã động"', [1], 'So frame hiện tại với 1-2 frame mốc cũ (sau khi trừ độ sáng trung bình): vùng cam = pixel thật-sự đổi. Hai pixel 127 đứng yên → không có cam.',
            { motion_px: 30 }, motionScene('motion', g3, 'cam = pixel thật-sự chuyển động giữa hai thời điểm'), 2400),
          fr('Chỉ pixel vừa-khác-nền vừa-động sống', [2], 'Giữ lại phần giao: foreground ∩ vùng-quanh-chuyển-động. Hai pixel nghi-bóng ngoài vùng động bị cắt; thân xe — nơi hai lớp chồng nhau — còn lại.',
            { mask: 'fg ∧ support' }, motionScene('and', g4, 'xanh lá = fg ∩ vùng hỗ trợ chuyển động'), 2600),
          fr('Dọn nhiễu, nối thân xe', [3], 'Phép toán hình thái: OPEN nhỏ xóa chấm rời lẻ, CLOSE nối các mảnh cùng một xe. Kernel CLOSE cố ý nhỏ — lớn quá sẽ dán hai xe kề nhau thành một.',
            { morph: 'OPEN 3×3 → CLOSE join' }, motionScene('morph', g5, 'một connected component duy nhất'), 2400),
          fr('Khung → kiểm pixel động → detection', [4], 'Blob → khung chữ nhật → đếm pixel-động bên trong: đủ ngưỡng (sản xuất ≥160px và ≥8% khung) → blob thành detection, điểm đo là "điểm chân" tâm-đáy.',
            { detection: 1, motion_fill: 'đạt' },
            motionScene('contour', g5, 'box xanh lá = detection duy nhất', { boxes: [{ x: 7, y: 4, w: 4, h: 3, ok: true, label: 'd0' }] }), 2600)
        ];
      }
    },
    {
      id: 'edge', label: 'Bóng đổ + nhiễu: không blob nào sống',
      build: function () {
        var g1 = mgrid(function (g) { carCells(g, 4, 3, 5, 3, 's'); g[6][13] = 'x'; g[2][15] = 'x'; g[8][6] = 'x'; });
        var g2 = mgrid(function (g) { g[8][6] = 'm'; });
        var g3 = mgrid(function (g) { carCells(g, 4, 3, 5, 3, 's'); });
        var g4 = mgrid(function (g) { });
        return [
          fr('Sáng đổi: trừ-nền báo khắp nơi', [0], 'Một mảng bóng đổ (tím) cộng vài chấm nhiễu (xám). Máy trừ-nền không phân biệt được — cả ba đều là "pixel khác nền".',
            { candidates: 'shadow + 3 speckle' }, motionScene('fg', g1, 'tím = vùng bóng đổ, chấm xám = nhiễu'), 2600),
          fr('Cổng so-frame-cũ làm lộ trò bóng', [1], 'Bóng đổ không tự di chuyển giữa hai frame mốc → vùng tím không có cam. Chỉ một chấm rung nhẹ có chút chuyển động.',
            { motion: 'chỉ 1 speckle có' }, motionScene('motion', g2, 'cam gần như trống — bóng đứng yên'), 2600),
          fr('Phần giao cắt sạch + chấm nhỏ chết', [2, 3], 'Giữ phần giao hai lớp: mảng bóng vẫn còn vì trừ-nền báo "khác nền" quanh nó, nhưng OPEN nuốt hết chấm rời lẻ.',
            { surviving: 'shadow blob + 0 speckle' }, motionScene('morph', g3, 'chỉ còn vùng bóng'), 2400),
          fr('Qua cỡ lớn nhưng trượt hai cửa cuối', [4, 5], 'Mảng bóng tới được bước khung: (a) pixel-động trong khung = 0 < ngưỡng → trượt; (b) cổng nghi-bóng cũng đánh dấu tỉ lệ shadow-marker cao. Kết quả: 0 detection — đúng mong muốn.',
            { detections: 0, reason: 'motion-fill 0% + cast_shadow' },
            motionScene('verdict', g4, 'không còn blob → không detection', { boxes: [{ x: 4, y: 3, w: 5, h: 3, ok: false, label: 'reject' }] }), 2800)
        ];
      }
    }
  ],
  draw: function (ctx, frame, view) { drawMotion(ctx, frame, view); }
};

/* ================================================================
 * NODE 3 — kalman : dự đoán và sửa vị trí
 * ================================================================ */
function kalScene(stage, measured, predicted, corrected, extra) {
  var s = { type: 'kalman', stage: stage, measured: measured || [], predicted: predicted || null, corrected: corrected || null };
  if (extra) for (var k in extra) s[k] = extra[k];
  return s;
}
var KAL_ORDER = ['predict', 'detect', 'assign', 'correct'];
function drawKalman(ctx, frame, view) {
  var s = frame.scene, t = ease(view.progress);
  viewScale(ctx, view);
  rr(ctx, 40, 60, 520, 340, 10, '#161b2e', '#2a3248');
  txt(ctx, 60, 84, 'quỹ đạo ô hình', '#8a93a8', 12);
  // strip thứ tự bước (predict trước detect — dẫn chứng source)
  var ox = 580, oy = 90;
  KAL_ORDER.forEach(function (k2, i) {
    var on = KAL_ORDER.indexOf(s.stage) >= i && (s.stage === 'confirm' || KAL_ORDER.indexOf(s.stage) >= i);
    var col = s.stage === k2 ? '#4f9cf7' : (on ? '#3fce7c' : '#2a3248');
    rr(ctx, ox, oy + i * 46, 120, 34, 8, 'rgba(79,156,247,.08)', col, s.stage === k2 ? 2.5 : 1.2);
    txt(ctx, ox + 60, oy + i * 46 + 17, k2, s.stage === k2 ? '#e8ecf4' : '#8a93a8', 13, 'center', s.stage === k2);
    if (i < 3) arrow(ctx, ox + 60, oy + i * 46 + 34, ox + 60, oy + i * 46 + 44, '#2a3248', 1.5);
  });
  // quỹ đạo: measured lịch sử (cam mờ), predicted (cyan + vector), corrected (xanh lá)
  s.measured.forEach(function (p, i) {
    var a = 0.35 + 0.6 * (i / Math.max(1, s.measured.length - 1));
    ctx.globalAlpha = a; dot(ctx, p[0], p[1], 5, '#f0a93c'); ctx.globalAlpha = 1;
    if (i) arrow(ctx, s.measured[i - 1][0], s.measured[i - 1][1], p[0], p[1], 'rgba(240,169,60,.35)', 1.2);
  });
  if (s.predicted) {
    var pv = s.predicted;
    dot(ctx, pv[0], pv[1], 7, 'rgba(79,156,247,.9)', '#0c0f1a');
    if (s.vel) arrow(ctx, pv[0], pv[1], pv[0] + s.vel[0], pv[1] + s.vel[1], '#4f9cf7', 2, [5, 4]);
    if (s.unc) {
      ctx.strokeStyle = 'rgba(79,156,247,.4)'; ctx.lineWidth = 1.5;
      if (ctx.setLineDash) ctx.setLineDash([4, 4]);
      ctx.beginPath(); ctx.ellipse(pv[0], pv[1], s.unc, s.unc * 0.6, 0, 0, 6.2832); ctx.stroke();
      if (ctx.setLineDash) ctx.setLineDash([]);
    }
    txt(ctx, pv[0] + 12, pv[1] - 12, 'predicted', '#4f9cf7', 12);
  }
  if (s.corrected) {
    var cp = lerpPt(s.predicted || s.corrected, s.corrected, t);
    dot(ctx, cp[0], cp[1], 7, '#3fce7c', '#0c0f1a');
    txt(ctx, cp[0] + 12, cp[1] + 16, 'corrected', '#3fce7c', 12);
  }
  if (s.measNow) { dot(ctx, s.measNow[0], s.measNow[1], 6, '#ffd166', '#0c0f1a'); txt(ctx, s.measNow[0] + 12, s.measNow[1], 'đo mới', '#ffd166', 12); }
  if (s.stage === 'confirm') badge(ctx, 60, 380, 'CONFIRMED: đủ quan sát + đủ quãng đường', '#2e8b57');
  if (s.stage === 'nocorrect') badge(ctx, 60, 380, 'gate từ chối → KHÔNG correct', '#a02c34');
  ctx.restore();
}
var nodeKalman = {
  id: 'kalman', title: 'Kalman: dự đoán và sửa vị trí', group: 'local',
  summary: 'Bộ lọc giả-định xe đi đều: dự đoán vị trí trước khi camera chụp, rồi bị bản đo thật kéo lại khi được ghép.',
  answers: {
    does: 'Mỗi track — lịch sử vị trí của một xe qua các frame — giữ trạng thái (x, y, vx, vy). Đầu frame, predict() đẩy mọi track ra "điểm kỳ vọng"; chỉ khi bước ghép chọn được cặp mới correct() bằng điểm đo thật.',
    role: 'Predict chạy TRƯỚC detect trong mọi frame; correct chạy SAU ghép. Mất nó: không có "vị trí kỳ vọng" để kiểm cặp — detection lệch vài pixel đã đứt track.',
    where: 'process_frame gọi _predict_tracks :2228 trước _detect :2233; correct tại _apply_detection :2118 sau _assign :2249; ma trận _new_kalman :440-448.',
    why: 'Mô hình "đi đều" vì trong vài frame xe gần như chạy thẳng; predict trước vì ghép cần điểm kỳ vọng. Xác nhận track cần min_visible_count=3 quan sát + đủ quãng đường — comment: track 1-2 quan sát "chưa có velocity thật" nên kiểm tra cho qua tạm (:1209-1213).'
  },
  refs: [
    { path: SRC, line: 440, symbol: '_new_kalman (4,2) constant-velocity', excerptStart: 440,
      excerpt: '    def _new_kalman(point: Tuple[int, int]) -> cv2.KalmanFilter:\n        kalman = cv2.KalmanFilter(4, 2)\n        kalman.transitionMatrix = np.array([[1, 0, 1, 0], [0, 1, 0, 1], [0, 0, 1, 0], [0, 0, 0, 1]], np.float32)\n        kalman.measurementMatrix = np.array([[1, 0, 0, 0], [0, 1, 0, 0]], np.float32)' },
    { path: SRC, line: 247, symbol: 'predict toàn track trước detect', excerptStart: 247,
      excerpt: '                predicted = track.kalman.predict()' },
    { path: SRC, line: 2118, symbol: 'correct chỉ khi matched', excerptStart: 2118,
      excerpt: '        track.kalman.correct(np.array([[point[0]], [point[1]]], dtype=np.float32))' },
    { path: SRC, line: 2249, symbol: 'assign → apply (thứ tự gọi)', excerptStart: 2249,
      excerpt: '        assignments, unmatched_tracks, unmatched_detections = self._assign(detections)\n        for track_id, detection_id, _ in assignments:\n            self._apply_detection(self._tracks[track_id], detections[detection_id])' }
  ],
  pseudocode: [
    'với mọi track: p = kalman.predict()  (trước khi đọc ảnh)',
    'phát hiện → detection (riêng node motion/roi)',
    'assign: detection gần p → cặp',
    'matched → kalman.correct(điểm đo)',
    'không matched → giữ predict (sang node coasting)',
    'đủ quan sát + đủ quãng đường → CONFIRMED'
  ],
  scenarios: [
    {
      id: 'normal', label: 'Đo nhiễu, predict/correct luân phiên',
      build: function () {
        return [
          fr('Track mới: trạng thái = điểm đo, vận tốc 0', [0], 'Xe vừa sinh track tạm (chấm cam) tại điểm đo đầu — trạng thái chưa biết vận tốc.',
            { state: '(10,5,0,0) [minh họa]' },
            kalScene('init', [[180, 300]], null, null), 2400),
          fr('predict() chạy TRƯỚC khi đọc ảnh mới', [0], 'Sau vài cặp đo, trạng thái có vận tốc → predict đẩy ra "điểm kỳ vọng" (xanh dương) + vùng bất định. Điểm này được tính TRƯỚC cả khi đọc ảnh — đúng thứ tự trong source.',
            { predicted: '(340,180) + v' },
            kalScene('predict', [[180, 300], [230, 260], [280, 220]], [340, 180], null, { vel: [70, -50], unc: 46 }), 2800),
          fr('Đo mới tới — không trùng dự đoán', [1], 'Camera báo điểm đo (vàng) — luôn lệch khỏi dự đoán vì đo lường có nhiễu. Cả hai chỉ là hai "ý kiến" khác nhau.',
            { meas: 'lệch ~18px [minh họa]' },
            kalScene('detect', [[180, 300], [230, 260], [280, 220]], [340, 180], null, { vel: [70, -50], unc: 46, measNow: [352, 168] }), 2400),
          fr('Được ghép → correct() kéo về giữa', [3], 'Chỉ vì assignment đã chọn cặp này, correct mới chạy: trạng thái mới (xanh lá) nằm giữa dự đoán và đo — gần bên nào tùy độ tin cậy; vận tốc cũng được sửa.',
            { corrected: '(346,174)' },
            kalScene('correct', [[180, 300], [230, 260], [280, 220], [352, 168]], [340, 180], [346, 174], { vel: [66, -46], unc: 30 }), 2800),
          fr('Đủ quan sát + đủ quãng đường → CONFIRMED', [5], 'Track được xác nhận chỉ khi đủ số quan sát VÀ đủ quãng đường di chuyển (sản xuất: min_visible_count=3) — hai ảnh đẹp chưa đủ, nên track mới đi qua trạng thái "tạm" trước.',
            { visible: '3/3', status: 'CONFIRMED' },
            kalScene('confirm', [[180, 300], [230, 260], [280, 220], [352, 168]], [346, 174], [346, 174]), 2600)
        ];
      }
    },
    {
      id: 'edge', label: 'Không khớp → không được correct',
      build: function () {
        return [
          fr('predict như thường lệ', [0], 'Frame mới: predict vẫn chạy đầu tiên — điểm kỳ vọng (xanh dương) + vùng bất định.',
            { predicted: '(340,180)' },
            kalScene('predict', [[180, 300], [230, 260], [280, 220]], [340, 180], null, { vel: [70, -50], unc: 46 }), 2200),
          fr('Đo mới quá xa ngân sách ghép', [1, 2], 'Điểm đo (vàng) tới nhưng xa hơn "ngân sách ghép" của track → bước ghép từ chối cặp này. Thứ tự không đổi: detect vẫn sau predict.',
            { dist: '> gate → reject [minh họa]' },
            kalScene('assign', [[180, 300], [230, 260], [280, 220]], [340, 180], null, { vel: [70, -50], unc: 46, measNow: [470, 320] }), 2600),
          fr('Không khớp: giữ nguyên dự đoán', [4], 'correct() không được gọi — trạng thái giữ nguyên điểm dự đoán, track sang bước kéo-dài (coasting). Đây là điểm dễ vẽ sai: Kalman không "tự sửa" khi không có bản đo được chọn.',
            { corrected: null, next: 'coasting' },
            kalScene('nocorrect', [[180, 300], [230, 260], [280, 220]], [340, 180], null, { vel: [70, -50], unc: 56 }), 2600),
          fr('Frame sau: đo hợp lệ → mới correct', [3], 'Khi detection hợp lệ xuất hiện lại trong cửa sổ ghép, correct mới chạy — đúng một lần, đúng trên cặp được ghép.',
            { corrected: '(348,176)' },
            kalScene('correct', [[180, 300], [230, 260], [280, 220], [352, 168]], [340, 180], [348, 176], { vel: [64, -44], unc: 30 }), 2600)
        ];
      }
    }
  ],
  draw: function (ctx, frame, view) { drawKalman(ctx, frame, view); }
};

/* ================================================================
 * NODE 4 — assignment : ghép detection vào track (LAPJV)
 * ================================================================ */
function asScene(stage, tracks, dets, cost, chosen, extras) {
  var s = { type: 'assign', stage: stage, tracks: tracks || [], dets: dets || [], cost: cost || [], chosen: chosen || [] };
  if (extras) for (var k in extras) s[k] = extras[k];
  return s;
}
function drawAssign(ctx, frame, view) {
  var s = frame.scene, t = ease(view.progress);
  viewScale(ctx, view);
  // trái: mini map; phải: cost matrix
  rr(ctx, 30, 60, 330, 340, 10, '#161b2e', '#2a3248');
  txt(ctx, 48, 84, 'bãi (track + detection)', '#8a93a8', 12);
  s.tracks.forEach(function (tr, i) {
    var p = tr.pred;
    var x = p[0] * 0.42 + 60, y = p[1] * 0.42 + 110;
    car(ctx, x, y, 40, 26, '#4f9cf7');
    if (tr.lbl) callout(ctx, tr.id, x, y, tr.lbl[0], tr.lbl[1], '#4f9cf7');
    else txt(ctx, x, y + 24, tr.id, '#4f9cf7', 11, 'center', true);
    if (tr.vel) arrow(ctx, x, y, (p[0] + tr.vel[0]) * 0.42 + 60, (p[1] + tr.vel[1]) * 0.42 + 110, '#4f9cf7', 1.8, [4, 4]);
  });
  s.dets.forEach(function (d) {
    var col = d.merged ? '#b98ae0' : '#f0a93c';
    var dx = d.pt[0] * 0.42 + 60, dy = d.pt[1] * 0.42 + 110;
    rr(ctx, dx - 22, dy - 15, 44, 30, 6, 'rgba(240,169,60,.15)', col, 2);
    var dlab = d.id + (d.merged ? ' (merged)' : '');
    if (d.lbl) callout(ctx, dlab, dx, dy, d.lbl[0], d.lbl[1], col);
    else txt(ctx, dx, dy + 24, dlab, col, 11, 'center', true);
    if (s.stage === 'matched' || s.stage === 'deferred') {
      s.chosen.forEach(function (pr) {
        if (pr[1] === s.dets.indexOf(d)) {
          var tr = s.tracks[pr[0]];
          var col2 = s.stage === 'matched' ? '#3fce7c' : '#f0a93c';
          var sx = tr.pred[0] * 0.42 + 60, sy = tr.pred[1] * 0.42 + 110;
          var ex = lerp(sx, d.pt[0] * 0.42 + 60, t), ey = lerp(sy, d.pt[1] * 0.42 + 110, t);
          arrow(ctx, sx, sy, ex, ey, col2, 3);
        }
      });
    }
  });
  // ma trận cost
  var mx = 400, my = 110, cs = 86;
  txt(ctx, mx, 84, 'ma trận cost (track × detection)', '#8a93a8', 12);
  s.dets.forEach(function (d, c) { txt(ctx, mx + c * cs + cs / 2, my - 12, d.id, '#8a93a8', 12, 'center', true); });
  s.tracks.forEach(function (tr, r) { txt(ctx, mx - 12, my + r * cs + cs / 2, tr.id, '#8a93a8', 12, 'right', true); });
  var reveal = s.stage === 'matrix' || s.stage === 'matched' || s.stage === 'deferred' || s.stage === 'solve';
  for (var r2 = 0; r2 < s.tracks.length; r2++) for (var c2 = 0; c2 < s.dets.length; c2++) {
    var v = reveal ? s.cost[r2][c2] : null;
    var isChosen = s.chosen.some(function (pr) { return pr[0] === r2 && pr[1] === c2; });
    var cell = '#2a3248';
    if (v !== null && v >= 9) cell = 'rgba(242,85,90,.25)';
    else if (v !== null) cell = 'rgba(79,156,247,' + (0.12 + v * 0.55) + ')';
    rr(ctx, mx + c2 * cs, my + r2 * cs, cs - 6, cs - 6, 8, cell, isChosen ? '#3fce7c' : '#2a3248', isChosen ? 3 : 1);
    if (v !== null) txt(ctx, mx + c2 * cs + cs / 2 - 3, my + r2 * cs + cs / 2 - 3, v >= 9 ? 'gate' : v.toFixed(2), v >= 9 ? '#f2555a' : '#e8ecf4', 13, 'center', v >= 9);
    else txt(ctx, mx + c2 * cs + cs / 2 - 3, my + r2 * cs + cs / 2 - 3, '?', '#39415a', 13, 'center');
  }
  ctx.fillStyle = 'rgba(255,255,255,.04)';
  ctx.fillRect(mx, my, s.dets.length * cs * t, s.tracks.length * cs);
  if (s.stage === 'solve') badge(ctx, mx, my + s.tracks.length * cs + 14, 'lapjv → cặp 1-1 tối ưu', '#2e5fa3');
  if (s.stage === 'matched') badge(ctx, mx, my + s.tracks.length * cs + 14, 'matched → correct + track mới', '#2e8b57');
  if (s.stage === 'deferred') badge(ctx, mx, my + s.tracks.length * cs + 14, 'mập mờ → defer, không ghép bừa', '#b8791f');
  ctx.restore();
}
var nodeAssign = {
  id: 'assignment', title: 'Ghép detection vào track', group: 'local',
  summary: 'Ghép mỗi detection vào đúng track một-đối-một: cổng khoảng-cách riêng từng track chặn cặp phi lý, bảng điểm 4 hạng, solver chọn tối ưu toàn cục.',
  answers: {
    does: 'Mỗi cặp (track, detection) phải qua cổng "không được xa quá" tính theo vận tốc riêng của track; cặp qua được chấm điểm 4 hạng (vị trí 0.45 + trùng-khung 0.25 + ngoại hình 0.20 + kích thước 0.10); solver lap.lapjv chọn ghép một-đối-một dưới ngưỡng 0.90; thắng không rõ sau khoảng che/merged thì hoãn chứ không nhận hòa.',
    role: 'Đứng sau detect, trước correct/cập nhật — quyết định "cùng một xe" hay "xe khác" hay "chưa chắc, giữ dự đoán". Mất nó: blob gần nhất nuốt mất ID của xe hàng xóm.',
    where: '_assign motion_tracker.py:1597-2007; cổng :1695/:1193; điểm :1761-1766; lapjv :1908; hoãn-mập-mờ :1914-1992.',
    why: 'Cổng tính riêng vì "khoảng-cách-tối-đa toàn cục lớn hơn thân xe — track đang coasting claim được blob xe kế" (:1199-1208); ghép 1-1 "không tự phân biệt hai lineage cùng hợp lý" nên mập mờ phải xử trước solver (:1783-1785). Solver thật là lap.lapjv (Jonker-Volgenant); "Hungarian" chỉ là tên nhóm bài toán — không khẳng định production cài literal Hungarian.'
  },
  refs: [
    { path: SRC, line: 1615, symbol: 'ma trận cost khởi tạo 10', excerptStart: 1615,
      excerpt: '        costs = np.full((len(track_ids), len(detections)), 10.0, dtype=np.float64)' },
    { path: SRC, line: 1761, symbol: 'cost 4 hạng', excerptStart: 1761,
      excerpt: '                cost = (\n                    0.45 * (distance / max_distance)\n                    + 0.25 * (1.0 - iou)\n                    + 0.20 * appearance_distance\n                    + 0.10 * size_error\n                )' },
    { path: SRC, line: 1908, symbol: 'lapjv solve', excerptStart: 1908,
      excerpt: '        _, row_to_col, _ = lapjv(costs, extend_cost=True, cost_limit=self.assignment_cost_limit)' },
    { path: SRC, line: 1946, symbol: 'thắng không rõ → defer', excerptStart: 1946,
      excerpt: '                if not has_margin:\n                    # After a merged/lost interval, near-equal alternatives are\n                    # precisely where ID switches happen. Keep both lineages\n                    # coasting and suppress a new fragment until the split is\n                    # unambiguous instead of accepting LAPJV\'s arbitrary tie.\n                    unmatched_tracks.append(track_id)' }
  ],
  pseudocode: [
    'với mỗi track: gate = f(vận tốc, invisible, kích thước)',
    'cặp xa quá gate → cost vô hiệu (10)',
    'cặp qua được → cost 4 hạng 0.45/0.25/0.20/0.10',
    'blob mập mờ/merged → cột 10, không là measurement',
    'lapjv(costs, limit=0.90) → ghép 1-1 tối ưu',
    'margin đủ → matched; không → defer/coasting',
    'detection lẻ → track mới TENTATIVE'
  ],
  scenarios: [
    {
      id: 'normal', label: 'Hai track, hai detection — ghép đúng',
      build: function () {
        var tr = [{ id: 'T1', pred: [300, 300], vel: [60, 0], lbl: [-48, -46] }, { id: 'T2', pred: [620, 560], vel: [0, -50], lbl: [48, -46] }];
        var dt = [{ id: 'd0', pt: [320, 310], lbl: [-34, 52] }, { id: 'd1', pt: [640, 520], lbl: [34, 52] }];
        return [
          fr('Dự đoán gặp detection', [0], 'Hai track có "điểm kỳ vọng" (xanh dương, kèm mũi vận tốc); hai blob detection (cam). Mọi cặp đều là ứng viên cho tới khi cổng xét.',
            { pairs: '2×2' }, asScene('setup', tr, dt), 2400),
          fr('Cổng riêng từng track chặn cặp phi lý', [0, 1], '"Cổng" = khoảng cách tối đa riêng từng track: xe nhanh được phép xa hơn, xe đứng yên chỉ quanh nó. Hai cặp chéo xa quá cổng → loại trước, không tính điểm.',
            { 'T1-d1': 'gate', 'T2-d0': 'gate' },
            asScene('gate', tr, dt, [[null, null], [null, null]]), 2600),
          fr('Chấm điểm 4 hạng cho cặp qua cổng', [2], 'Cặp hợp lệ chấm: 0.45 khoảng-cách-chuẩn + 0.25 mức-không-trùng-khung + 0.20 khác-ngoại-hình + 0.10 lệch-kích-thước — tổng ≤1. Ô "gate" = đã bị chặn trước.',
            { formula: '[minh họa] 0.45d+0.25iou+0.20app+0.10size' },
            asScene('matrix', tr, dt, [[0.21, 10], [10, 0.18]]), 2800),
          fr('Solver chọn ghép 1-1 tối ưu toàn cục', [4], 'lapjv không tham từng ô nhỏ nhất — nó tối ưu TỔNG điểm toàn bảng: T1-d0 + T2-d1 = 0.39 thắng mọi cấu hình khác.',
            { total: 0.39, limit: 0.90 },
            asScene('solve', tr, dt, [[0.21, 10], [10, 0.18]], [[0, 0], [1, 1]]), 2600),
          fr('Khớp → correct; dư → nhánh khác', [5, 6], 'T1/T2 đi correct ngay (node kalman). Phần dư đi hai nhánh: detection lẻ → track mới tạm; track lẻ → kéo-dài-dự-đoán (coasting).',
            { matched: 2, new_track: 0, coasting: 0 },
            asScene('matched', tr, dt, [[0.21, 10], [10, 0.18]], [[0, 0], [1, 1]]), 2400)
        ];
      }
    },
    {
      id: 'edge', label: 'Hai xe dính một blob — từ chối ghép bừa',
      build: function () {
        var tr = [{ id: 'T1', pred: [360, 320], vel: [40, 0], lbl: [-58, -44] }, { id: 'T2', pred: [430, 330], vel: [-30, 0], lbl: [58, -44] }];
        var dt = [{ id: 'd0', pt: [395, 325], merged: true, lbl: [0, 58] }];
        return [
          fr('Một blob che cả hai dự đoán', [0, 3], 'Hai xe sát nhau chảy thành một blob lớn (tím). occlusion_guard đánh dấu nó "mập mờ-merged": đây KHÔNG phải một bản đo hợp lệ của một xe.',
            { ambiguous_merged: true }, asScene('setup', tr, dt), 2600),
          fr('Cột merged = 10: không ai được nhận', [3, 4], 'Toàn cột của detection mập mờ gán điểm 10 — vượt ngưỡng 0.90, solver không thể chọn. Đứng yên rẻ hơn gán sai: hai track tạm trùng ô an toàn hơn hai xe đổi ID.',
            { cost_col: 10 },
            asScene('matrix', tr, dt, [[10], [10]]), 2600),
          fr('Không phân thắng → hoãn, không nhận hòa', [5], 'Sau khoảng mất dấu/merged, hai lựa chọn gần-ngang nhau chính là nơi đổi-ID hay xảy ra → giữ cả hai track kéo-dài, đợi xe tách rõ thay vì nhận kết quả hòa của solver.',
            { margin: 'insufficient → defer' },
            asScene('deferred', tr, dt, [[10], [10]], []), 2800),
          fr('Kết quả: hai track kéo-dài chờ', [5], 'Không correct, không sinh track mới từ blob này. Hai track sang bước coasting chờ xe tách ra.',
            { unmatched_tracks: 2, ambiguous: 1 },
            asScene('deferred', tr, dt, [[10], [10]], []), 2400)
        ];
      }
    }
  ],
  draw: function (ctx, frame, view) { drawAssign(ctx, frame, view); }
};

/* ================================================================
 * NODE 5 — coasting : khi xe tạm mất dấu
 * ================================================================ */
function coastScene(stage, path, predicted, age, limit, ttl, extra) {
  var s = { type: 'coast', stage: stage, path: path || [], predicted: predicted || [], age: age, limit: limit, ttl: ttl };
  if (extra) for (var k in extra) s[k] = extra[k];
  return s;
}
function drawCoast(ctx, frame, view) {
  var s = frame.scene, t = ease(view.progress);
  viewScale(ctx, view);
  rr(ctx, 40, 60, 720, 300, 10, '#161b2e', '#2a3248');
  // đường đo thật (liền) rồi đường dự đoán (đứt)
  for (var i = 1; i < s.path.length; i++) arrow(ctx, s.path[i - 1][0], s.path[i - 1][1], s.path[i][0], s.path[i][1], '#f0a93c', 2);
  s.path.forEach(function (p, i2) { dot(ctx, p[0], p[1], 6, '#f0a93c', '#0c0f1a'); });
  var nPred = s.predicted.length;
  for (var j = 0; j < nPred; j++) {
    var p2 = s.predicted[j], show = j / Math.max(1, nPred - 1) <= t || s.stage !== 'decay';
    if (!show) continue;
    dot(ctx, p2[0], p2[1], 6, '#4f9cf7');
    if (j === 0) arrow(ctx, s.path[s.path.length - 1][0], s.path[s.path.length - 1][1], p2[0], p2[1], '#4f9cf7', 2, [6, 5]);
    else arrow(ctx, s.predicted[j - 1][0], s.predicted[j - 1][1], p2[0], p2[1], '#4f9cf7', 2, [6, 5]);
  }
  // thanh age → limit → ttl
  var bx = 80, by = 390, bw = 560;
  rr(ctx, bx, by, bw, 16, 8, '#2a3248');
  var lim = s.limit || 1, ttl = s.ttl || 1, ageV = Math.min((s.age * t) / ttl, 1) * bw;
  rr(ctx, bx, by, ageV, 16, 8, s.age < lim ? '#3fce7c' : s.age < ttl ? '#f0a93c' : '#f2555a');
  var lx = bx + (lim / ttl) * bw;
  ctx.strokeStyle = '#f0a93c'; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(lx, by - 6); ctx.lineTo(lx, by + 22); ctx.stroke();
  txt(ctx, lx, by - 14, 'age limit ' + lim + 's', '#f0a93c', 11, 'center');
  txt(ctx, bx + bw, by - 14, 'TTL ' + ttl + 's', '#f2555a', 11, 'right');
  callout(ctx, 'age ' + s.age + 's', bx + Math.max(6, ageV), by + 8, -16, 34, '#e8ecf4');
  if (s.stage === 'stale') badge(ctx, 570, 380, 'stale_prediction — neo về điểm đo cuối', '#b8791f');
  if (s.stage === 'reacquire') badge(ctx, 570, 380, 'reacquired trong cửa sổ → correct', '#2e8b57');
  if (s.stage === 'expire') badge(ctx, 570, 380, 'quá TTL → expired → notify manager+binder', '#a02c34');
  ctx.restore();
}
var nodeCoast = {
  id: 'coasting', title: 'Khi xe tạm mất dấu', group: 'local',
  summary: 'Track không chết ngay khi xe khuất khỏi ảnh — dự đoán kéo dài có giới hạn, rồi hoặc nối lại hoặc chết hẳn theo giây đồng hồ.',
  answers: {
    does: 'Track không được ghép: tăng tuổi-mất-đo theo GIÂY thật; dự đoán kéo dài với vận tốc yếu dần, quá 0.40s thì neo về điểm đo cuối; detection hợp lệ trong cửa sổ tìm-lại → khớp; quá TTL (~4.5s) → chết hẳn. Có bằng chứng bị che/merged thì "đóng băng" thay vì trôi.',
    role: 'Chạy ngay sau ghép cho mọi track bị bỏ lại — song song nhánh khớp→correct. Mất nó: mỗi cái che ngắn đều sinh ID mới (không kéo dài) hoặc track ma sống mãi gây nhiễu ghép.',
    where: 'Xử lý unmatched tại motion_tracker.py:2257-2317; decay/stale :263-288; TTL theo giây :2189-2202; báo ra ngoài two_camera.py:2690-2716.',
    why: 'Comment: "xe dừng thường không để pixel foreground; không để vận tốc cũ kéo identity theo đường xe kế" (:259-261) → decay; TTL theo giây vì "đếm frame dãn ra khi FPS thấp — ở 7FPS, 90 frame giữ >13s dù chỉ nối lại được 1.5-3s" (:2189-2202).'
  },
  refs: [
    { path: SRC, line: 263, symbol: 'velocity decay + stale', excerptStart: 263,
      excerpt: '                    decay = float(\n                        np.exp(-age / self.prediction_velocity_decay_seconds)\n                    )\n                    if age > self._prediction_age_limit_seconds(track):\n                        point = measured_point\n                        track.prediction_source = "stale_prediction"\n                        track.velocity_confidence = 0.0' },
    { path: SRC, line: 2258, symbol: 'unmatched → age/stale', excerptStart: 2258,
      excerpt: '        for track_id in unmatched_tracks:\n            track = self._tracks[track_id]\n            track.age += 1\n            track.consecutive_invisible_count += 1\n            track.prediction_age_s = self._prediction_age_seconds(track)' },
    { path: SRC, line: 2279, symbol: 'frozen vs coasting', excerptStart: 2279,
      excerpt: '                track.association_state = "frozen_ambiguous" if frozen else "coasting"\n                track.observation_kind = \'occluded_prediction\' if frozen else \'prediction\'' },
    { path: SRC, line: 2189, symbol: 'TTL đo theo giây', excerptStart: 2189,
      excerpt: '    def _lost_beyond_ttl_seconds(self, track: TrackedVehicle) -> bool:\n        """Has this fragment been unmatched for longer than the duration TTL?\n\n        Frame-counted TTLs stretch with the processing rate: at ~7 FPS the\n        90-frame default kept fragments for over 13 seconds even though they\n        stopped being re-associable after 1.5-3 seconds. Timestamp-less\n        callers keep the frame-only behaviour.' }
  ],
  pseudocode: [
    'unmatched → invisible++, age += Δt giây',
    'predict = measured + (kalman−measured)·e^(−age/0.25s)',
    'age > 0.40s → stale_prediction, neo về điểm đo cuối',
    'occlusion/ambiguous → frozen, còn lại coasting',
    'blob hợp lệ trong cửa sổ reacquire → match → correct',
    'invisible > TTL (frame) hoặc age > ttl giây → expired'
  ],
  scenarios: [
    {
      id: 'normal', label: 'Mất 2 frame rồi nối lại trong cửa sổ',
      build: function () {
        var P1 = [[160, 320], [230, 300], [300, 282]];
        return [
          fr('Track đang khớp đều đặn', [0], 'Đường cam liền: mỗi frame một bản đo thật, Kalman correct đều — xe chạy ổn định.',
            { invisible: 0, source: 'measurement' },
            coastScene('detect', P1, [], 0, 0.4, 4.5), 2200),
          fr('Xe khuất/bị che — 0 detection hợp lệ', [0, 1], 'Frame này detect không có gì qua cổng: track bị bỏ lại → invisible=1, nhưng predict vẫn vẽ tiếp đường đứt phía trước.',
            { invisible: 1, source: 'kalman_prediction' },
            coastScene('decay', P1, [[368, 266]], 0.1, 0.4, 4.5), 2600),
          fr('Dự đoán mất dần "đà"', [1], 'Điểm predict = điểm-đo-cuối + (dự-đoán-kalman − điểm-đo-cuối)·e^(−tuổi/0.25s) — mất càng lâu, đường đứt càng ít chạy thêm, tránh bám sang xe kế.',
            { invisible: 2, decay: 'e^−(0.2/0.25)≈0.45' },
            coastScene('decay', P1, [[368, 266], [410, 258]], 0.2, 0.4, 4.5), 2800),
          fr('Xe lộ lại trong cửa sổ tìm-lại', [4], 'Blob mới khớp dự đoán + ngoại hình → ghép được → correct → invisible về 0, nguồn dự đoán quay lại "bản đo". Cùng track, không ID mới.',
            { reacquired: true, invisible: 0 },
            coastScene('reacquire', P1.concat([[452, 250]]), [], 0, 0.4, 4.5), 2600)
        ];
      }
    },
    {
      id: 'edge', label: 'Mất quá lâu — stale rồi expired theo giây',
      build: function () {
        var P1 = [[160, 320], [230, 300], [300, 282]];
        return [
          fr('Mất dấu kéo dài', [0, 1], 'Số frame không-đo tích lũy; dự đoán ban đầu vẫn chạy theo vận tốc cũ nhưng đã yếu dần — xe được "kéo dài" có hạn.',
            { invisible: 5, age: '0.35s' },
            coastScene('decay', P1, [[368, 266]], 0.35, 0.4, 4.5), 2600),
          fr('Quá 0.40s: ngừng ngoại suy, neo về điểm đo cuối', [2], 'Nguồn dự đoán chuyển thành stale_prediction: điểm kỳ vọng kẹp về điểm đo cuối thật, độ-tin-vận-tốc về 0. Track chỉ còn tìm-lại quanh điểm đo CUỐI — không đuổi theo "bóng ma" vận tốc.',
            { source: 'stale_prediction', anchor: 'measured' },
            coastScene('stale', P1, [], 0.45, 0.4, 4.5, { anchor: [300, 282] }), 2800),
          fr('Quá cửa sổ + quá TTL → chết hẳn', [5], 'Hết cửa sổ tìm-lại và mất-đo vượt TTL (~4.5s): track rời pool → expired. Track tạm chết lặng; track đã xác nhận → LOST rồi báo cho manager + binder.',
            { expired: true, notify: 'manager + binder' },
            coastScene('expire', P1, [], 4.6, 0.4, 4.5), 2800),
          fr('Điểm giao với nhánh ngoài', [5], 'Track chết/mất được báo ra ngoài → identity (handoff, builder B) và occupancy (builder C phía ô đỗ) quyết tiếp — tracking cục bộ kết thúc ở đây.',
            { boundary: 'handoff/occupancy' },
            coastScene('expire', P1, [], 4.6, 0.4, 4.5), 2600)
        ];
      }
    }
  ],
  draw: function (ctx, frame, view) { drawCoast(ctx, frame, view); }
};

P.local = [nodeRoi, nodeMotion, nodeKalman, nodeAssign, nodeCoast];
})();
