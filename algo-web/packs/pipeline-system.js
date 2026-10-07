/* TechGar2 pipeline V2 — pack SYSTEM (builder C): 4 node
 * capture · snapshot · gate-session · navigation.
 * Contract SPEC §5: TechGarPipelinePacks.system = [nodes].
 * Visuals: 2-camera sync, JSON mailbox, gate/session lifecycle, A* routing.
 * Mọi số liệu scene là minh họa (trừ ngưỡng có dẫn chứng: skew default 120ms,
 * QR 120s, off-route 75/80).
 */
(function () {
  'use strict';
  var TGP = window.TechGarPipelineEngine;
  var h = TGP.h;
  var TAU = Math.PI * 2;

  window.TechGarPipelinePacks = window.TechGarPipelinePacks || {};

  /* ================= helpers dùng chung trong pack ================= */

  function panel(ctx, x, y, w, hh, title, color) {
    h.box(ctx, x, y, w, hh, 10, '#101a35', color || '#2b3f6e');
    if (title) h.txt(ctx, title, x + 10, y + 15, { size: 11, weight: 700, color: '#8fa3c8' });
  }
  function chipRow(ctx, chips, x, y, w) {
    var cw = Math.min(64, (w - 8) / chips.length - 6);
    chips.forEach(function (c, i) {
      var cx = x + i * (cw + 8);
      var dim = c.state === 'old', hit = c.state === 'latest', bad = c.state === 'drop';
      h.box(ctx, cx, y, cw, 24, 5,
        hit ? '#2b5fd9' : bad ? '#3a1524' : '#182446',
        hit ? '#7cc4ff' : bad ? '#d66a8a' : dim ? '#3a4f8c' : '#3a4f8c');
      h.mono(ctx, c.label, cx + cw / 2, y + 12, {
        size: 9.5, align: 'center',
        color: hit ? '#fff' : bad ? '#f3a9c0' : dim ? '#55648c' : '#9db2d8'
      });
      if (bad || dim) {
        ctx.strokeStyle = '#d66a8a'; ctx.lineWidth = 1.4;
        ctx.beginPath(); ctx.moveTo(cx + 5, y + 5); ctx.lineTo(cx + cw - 5, y + 19); ctx.stroke();
      }
    });
  }
  function miniCam(ctx, x, y, w, hh, label, carT, t) {
    panel(ctx, x, y, w, hh, label, '#3a4f8c');
    /* đường trong khung cam */
    var ry = y + hh * 0.52;
    ctx.fillStyle = '#16223f'; ctx.fillRect(x + 8, ry, w - 16, hh * 0.42);
    ctx.strokeStyle = '#4a5680'; ctx.setLineDash([8, 6]); ctx.lineWidth = 1.4;
    ctx.beginPath(); ctx.moveTo(x + 12, ry + hh * 0.21); ctx.lineTo(x + w - 12, ry + hh * 0.21); ctx.stroke();
    ctx.setLineDash([]);
    h.car(ctx, x + 14 + carT * (w - 54), ry + hh * 0.21, 0, { color: '#4d8dff', len: 26, wid: 14 });
    h.mono(ctx, t, x + 10, y + hh - 10, { size: 9.5, color: '#7d90bd' });
  }
  function fakeQR(ctx, x, y, s, dim) {
    h.box(ctx, x - 6, y - 6, s + 12, s + 12, 8, '#f4f6fb', '#c7cfdd');
    var n = 11, cell = s / n;
    for (var r = 0; r < n; r++) for (var c = 0; c < n; c++) {
      var on = ((r * 31 + c * 17 + r * c * 7) % 5) < 2;
      var corner = (r < 3 && c < 3) || (r < 3 && c > n - 4) || (r > n - 4 && c < 3);
      if (on || corner) {
        ctx.fillStyle = corner ? '#0b1020' : '#26314f';
        ctx.fillRect(x + c * cell + 0.5, y + r * cell + 0.5, cell - 1, cell - 1);
      }
    }
    if (dim) {
      ctx.fillStyle = 'rgba(11,16,32,.62)'; ctx.fillRect(x - 6, y - 6, s + 12, s + 12);
      h.txt(ctx, 'ẨN', x + s / 2, y + s / 2, { size: 13, weight: 800, color: '#f3a9c0', align: 'center' });
    }
  }

  /* ================= NODE 1: capture ================= */

  function drawCapture(ctx, frame, view) {
    var w = view.width, hh = view.height, s = frame.scene, pr = view.progress;
    var pw = Math.min(300, w * 0.36), ph = hh * 0.42, py = 46;
    var ax = 18, bx = w - 18 - pw;
    /* timestamps là số (giây) — skew luôn derive từ clock đang hiển thị,
       catchup: đồng hồ cam chậm quét từ giá trị cũ lên giá trị mới */
    var tA = s.tA, tB = s.tB;
    if (s.catchupFrom != null) {
      tB = s.catchupFrom + (s.tB - s.catchupFrom) * h.easeOut(Math.min(1, pr * 1.15));
    }
    var skew = Math.round(Math.abs(tA - tB) * 1000);
    var tAs = 't=' + tA.toFixed(3) + 's', tBs = 't=' + tB.toFixed(3) + 's';
    /* hai cam */
    miniCam(ctx, ax, py, pw, ph, 'CAM 1', s.camA, tAs);
    miniCam(ctx, bx, py, pw, ph, 'CAM 2', s.camB, tBs);
    /* hàng frame queue */
    h.txt(ctx, 'grab-thread → queue', ax, py + ph + 14, { size: 10, color: '#7d90bd' });
    chipRow(ctx, s.queueA, ax, py + ph + 24, pw);
    h.txt(ctx, 'grab-thread → queue', bx, py + ph + 14, { size: 10, color: '#7d90bd' });
    chipRow(ctx, s.queueB, bx, py + ph + 24, pw);
    /* đồng hồ skew ở giữa */
    var gx = w / 2, gy = py + 10, gh = ph - 30;
    h.txt(ctx, 'skew', gx, gy - 8, { size: 11, weight: 700, align: 'center', color: '#a9bce4' });
    var maxSkew = 140, frac = Math.min(1, skew / maxSkew);
    h.box(ctx, gx - 9, gy + 8, 18, gh, 9, '#141d36', '#3a4f8c');
    var fy = gy + 8 + gh - frac * gh;
    ctx.fillStyle = skew <= 120 ? '#57c78a' : '#f3a9c0';
    ctx.fillRect(gx - 7, fy, 14, gy + 8 + gh - fy);
    var thY = gy + 8 + gh - (120 / maxSkew) * gh;
    ctx.strokeStyle = '#ffd75e'; ctx.setLineDash([4, 3]); ctx.lineWidth = 1.6;
    ctx.beginPath(); ctx.moveTo(gx - 14, thY); ctx.lineTo(gx + 14, thY); ctx.stroke(); ctx.setLineDash([]);
    h.mono(ctx, '120ms', gx + 20, thY, { size: 9, color: '#ffd75e' });
    h.txt(ctx, skew + ' ms', gx, fy - 10, { size: 12, weight: 800, align: 'center', color: skew <= 120 ? '#57c78a' : '#f3a9c0' });
    /* pulse đọc frame */
    if (s.catchup) {
      var p = h.pulseDot(ctx, { x: gx - 40, y: py + ph * 0.6 }, { x: bx + pw / 2, y: py + ph * 0.6 }, pr, { color: '#57c78a' });
      h.txt(ctx, 'đọc bù', p.x, p.y - 16, { size: 9.5, align: 'center', color: '#57c78a' });
    }
    /* cặp đồng bộ */
    var cardY = py + ph + 62;
    if (s.pair) {
      var t = h.easeOut(Math.min(1, pr * 1.6));
      ctx.save(); ctx.globalAlpha = t;
      var cw = Math.min(360, w - 40);
      h.box(ctx, w / 2 - cw / 2, cardY, cw, 54, 10, '#12233d', '#57c78a');
      h.txt(ctx, 'CẶP ĐỒNG BỘ', w / 2 - cw / 2 + 12, cardY + 16, { size: 10, weight: 700, color: '#57c78a' });
      h.mono(ctx, 'cam1 ' + tAs + '  +  cam2 ' + tBs, w / 2, cardY + 36, { size: 11, align: 'center', color: '#eaf1ff' });
      h.arrow(ctx, ax + pw / 2, cardY - 8, w / 2 - cw / 2 + 30, cardY + 4, { color: '#57c78a', width: 1.6 });
      h.arrow(ctx, bx + pw / 2, cardY - 8, w / 2 + cw / 2 - 30, cardY + 4, { color: '#57c78a', width: 1.6 });
      ctx.restore();
    }
    if (s.verdict) {
      h.pill(ctx, s.verdict, w / 2, cardY + (s.pair ? 76 : 20), {
        bg: s.verdictOk ? '#122e22' : '#3a1524',
        border: s.verdictOk ? '#57c78a' : '#d66a8a',
        color: s.verdictOk ? '#7be2a8' : '#f3a9c0', size: 11, align: 'center'
      });
    }
  }

  function chips(labels, latestIdx, dropFrom) {
    return labels.map(function (L, i) {
      return { label: L, state: i === latestIdx ? 'latest' : i < (dropFrom == null ? latestIdx : dropFrom) ? 'drop' : 'old' };
    });
  }

  var captureNode = {
    id: 'capture', title: 'Camera & đồng bộ frame', group: 'input',
    summary: 'Hai grab-thread đọc liên tục, loop chỉ lấy frame MỚI NHẤT từ mỗi cam rồi ghép cặp theo timestamp.',
    answers: {
      does: 'Đọc frame mới nhất của cam1 + cam2 (bỏ frame cũ trong queue), đo skew giữa hai timestamp, ghép thành cặp đồng bộ hoặc đọc bù/báo end-of-stream.',
      role: 'Điểm vào của mọi vòng loop — mất nó không có dữ liệu cho tracking/binder/snapshot. Chạy đầu tiên, trước binder.begin_frame.',
      where: 'two_camera.run(): LatestFrameCapture.read_latest_timed (two_camera.py:2463) → synchronize_live_frames (two_camera.py:2482); grab-thread trong src/techgar/latest_frame_capture.py:62-64.',
      why: 'read_latest_timed chỉ lấy sequence mới hơn lần trước và bỏ stale (:81-91) — nguồn gốc kiểu "latest-only" của cả pipeline. [suy luận: chọn latest thay vì queue để không tích lũy lag khi xử lý chậm hơn FPS camera.]'
    },
    refs: [
      { path: 'backend/main_detect/src/techgar/latest_frame_capture.py', line: 62, symbol: 'grab thread — latest-only', excerptStart: 61, excerpt: '                if ok and frame is not None:\n                    self._latest_frame = frame\n                    self._latest_timestamp_ns = time.monotonic_ns()\n                    self._sequence += 1\n                    self._consecutive_failures = 0' },
      { path: 'backend/main_detect/src/techgar/latest_frame_capture.py', line: 81, symbol: 'read_latest_timed → _read_latest_item', excerptStart: 78, excerpt: '        with self._condition:\n            while (\n                not self._stopped\n                and (self._latest_frame is None or self._sequence <= after_sequence)\n            ):' },
      { path: 'backend/main_detect/two_camera.py', line: 2463, symbol: 'read_latest_timed callsite', excerptStart: 2462, excerpt: '                            if isinstance(capture, LatestFrameCapture):\n                                frame, sequence, captured_at_ns = capture.read_latest_timed(\n                                    after_sequence=capture_sequences[camera_id], timeout=5.0\n                                )' },
      { path: 'backend/main_detect/two_camera.py', line: 2482, symbol: 'synchronize_live_frames', excerptStart: 2480, excerpt: '                    if stream_ended or any(f is None for f in frames.values()):\n                        break\n                    synchronize_live_frames(\n                        captures, frames, capture_sequences, capture_timestamps_ns,\n                        args.max_camera_skew_ms, args.sync_catchup_reads,\n                    )' }
    ],
    pseudocode: [
      'đọc frame mới nhất cam1 (bỏ stale)',
      'đọc frame mới nhất cam2 (bỏ stale)',
      'skew = |t1 − t2|, so với max_camera_skew_ms',
      'lệch quá → catchup read cam chậm / dừng nếu hết stream',
      'ghi frames[cam] + capture_timestamps_ns',
      'vào vòng loop → binder.begin_frame'
    ],
    scenarios: [
      {
        id: 'sync-ok', label: 'Đồng bộ bình thường',
        build: function () {
          return [
            { title: 'Grab-thread đọc liên tục', explanation: 'Mỗi camera một thread riêng liên tục đẩy frame vào ô nhớ 1-slot — frame cũ bị ghi đè ngay, không có hàng đợi tích lũy.',
              durationMs: 1800, activeLines: [0, 1],
              state: { 'cam1 seq': 104, 'cam2 seq': 98, 'queue': 'chỉ giữ frame mới nhất' },
              scene: { camA: 0.25, camB: 0.2, tA: 12.041, tB: 12.055, queueA: chips(['f101', 'f102', 'f103', 'f104'], 3, 0), queueB: chips(['f95', 'f96', 'f97', 'f98'], 3, 0), pair: false } },
            { title: 'read_latest_timed — chỉ mới nhất', explanation: 'Loop gọi read_latest_timed(after_sequence): trả frame mới hơn lần đọc trước hoặc chờ timeout 5s — các frame lỡ nhịp bị bỏ.',
              durationMs: 1800, activeLines: [0, 1],
              state: { lấy: 'f104 (cam1) + f98 (cam2)', bỏ_qua: 'f101–f103 · f95–f97' },
              scene: { camA: 0.4, camB: 0.35, tA: 12.041, tB: 12.055, queueA: chips(['f101', 'f102', 'f103', 'f104'], 3, 0), queueB: chips(['f95', 'f96', 'f97', 'f98'], 3, 0), pair: false } },
            { title: 'Đo skew giữa 2 timestamp', explanation: 'synchronize_live_frames so |t1−t2| với --max-camera-skew-ms. 14ms < 120ms (--max-camera-skew-ms default 120.0, two_camera.py:1997) → cặp hợp lệ.',
              durationMs: 1800, activeLines: [2],
              state: { skew_ms: 14, ngưỡng: '120ms (--max-camera-skew-ms default)', verdict: 'trong ngưỡng' },
              scene: { camA: 0.4, camB: 0.35, tA: 12.041, tB: 12.055, queueA: chips(['f101', 'f102', 'f103', 'f104'], 3, 0), queueB: chips(['f95', 'f96', 'f97', 'f98'], 3, 0), pair: false } },
            { title: 'Ghép cặp cùng thời điểm', explanation: 'Hai frame + timestamps đi vào frames[camera_id] / capture_timestamps_ns — nền để tracking, handoff và camera_skew_ms của snapshot.',
              durationMs: 1800, activeLines: [3, 4],
              state: { 'frames[cam1]': 'f104', 'frames[cam2]': 'f98', skew_ms: 14 },
              scene: { camA: 0.4, camB: 0.35, tA: 12.041, tB: 12.055, queueA: chips(['f101', 'f102', 'f103', 'f104'], 3, 0), queueB: chips(['f95', 'f96', 'f97', 'f98'], 3, 0), pair: true, verdict: 'CHẤP NHẬN', verdictOk: true } },
            { title: 'Vào vòng loop', explanation: 'frame_index += 1 → binder.begin_frame() → áp parking evidence → tracking. Cặp frame này là input duy nhất của cả vòng.',
              durationMs: 1600, activeLines: [4, 5],
              state: { frame_index: 'n+1', next: 'begin_frame → tracking' },
              scene: { camA: 0.55, camB: 0.5, tA: 12.041, tB: 12.055, queueA: chips(['f101', 'f102', 'f103', 'f104'], 3, 0), queueB: chips(['f95', 'f96', 'f97', 'f98'], 3, 0), pair: true, verdict: '→ LOOP', verdictOk: true } }
          ];
        }
      },
      {
        id: 'skew-recover', label: 'Cam2 trễ → đọc bù',
        build: function () {
          return [
            { title: 'Cam2 trễ nhịp', explanation: 'Cam1 có frame t=12.041 nhưng cam2 mới nhất chỉ t=11.920 — mạng cam2 lag, grab-thread chưa kịp ghi frame mới.',
              durationMs: 1800, activeLines: [0, 1],
              state: { 'cam1': 'f104 · t=12.041', 'cam2': 'f97 · t=11.920', skew_ms: 121 },
              scene: { camA: 0.4, camB: 0.1, tA: 12.041, tB: 11.920, queueA: chips(['f101', 'f102', 'f103', 'f104'], 3, 0), queueB: chips(['f94', 'f95', 'f96', 'f97'], 3, 0), pair: false } },
            { title: 'skew vượt ngưỡng', explanation: '|12.041 − 11.920| = 121ms > 120ms (max_camera_skew_ms default) → cặp này lệch pha, không đem đi track cùng lúc.',
              durationMs: 1700, activeLines: [2, 3],
              state: { skew_ms: 121, ngưỡng: '120ms (default)', verdict: 'VƯỢT — xử lý' },
              scene: { camA: 0.4, camB: 0.1, tA: 12.041, tB: 11.920, queueA: chips(['f101', 'f102', 'f103', 'f104'], 3, 0), queueB: chips(['f94', 'f95', 'f96', 'f97'], 3, 0), pair: false, verdict: 'SKEW > NGƯỠNG', verdictOk: false } },
            { title: 'catchup read cam chậm', explanation: 'synchronize_live_frames dùng sync_catchup_reads: đọc thêm từ cam chậm cho tới khi bắt kịp timestamp — grab-thread vẫn đang ghi frame mới.',
              durationMs: 2000, activeLines: [3],
              state: { catchup: 'cam2 đọc bù', 'f98': 't=12.048 (mới)' },
              scene: { camA: 0.4, camB: 0.55, tA: 12.041, tB: 12.048, catchupFrom: 11.920, catchup: true, queueA: chips(['f101', 'f102', 'f103', 'f104'], 3, 0), queueB: chips(['f95', 'f96', 'f97', 'f98'], 3, 0), pair: false } },
            { title: 'skew kéo về ngưỡng', explanation: 'Sau đọc bù, cặp mới lệch 7ms — trong ngưỡng. Nếu hết stream (replay/EOF) thì break, không bịa frame.',
              durationMs: 1700, activeLines: [2, 3],
              state: { skew_ms: 7, verdict: 'trong ngưỡng' },
              scene: { camA: 0.4, camB: 0.55, tA: 12.041, tB: 12.048, queueA: chips(['f101', 'f102', 'f103', 'f104'], 3, 0), queueB: chips(['f95', 'f96', 'f97', 'f98'], 3, 0), pair: false } },
            { title: 'Cặp chấp nhận', explanation: 'Cơ chế catchup cứu được cặp frame thay vì bỏ cả vòng — pipeline tiếp tục với cặp lệch 7ms.',
              durationMs: 1600, activeLines: [4, 5],
              state: { pair: 'f104 + f98', skew_ms: 7 },
              scene: { camA: 0.4, camB: 0.55, tA: 12.041, tB: 12.048, queueA: chips(['f101', 'f102', 'f103', 'f104'], 3, 0), queueB: chips(['f95', 'f96', 'f97', 'f98'], 3, 0), pair: true, verdict: 'CHẤP NHẬN', verdictOk: true } }
          ];
        }
      }
    ],
    draw: drawCapture
  };

  /* ================= NODE 2: snapshot ================= */

  var SNAP_FIELDS = [
    { k: 'vehicles', c: '#4d8dff' }, { k: 'parking_slots', c: '#57c78a' },
    { k: 'parking_episodes', c: '#ffd75e' }, { k: 'pending_confirms', c: '#c9a24d' },
    { k: 'pending_handoffs', c: '#b78bff' }, { k: 'recent_events', c: '#8fa3c8' }
  ];

  function drawSnapshot(ctx, frame, view) {
    var w = view.width, hh = view.height, s = frame.scene, pr = view.progress;
    /* cột field bên trái */
    var fx = 18, fy0 = 46, fh = 26;
    h.txt(ctx, 'registry + binders', fx, 34, { size: 11, weight: 700, color: '#8fa3c8' });
    SNAP_FIELDS.forEach(function (f, i) {
      var y = fy0 + i * (fh + 8);
      var lit = s.lit == null || i < s.lit;
      h.box(ctx, fx, y, 132, fh, 6, lit ? '#1d2a4c' : '#141a30', lit ? f.c : '#2b3a63');
      h.mono(ctx, f.k, fx + 8, y + fh / 2, { size: 9.5, color: lit ? '#eaf1ff' : '#55648c' });
      if (lit) h.arrow(ctx, fx + 136, y + fh / 2, fx + 158, y + fh / 2, { color: f.c, width: 1.4, head: 5 });
    });
    /* envelope JSON giữa */
    var ex = fx + 170, ew = Math.min(230, w * 0.3), ey = 46, eh = fh * 6 + 46;
    panel(ctx, ex, ey, ew, eh, 'runtime snapshot', '#57c78a');
    var keys = ['"schema_version": 2', '"runtime_id": "rt-01"', '"frame_index": 1042', '"vehicles": [3]', '"parking_slots": [12]', '"parking_episodes": [1]', '"pending_...": […]', '"retired_global_ids": {}'];
    keys.forEach(function (k, i) {
      var on = s.envKeys == null || i < s.envKeys;
      h.mono(ctx, k, ex + 12, ey + 34 + i * 21, { size: 10, color: on ? '#b8c6e6' : '#39466b' });
    });
    /* mailbox 1-slot */
    var mx = ex + ew + 40, mw = Math.max(90, w - mx - 150), my = 60, mh = 90;
    panel(ctx, mx, my, mw, mh, 'mailbox (1 slot)', '#c9a24d');
    var envIn = s.mailbox;
    if (envIn) {
      var slide = s.slide ? h.easeOut(pr) : 1;
      var envX = h.lerp(ex + ew + 12, mx + 12, slide);
      h.box(ctx, envX, my + 26, 56, 30, 5, '#2b5fd9', '#7cc4ff');
      h.mono(ctx, envIn, envX + 28, my + 41, { size: 9, align: 'center', color: '#fff' });
      if (s.ghost) {
        ctx.globalAlpha = 0.25;
        h.box(ctx, mx + 12, my + 60, 56, 22, 5, '#1d2a4c', '#55648c');
        h.mono(ctx, s.ghost + ' ✕', mx + 40, my + 71, { size: 8, align: 'center', color: '#f3a9c0' });
        ctx.globalAlpha = 1;
      }
    } else {
      h.mono(ctx, '(trống)', mx + mw / 2, my + mh / 2, { size: 10, align: 'center', color: '#55648c' });
    }
    if (s.lit >= 3 || s.slide) h.arrow(ctx, ex + ew, ey + eh / 2, mx - 2, my + mh / 2, { color: '#57c78a', width: 2 });
    /* consumers */
    var cy = my + mh + 40;
    [['GATE ctrl', 'poll 0.25s', s.pollGate, '#57c78a'], ['FRONTEND', 'poll 200ms', s.pollFe, '#4d8dff']].forEach(function (c, i) {
      var yy = cy + i * 66;
      panel(ctx, mx, yy, mw, 52, c[0], c[3]);
      h.mono(ctx, c[1], mx + 10, yy + 20, { size: 9.5, color: '#8fa3c8' });
      if (c[2]) {
        var t = h.easeOut(Math.min(1, pr * 1.5));
        ctx.globalAlpha = t;
        h.arrow(ctx, mx + mw / 2, my + mh + 4, mx + mw / 2, yy - 2, { color: c[3], width: 2 });
        h.pill(ctx, 'GET /api/runtime/snapshot', mx + mw / 2, yy + 38, { size: 8.5, bg: '#182446', border: c[3], color: c[3], align: 'center' });
        ctx.globalAlpha = 1;
      } else {
        h.mono(ctx, i === 0 ? 'chờ tick…' : 'chờ tick…', mx + 10, yy + 38, { size: 9, color: '#55648c' });
      }
    });
    /* dropped counter */
    if (s.dropped != null) {
      h.pill(ctx, 'dropped: ' + s.dropped + ' · queue size: 1', mx + mw / 2, my - 12, { size: 9.5, bg: '#3a1524', border: '#d66a8a', color: '#f3a9c0', align: 'center' });
    }
    /* snapshot cũ → consumers từ chối */
    if (s.stale) {
      ctx.globalAlpha = 0.55;
      ctx.fillStyle = '#0b1020'; ctx.fillRect(mx, my, mw, mh);
      ctx.globalAlpha = 1;
      h.pill(ctx, 'STALE (age > 5s) — _fresh_live REJECT', mx + mw / 2, my + mh / 2 + 8, { size: 10, bg: '#3a1524', border: '#d66a8a', color: '#f3a9c0', align: 'center' });
      h.mono(ctx, 'frontend: watchdog → unknown', mx + mw / 2, my + mh / 2 + 32, { size: 9.5, align: 'center', color: '#f3a9c0' });
    }
    h.txt(ctx, '≈5Hz publish · consumer async, không nằm trong vòng frame', 18, hh - 14, { size: 10.5, color: '#7d90bd' });
  }

  var snapshotNode = {
    id: 'snapshot', title: 'Snapshot & API', group: 'output',
    summary: 'Mỗi vòng loop build một object schema v2 → publish vào mailbox 1-slot; API trả bản mới nhất cho mọi consumer.',
    answers: {
      does: 'build_runtime_snapshot gom vehicles/slots/episodes/pending/handoffs/events + health → runtime_publisher.publish_snapshot vào mailbox latest-only; GET /api/runtime/snapshot trả JSON mới nhất.',
      role: 'Cổng ra duy nhất của backend. Không có nó, gate controller và frontend không có gì để đọc. Chạy cuối mỗi vòng loop sau khi binder finalize.',
      where: 'build_runtime_snapshot (runtime_contract.py:134-168), callsite publish (two_camera.py:2841-2870), mailbox RuntimeState.publish_snapshot (runtime_server.py:106-113), endpoint (runtime_server.py:285).',
      why: 'Cơ chế tại publish_snapshot (:106-113): mailbox là MỘT slot `self._snapshot` bị ghi đè mỗi lần publish — reader chỉ giữ lock để copy bytes đã encode sẵn. Cùng ý đồ "latest-only" với comment MJPEG frames :134-135. [suy luận mục tiêu: consumer chậm không làm nghẽn vòng camera.]'
    },
    refs: [
      { path: 'backend/main_detect/two_camera.py', line: 2844, symbol: 'publish_snapshot callsite', excerptStart: 2841, excerpt: '                if runtime_publisher is not None:\n                    cam1_ns = capture_timestamps_ns.get("cam1", 0)\n                    cam2_ns = capture_timestamps_ns.get("cam2", 0)\n                    runtime_publisher.publish_snapshot(\n                        build_runtime_snapshot(' },
      { path: 'backend/main_detect/src/techgar/runtime_contract.py', line: 135, symbol: 'schema v2 keys', excerptStart: 134, excerpt: '    return {\n        "schema_version": RUNTIME_SCHEMA_VERSION,\n        "runtime_id": str(runtime_id),\n        "timestamp": timestamp,\n        "published_at": published_at,\n        "frame_index": int(frame_index),\n        "source_mode": source_mode,' },
      { path: 'backend/main_detect/runtime_server.py', line: 106, symbol: 'publish_snapshot — freeze + mailbox', excerptStart: 106, excerpt: '    def publish_snapshot(self, snapshot: dict[str, Any]) -> None:\n        # Freeze and serialize outside the shared condition. HTTP readers only\n        # hold the lock long enough to copy an immutable bytes reference.\n        frozen = copy.deepcopy(snapshot)\n        encoded = json.dumps(frozen, ensure_ascii=False).encode("utf-8")\n        with self._condition:\n            self._snapshot = frozen\n            self._snapshot_json = encoded' },
      { path: 'backend/main_detect/runtime_server.py', line: 134, symbol: 'latest-only frames MJPEG — cùng ý đồ', excerptStart: 134, excerpt: '            # Latest-only mailbox: a slow browser/JPEG encoder cannot build a\n            # queue that stalls tracking or shows increasingly old frames.\n            self._pending_frames[camera_id] = (\n                int(frame_index), owned_frame, renderer\n            )' },
      { path: 'backend/gate_session_controller.py', line: 103, symbol: '_fresh_live — gate từ chối snapshot cũ', excerptStart: 103, excerpt: 'def _fresh_live(snapshot: dict[str, Any]) -> bool:\n    if snapshot.get("source_mode") != "live":\n        return False' },
      { path: 'backend/main_detect/runtime_server.py', line: 285, symbol: 'GET /api/runtime/snapshot', excerptStart: 285, excerpt: '        if path in {"/api/runtime/snapshot", "/api/runtime/map"}:\n            if path.endswith("/snapshot"):\n                encoded = self.server.runtime_state.snapshot_json()' }
    ],
    pseudocode: [
      'gom vehicles + slots từ registry',
      'gom episodes + pending từ binders',
      'đóng gói schema_version=2 + timestamps',
      'publish_snapshot → ghi đè ô nhớ duy nhất',
      'GET /snapshot → trả bản mới nhất',
      'gate/frontend poll độc lập, async'
    ],
    scenarios: [
      {
        id: 'publish-flow', label: 'Publish ~5Hz → 2 consumer',
        build: function () {
          return [
            { title: 'Gom trạng thái', explanation: 'Cuối vòng loop, build_runtime_snapshot lấy vehicles/slots từ registry và parking_episodes + pending claims từ cả hai binder.',
              durationMs: 1800, activeLines: [0, 1],
              state: { nguồn: 'registry + binders', frame_index: 1042 },
              scene: { lit: 2, envKeys: 0, mailbox: null } },
            { title: 'Đóng gói schema v2', explanation: 'Object có schema_version=2: episodes là bản authoritative, pending_parking_confirmations chỉ là chẩn đoán (comment trong contract).',
              durationMs: 1800, activeLines: [2],
              state: { schema_version: 2, episodes: 'authoritative', pending: 'diagnostic only' },
              scene: { lit: 6, envKeys: 8, mailbox: null } },
            { title: 'Publish → mailbox 1-slot', explanation: 'publish_snapshot deep-copy + encode JSON ngoài lock, rồi ghi đè _snapshot duy nhất — reader chỉ giữ lock đủ lâu để copy bytes.',
              durationMs: 1800, activeLines: [3],
              state: { mailbox: 'ghi đè slot', lock: 'chỉ khi swap bytes' },
              scene: { lit: 6, envKeys: 8, mailbox: 's#1042', slide: true } },
            { title: 'Gate controller poll 0.25s', explanation: 'Gate là consumer async riêng: GET snapshot mỗi ~0.25s, luôn nhận bản mới nhất bất kể nhịp publish.',
              durationMs: 1700, activeLines: [4, 5],
              state: { 'gate poll': '0.25s', nhận: 's#1042' },
              scene: { lit: 6, envKeys: 8, mailbox: 's#1042', pollGate: true } },
            { title: 'Frontend poll 200ms', explanation: 'Frontend cũng poll độc lập (~200ms runtime + ~500ms session). Hai consumer không nằm trong vòng xử lý frame — loop không chờ ai.',
              durationMs: 1700, activeLines: [4, 5],
              state: { 'frontend poll': '200ms', consumers: 'async · độc lập' },
              scene: { lit: 6, envKeys: 8, mailbox: 's#1042', pollGate: true, pollFe: true } }
          ];
        }
      },
      {
        id: 'latest-only', label: 'Consumer chậm → ghi đè',
        build: function () {
          return [
            { title: 'Publish liên tục ~5Hz', explanation: 'Producer cứ ~200ms ghi một snapshot mới. Mailbox chỉ có 1 slot: bản cũ bị ghi đè ngay khi bản mới tới.',
              durationMs: 1600, activeLines: [3],
              state: { mailbox: 's#1042', queue: 1 },
              scene: { lit: 6, envKeys: 8, mailbox: 's#1042' } },
            { title: 'Consumer chưa kịp đọc', explanation: 's#1043 tới trước khi consumer poll — s#1042 bị huỷ, không xếp hàng. Đây là ý đồ "latest-only mailbox".',
              durationMs: 1700, activeLines: [3],
              state: { 's#1042': 'DROPPED', mailbox: 's#1043', dropped: 1 },
              scene: { lit: 6, envKeys: 8, mailbox: 's#1043', ghost: 's#1042', dropped: 1, slide: true } },
            { title: 'Ghi đè tiếp', explanation: 's#1044 tiếp tục ghi đè s#1043. Bỏ sót snapshot là an toàn: mỗi bản là trạng thái đầy đủ, không phải delta cần theo thứ tự.',
              durationMs: 1700, activeLines: [3],
              state: { 's#1043': 'DROPPED', mailbox: 's#1044', dropped: 2 },
              scene: { lit: 6, envKeys: 8, mailbox: 's#1044', ghost: 's#1043', dropped: 2, slide: true } },
            { title: 'Consumer đọc bản mới nhất', explanation: 'Khi poll tới, consumer nhận s#1044 — trạng thái mới nhất của hệ thống, không cần replay các bản lỡ.',
              durationMs: 1800, activeLines: [4, 5],
              state: { consumer: 'đọc s#1044', skipped: 'không cần bù' },
              scene: { lit: 6, envKeys: 8, mailbox: 's#1044', dropped: 2, pollGate: true, pollFe: true } },
            { title: 'Snapshot stale >5s → consumer từ chối', explanation: 'Gate chỉ chấp nhận _fresh_live: source_mode=live + mọi camera online + age_ms ≤5000 + published_at tươi ≤5s (gate_session_controller.py:103-127). Snapshot cũ bị bỏ — không xử lý dữ liệu chết; frontend watchdog cũng đánh unknown khi runtime im >5s.',
              durationMs: 1900, activeLines: [5],
              state: { age_ms: 6200, gate: 'REJECT (stale)', frontend: 'watchdog → unknown' },
              scene: { lit: 6, envKeys: 8, mailbox: 's#1045', dropped: 2, pollGate: false, pollFe: false, stale: true } },
            { title: 'Không hàng đợi tích lũy', explanation: 'Vòng camera không bao giờ bị chậm vì consumer chậm — producer/consumer tách nhịp hoàn toàn qua mailbox 1-slot.',
              durationMs: 1600, activeLines: [5],
              state: { 'queue size': 'luôn = 1', hệ_quả: 'loop không block' },
              scene: { lit: 6, envKeys: 8, mailbox: 's#1045', dropped: 2, pollGate: true, pollFe: true, slide: true } }
          ];
        }
      }
    ],
    draw: drawSnapshot
  };

  /* ================= NODE 3: gate-session ================= */

  var STATE_COLOR = {
    'WAITING_FOR_SCAN': '#c9a24d', 'SELECTING_SPOT': '#4d8dff',
    'NAVIGATING_TO_SPOT': '#7cc4ff', 'RELOCATING': '#7cc4ff',
    'PARKED': '#57c78a', 'EXIT_NAVIGATION': '#f3a9c0'
  };

  function drawGate(ctx, frame, view) {
    var w = view.width, hh = view.height, s = frame.scene, pr = view.progress;
    /* mini map bên trái */
    var mw = w * 0.58, mx = 18, my = 40, mh = hh - 110;
    panel(ctx, mx, my, mw, mh, 'bãi xe — 2 vạch cổng', '#3a4f8c');
    var roadY = my + mh * 0.55, roadH = mh * 0.3;
    ctx.fillStyle = '#16223f'; ctx.fillRect(mx + 8, roadY, mw - 16, roadH);
    ctx.strokeStyle = '#4a5680'; ctx.setLineDash([10, 7]); ctx.lineWidth = 1.5;
    ctx.beginPath(); ctx.moveTo(mx + 12, roadY + roadH / 2); ctx.lineTo(mx + mw - 12, roadY + roadH / 2); ctx.stroke();
    ctx.setLineDash([]);
    /* vạch cổng */
    var eX = mx + mw * 0.28, xX = mx + mw * 0.78;
    ctx.strokeStyle = '#57c78a'; ctx.lineWidth = 3;
    ctx.beginPath(); ctx.moveTo(eX, roadY - 12); ctx.lineTo(eX, roadY + roadH + 12); ctx.stroke();
    h.txt(ctx, 'ENTRY', eX, roadY - 18, { size: 10, weight: 800, color: '#57c78a', align: 'center' });
    ctx.strokeStyle = '#f3a9c0';
    ctx.beginPath(); ctx.moveTo(xX, roadY - 12); ctx.lineTo(xX, roadY + roadH + 12); ctx.stroke();
    h.txt(ctx, 'EXIT', xX, roadY - 18, { size: 10, weight: 800, color: '#f3a9c0', align: 'center' });
    /* ô đỗ */
    h.box(ctx, mx + mw * 0.44, my + 14, mw * 0.18, 26, 4, '#1d2a4c', '#c9a24d');
    h.mono(ctx, 'A05', mx + mw * 0.53, my + 27, { size: 10, align: 'center', color: '#c9a24d' });
    /* prev→pos + crossing flash */
    var carX = mx + 24 + s.carX * (mw - 70);
    var prevX = s.prevX != null ? mx + 24 + s.prevX * (mw - 70) : null;
    if (prevX != null) {
      ctx.strokeStyle = '#ffd75e'; ctx.setLineDash([4, 4]); ctx.lineWidth = 1.6;
      ctx.beginPath(); ctx.moveTo(prevX, roadY + roadH / 2 + 12); ctx.lineTo(carX, roadY + roadH / 2 + 12); ctx.stroke(); ctx.setLineDash([]);
      h.mono(ctx, 'prev→pos', (prevX + carX) / 2, roadY + roadH / 2 + 24, { size: 9, align: 'center', color: '#ffd75e' });
    }
    if (s.flash) {
      var fx = s.flash === 'entry' ? eX : xX;
      h.glow(ctx, fx, roadY + roadH / 2, 40, s.flash === 'entry' ? '#57c78a' : '#f3a9c0', 0.5 * (1 - pr * 0.5));
      h.pill(ctx, s.flash === 'entry' ? 'CẮT ENTRY ✓' : 'CẮT EXIT ✓', fx, roadY + roadH + 26,
        { size: 10, bg: '#12233d', border: s.flash === 'entry' ? '#57c78a' : '#f3a9c0', color: s.flash === 'entry' ? '#7be2a8' : '#f3a9c0', align: 'center' });
    }
    h.car(ctx, carX, roadY + roadH / 2 - 4, 0, { color: '#4d8dff', gid: s.gid != null ? s.gid : 5 });
    /* session card bên phải */
    var sx = mx + mw + 16, sw = w - sx - 14;
    panel(ctx, sx, my, sw, mh + 4, 'session (session_manager)', '#c9a24d');
    if (s.session) {
      var se = s.session, yy = my + 30;
      h.mono(ctx, se.id, sx + 10, yy, { size: 10, color: '#eaf1ff' }); yy += 20;
      if (se.state) {
        h.pill(ctx, se.state, sx + 10, yy + 8, { size: 10, bg: '#182446', border: STATE_COLOR[se.state] || '#55648c', color: STATE_COLOR[se.state] || '#8fa3c8' }); yy += 36;
      }
      [['GID', se.gid], ['createdAt', se.created], ['targetSpot', se.target], ['parkedSpot', se.parked]].forEach(function (kv) {
        if (kv[1] != null) { h.mono(ctx, kv[0] + ': ' + kv[1], sx + 10, yy, { size: 9.5, color: '#9db2d8' }); yy += 17; }
      });
      /* QR */
      if (se.qr != null) {
        yy += 6;
        fakeQR(ctx, sx + 22, yy, 74, !se.qr);
        h.mono(ctx, se.qr ? 'QR hiển thị (kiosk)' : 'hết 120s → ẩn khỏi kiosk', sx + 106, yy + 30, { size: 9, color: se.qr ? '#7be2a8' : '#f3a9c0' });
        if (se.qrPct != null && se.qr) {
          var bw = sw - 130;
          h.box(ctx, sx + 106, yy + 48, bw, 8, 4, '#141d36', '#3a4f8c');
          ctx.fillStyle = '#c9a24d'; ctx.fillRect(sx + 107, yy + 49, (bw - 2) * se.qrPct, 6);
          h.mono(ctx, 'TTL ' + Math.round(se.qrPct * 120) + 's/120s', sx + 106, yy + 66, { size: 8.5, color: '#c9a24d' });
        }
      }
      if (se.note) h.txt(ctx, se.note, sx + 10, my + mh - 16, { size: 9.5, color: '#ffd75e' });
    } else {
      h.mono(ctx, 'chưa có session', sx + sw / 2, my + mh / 2, { size: 10, align: 'center', color: '#55648c' });
    }
    if (s.deleted) {
      ctx.globalAlpha = 0.85;
      h.pill(ctx, 'SESSION ĐÃ XOÁ (exit crossing)', sx + sw / 2, my + mh / 2, { size: 11, bg: '#3a1524', border: '#d66a8a', color: '#f3a9c0', align: 'center' });
      ctx.globalAlpha = 1;
    }
    h.txt(ctx, 'consumer async — poll snapshot 0.25s, không nằm trong vòng frame', 18, hh - 14, { size: 10.5, color: '#7d90bd' });
  }

  var gateNode = {
    id: 'gate-session', title: 'Cổng vào/ra, session & QR', group: 'consumer',
    summary: 'Poll snapshot và phát hiện GID cắt vạch cổng: ENTRY tạo session+QR ngay (trước khi đỗ), EXIT xoá session.',
    answers: {
      does: 'Với mỗi Global ID có quan sát liên tục VÀ mới (observed ∧ previous ∧ now−prev_observed_at ≤1.0s ∧ source_is_continuous, :487-493), kiểm đoạn prev→pos có cắt vạch ENTRY/EXIT đúng hướng không: ENTRY → create_session (kiosk hiện QR 120s), EXIT → delete_session. Claim/select/PARKED là chuyển trạng thái session sau đó.',
      role: 'Consumer async biến sự kiện vật lý thành nghiệp vụ. Session tạo sớm — chỉ cần cắt cổng, không chờ occupancy; PARKED đến sau nhờ parking episode của binder.',
      where: 'Crossing: gate_session_controller.py:498-535; poll loop :893-906; create_session session_manager.py:255-294; _qr_expires_at :81-88.',
      why: 'delete chỉ xảy ra ở exit crossing (:523-534) — mất quan sát không tự đóng session. Quirk đã verify: QR 120s chỉ là TTL HIỂN THỊ kiosk (:81-88); claim_session không check qrExpiresAt, không job nào xoá session theo TTL.'
    },
    refs: [
      { path: 'backend/gate_session_controller.py', line: 498, symbol: 'entry crossing (direct + recovered)', excerptStart: 498, excerpt: '            direct_entry_crossing = (\n                observation_is_continuous\n                and _crossed_in_valid_direction(\n                    previous, position, self.gate_config["entry_gate"]\n                )\n            )\n            recovered_entry_crossing = (\n                observed\n                and session is None\n                and _recent_measured_entry_crossing(' },
      { path: 'backend/gate_session_controller.py', line: 514, symbol: 'entry → create_session', excerptStart: 514, excerpt: '            if direct_entry_crossing or recovered_entry_crossing:\n                if session is None:\n                    session_id = create_session(\n                        global_vehicle_id=global_id,\n                        runtime_id=runtime_id,\n                    )' },
      { path: 'backend/gate_session_controller.py', line: 523, symbol: 'exit → delete_session (duy nhất)', excerptStart: 523, excerpt: '            if observation_is_continuous and session is not None and _crossed_in_valid_direction(\n                previous, position, self.gate_config["exit_gate"]\n            ):\n                deleted = delete_session_by_global_id(\n                    global_id, runtime_id=runtime_id\n                )' },
      { path: 'backend/gate_session_controller.py', line: 896, symbol: 'poll loop async', excerptStart: 893, excerpt: '    try:\n        while True:\n            try:\n                snapshot = (\n                    _sample_snapshot(source_path)\n                    if source_path is not None\n                    else _runtime_snapshot(args.runtime_url)\n                )\n                coordinator.process_snapshot(snapshot)' },
      { path: 'backend/session_manager.py', line: 255, symbol: 'create_session', excerptStart: 255, excerpt: 'def create_session(\n    track_id: Optional[int] = None,\n    *,\n    global_vehicle_id: Optional[int] = None,\n    active_track_id: Optional[int] = None,\n    session_id: Optional[str] = None,\n    runtime_id: Optional[str] = None,\n) -> str:' },
      { path: 'backend/gate_session_controller.py', line: 103, symbol: '_fresh_live — gate từ chối snapshot cũ', excerptStart: 103, excerpt: 'def _fresh_live(snapshot: dict[str, Any]) -> bool:\n    if snapshot.get("source_mode") != "live":\n        return False' },
      { path: 'backend/session_manager.py', line: 81, symbol: '_qr_expires_at — TTL chỉ hiển thị', excerptStart: 81, excerpt: 'def _qr_expires_at(session: dict) -> Optional[datetime]:\n    explicit_expiry = _parse_iso(session.get("qrExpiresAt"))\n    if explicit_expiry is not None:\n        return explicit_expiry\n    created_at = _parse_iso(session.get("createdAt"))\n    if created_at is None:\n        return None\n    return created_at + timedelta(seconds=QR_DISPLAY_SECONDS)' }
    ],
    pseudocode: [
      'poll snapshot mới nhất (0.25s)',
      'với mỗi GID quan sát liên tục ≤1s',
      'prev→pos cắt ENTRY đúng hướng?',
      'chưa có session → create_session + QR',
      'prev→pos cắt EXIT đúng hướng? → xoá session',
      'lưu previous_positions[gid]'
    ],
    scenarios: [
      {
        id: 'lifecycle', label: 'Vòng đời đầy đủ entry→exit',
        build: function () {
          return [
            { title: 'Xe tiến về cổng vào', explanation: 'Gate controller poll snapshot 0.25s — độc lập với vòng frame. GID 5 đã có vị trí trước nhưng chưa cắt vạch nào.',
              durationMs: 1700, activeLines: [0, 1],
              state: { gid: 5, session: '—', crossing: 'chưa' },
              scene: { carX: 0.12, prevX: 0.05, gid: 5, session: null } },
            { title: 'Cắt ENTRY đúng hướng', explanation: 'Đoạn prev→pos cắt vạch entry_gate đúng hướng, với quan sát liên tục VÀ mới (now−prev ≤1.0s, :487-493). Fallback: recovered_entry_crossing dùng recent_measured_path khi quan sát gián đoạn.',
              durationMs: 1800, activeLines: [1, 2],
              state: { direct_crossing: true, recovered: 'fallback nếu mất quan sát' },
              scene: { carX: 0.31, prevX: 0.24, gid: 5, flash: 'entry', session: null } },
            { title: 'Tạo session + QR — TRƯỚC khi đỗ', explanation: 'create_session(global_vehicle_id=5) → session WAITING_FOR_SCAN. Xe mới cắt cổng, chưa đỗ — session không phụ thuộc occupancy.',
              durationMs: 1900, activeLines: [3],
              state: { session: 's-9 · WAITING_FOR_SCAN', qr: 'hiển thị', parked: 'chưa' },
              scene: { carX: 0.36, prevX: 0.28, gid: 5, session: { id: 's-9', state: 'WAITING_FOR_SCAN', gid: 'G#5', created: '12:00:14', qr: true, qrPct: 0.97 } } },
            { title: 'Kiosk hiển thị QR 120s', explanation: 'QR_DISPLAY_SECONDS=120: qrExpiresAt = createdAt + 120s, chỉ để kiosk/waiting-filter hiển thị. Không phải hạn session.',
              durationMs: 1800, activeLines: [3],
              state: { 'QR TTL': '120s (visibility)', 'không phải': 'session TTL' },
              scene: { carX: 0.42, prevX: 0.36, gid: 5, session: { id: 's-9', state: 'WAITING_FOR_SCAN', gid: 'G#5', created: '12:00:14', qr: true, qrPct: 0.62 } } },
            { title: 'Claim + chọn ô', explanation: 'Tài xế quét QR → claim_session → SELECTING_SPOT, select_spot → NAVIGATING_TO_SPOT + target A05. QR lúc này có thể đã ẩn — claim không check expiry.',
              durationMs: 1700, activeLines: [3],
              state: { session: 's-9 · SELECTING_SPOT → NAVIGATING_TO_SPOT', targetSpot: 'A05' },
              scene: { carX: 0.5, prevX: 0.44, gid: 5, session: { id: 's-9', state: 'NAVIGATING_TO_SPOT', gid: 'G#5', created: '12:00:14', target: 'A05', qr: true, qrPct: 0.2 } } },
            { title: 'Episode parked → PARKED', explanation: 'Binder commit episode A05:G5 (node binder) → snapshot → gate/session chuyển PARKED. Quyền "đỗ đúng ô" thuộc episode, không phải session tự suy ra.',
              durationMs: 1900, activeLines: [3],
              state: { episode: 'A05:G5', session: 's-9 · PARKED' },
              scene: { carX: 0.53, prevX: 0.5, gid: 5, session: { id: 's-9', state: 'PARKED', gid: 'G#5', created: '12:00:14', target: 'A05', parked: 'A05', qr: false, note: 'PARKED nhờ episode của binder' } } },
            { title: 'Rời ô → cắt EXIT → xoá session', explanation: 'Cắt exit_gate đúng hướng → delete_session_by_global_id + dọn previous_positions. Đây là con đường DUY NHẤT đóng session — mất camera không tự xoá.',
              durationMs: 2000, activeLines: [4, 5],
              state: { exit_crossing: true, session: 'deleted' },
              scene: { carX: 0.82, prevX: 0.74, gid: 5, flash: 'exit', deleted: true, session: { id: 's-9', state: 'EXIT_NAVIGATION', gid: 'G#5', parked: 'A05', qr: false } } }
          ];
        }
      },
      {
        id: 'qr-expiry', label: 'QR hết 120s — quirk đã verify',
        build: function () {
          return [
            { title: 'Entry → session + QR', explanation: 'Như kịch bản thường: cắt ENTRY tạo s-12 + QR hiển thị trên kiosk.',
              durationMs: 1600, activeLines: [1, 2, 3],
              state: { session: 's-12 · WAITING_FOR_SCAN', qr: 'hiển thị' },
              scene: { carX: 0.36, prevX: 0.28, gid: 8, flash: 'entry', session: { id: 's-12', state: 'WAITING_FOR_SCAN', gid: 'G#8', created: '12:00:14', qr: true, qrPct: 0.9 } } },
            { title: 'Qua 120s → QR ẩn khỏi kiosk', explanation: 'EntryQRKiosk.isQrVisible() lọc theo qrExpiresAt — QR biến mất khỏi màn hình. Nhưng đây chỉ là rule HIỂN THỊ.',
              durationMs: 1800, activeLines: [3],
              state: { qr: 'ẨN (visibility)', session: 'vẫn tồn tại' },
              scene: { carX: 0.4, prevX: 0.36, gid: 8, session: { id: 's-12', state: 'WAITING_FOR_SCAN', gid: 'G#8', created: '12:00:14', qr: false, note: 'quirk: chỉ ẩn, không xoá' } } },
            { title: 'Claim VẪN được chấp nhận', explanation: 'Source quirk đã verify: claim_session() không kiểm qrExpiresAt → driver mở link sau 120s vẫn claim được. Không có job nào dọn session theo TTL.',
              durationMs: 1900, activeLines: [3],
              state: { 'claim sau 120s': 'CHẤP NHẬN', session: 's-12 · SELECTING_SPOT' },
              scene: { carX: 0.46, prevX: 0.4, gid: 8, session: { id: 's-12', state: 'SELECTING_SPOT', gid: 'G#8', created: '12:00:14', qr: false, note: 'claim_session không check expiry' } } },
            { title: 'Session chỉ chết vì EXIT', explanation: 'Không camera, không TTL, không cleanup — chỉ có exit-gate crossing mới delete session (:523-534). QR hết hạn ≠ session hết hạn.',
              durationMs: 1800, activeLines: [4, 5],
              state: { 'đường xoá duy nhất': 'exit crossing', 'TTL': 'không xoá' },
              scene: { carX: 0.5, prevX: 0.46, gid: 8, session: { id: 's-12', state: 'NAVIGATING_TO_SPOT', gid: 'G#8', created: '12:00:14', target: 'A05', qr: false, note: 'session sống tiếp' } } }
          ];
        }
      }
    ],
    draw: drawGate
  };

  /* ================= NODE 4: navigation ================= */

  /* lane graph minh họa: 8 node, directed edges */
  var G_NODES = {
    N0: { x: 0.07, y: 0.72 }, N1: { x: 0.24, y: 0.72 }, N2: { x: 0.42, y: 0.72 },
    N3: { x: 0.60, y: 0.72 }, N4: { x: 0.24, y: 0.40 }, N5: { x: 0.42, y: 0.40 },
    N6: { x: 0.60, y: 0.40 }, N7: { x: 0.78, y: 0.40 }
  };
  var G_EDGES = [
    ['N0', 'N1'], ['N1', 'N2'], ['N2', 'N3'], ['N1', 'N4'], ['N4', 'N5'],
    ['N5', 'N6'], ['N6', 'N7'], ['N3', 'N6'], ['N2', 'N5', 'two']
  ];
  var ROUTE_OK = ['N0', 'N1', 'N4', 'N5', 'N6', 'N7'];
  var ROUTE_NEW = ['N2', 'N5', 'N6', 'N7'];
  var EXPAND_ORDER = ['N0', 'N1', 'N4', 'N2', 'N5', 'N3', 'N6', 'N7'];

  function drawNav(ctx, frame, view) {
    var w = view.width, hh = view.height, s = frame.scene, pr = view.progress;
    var gx = 18, gy = 40, gw = w * 0.66, gh = hh - 100;
    panel(ctx, gx, gy, gw, gh, 'lane graph + ô đỗ (frontend map)', '#3a4f8c');
    function P(id) { var n = G_NODES[id]; return { x: gx + n.x * gw, y: gy + n.y * gh }; }
    /* slot A05 đích */
    var slot = { x: gx + 0.80 * gw, y: gy + 0.14 * gh };
    h.box(ctx, slot.x, slot.y, gw * 0.13, 30, 5, s.arrived ? '#122e22' : '#1d2a4c', s.arrived ? '#57c78a' : '#c9a24d');
    h.mono(ctx, 'A05', slot.x + gw * 0.065, slot.y + 15, { size: 11, align: 'center', color: s.arrived ? '#7be2a8' : '#c9a24d' });
    /* edges */
    G_EDGES.forEach(function (e) {
      var a = P(e[0]), b = P(e[1]);
      var onRoute = (s.route || []).indexOf(e[0]) >= 0 && (s.route || []).indexOf(e[1]) >= 0 &&
        Math.abs(s.route.indexOf(e[0]) - s.route.indexOf(e[1])) === 1;
      h.arrow(ctx, a.x, a.y, b.x, b.y, { color: onRoute ? '#57c78a' : '#33436f', width: onRoute ? 3.4 : 1.6, head: onRoute ? 9 : 6 });
      if (e[2] === 'two') h.arrow(ctx, b.x, b.y, a.x, a.y, { color: onRoute ? '#57c78a' : '#33436f', width: onRoute ? 3.4 : 1.6, head: onRoute ? 9 : 6 });
    });
    /* last route edge → slot */
    if (s.route) {
      var last = P(s.route[s.route.length - 1]);
      h.arrow(ctx, last.x, last.y, slot.x + gw * 0.02, slot.y + 26, { color: '#57c78a', width: 3, dash: [6, 4] });
    }
    /* nodes + open-set expansion */
    Object.keys(G_NODES).forEach(function (id) {
      var p = P(id);
      var expIdx = s.expanded != null ? EXPAND_ORDER.indexOf(id) : -1;
      var expanded = expIdx >= 0 && expIdx < Math.ceil((s.expanded || 0) * pr);
      var onRoute = (s.route || []).indexOf(id) >= 0;
      if (expanded) h.glow(ctx, p.x, p.y, 20, '#c9a24d', 0.6);
      ctx.fillStyle = onRoute ? '#57c78a' : expanded ? '#c9a24d' : '#1d2a4c';
      ctx.strokeStyle = onRoute ? '#7be2a8' : '#4a5a85'; ctx.lineWidth = 1.4;
      ctx.beginPath(); ctx.arc(p.x, p.y, 9, 0, TAU); ctx.fill(); ctx.stroke();
      h.mono(ctx, id, p.x, p.y - 16, { size: 8.5, align: 'center', color: '#8fa3c8' });
      if (s.showG && (s.gvals || {})[id] != null) {
        h.mono(ctx, 'g=' + s.gvals[id], p.x, p.y + 18, { size: 8, align: 'center', color: '#c9a24d' });
      }
    });
    /* car + vị trí */
    var c = s.car;
    if (c) {
      var cp = { x: gx + c.x * gw, y: gy + c.y * gh };
      if (s.carT && s.route && s.route.length > 1) {
        /* chạy dọc route theo progress */
        var pts = s.route.map(P);
        var segs = [], tot = 0, i;
        for (i = 0; i < pts.length - 1; i++) {
          var L = Math.hypot(pts[i + 1].x - pts[i].x, pts[i + 1].y - pts[i].y);
          segs.push(L); tot += L;
        }
        var d = h.ease(pr) * tot;
        for (i = 0; i < segs.length; i++) {
          if (d <= segs[i] || i === segs.length - 1) {
            var u = segs[i] ? d / segs[i] : 0;
            cp = { x: pts[i].x + (pts[i + 1].x - pts[i].x) * u, y: pts[i].y + (pts[i + 1].y - pts[i].y) * u };
            break;
          }
          d -= segs[i];
        }
      }
      if (s.deviateTo) {
        var dp = { x: gx + s.deviateTo.x * gw, y: gy + s.deviateTo.y * gh };
        ctx.strokeStyle = '#f3a9c0'; ctx.setLineDash([5, 4]); ctx.lineWidth = 2;
        ctx.beginPath(); ctx.moveTo(cp.x, cp.y); ctx.lineTo(dp.x, dp.y); ctx.stroke(); ctx.setLineDash([]);
        var dd = Math.round(Math.hypot(dp.x - cp.x, dp.y - cp.y));
        h.mono(ctx, 'lệch ' + dd + 'px > 80', (cp.x + dp.x) / 2, (cp.y + dp.y) / 2 - 12, { size: 9.5, align: 'center', color: '#f3a9c0' });
        ctx.fillStyle = '#f3a9c0'; ctx.beginPath(); ctx.arc(dp.x, dp.y, 6, 0, TAU); ctx.fill();
      }
      h.car(ctx, cp.x, cp.y, Math.atan2((s.carDir || {}).y || 0, (s.carDir || {}).x || 1), { color: '#4d8dff', gid: 5 });
    }
    /* banner off-route */
    if (s.offroute) {
      ctx.globalAlpha = 0.75 + 0.25 * Math.sin(pr * 10);
      h.pill(ctx, '⚠ OFF-ROUTE — đi lại từ vị trí mới', gx + gw / 2, gy + 22, { size: 12, bg: '#3a1524', border: '#d66a8a', color: '#f3a9c0', align: 'center' });
      ctx.globalAlpha = 1;
    }
    /* side panel phải */
    var sx = gx + gw + 16, sw = w - sx - 14;
    panel(ctx, sx, gy, sw, Math.min(220, mhSafe(hh)), 'runtime + session (poll)', '#4d8dff');
    (s.info || []).forEach(function (ln, i) {
      h.mono(ctx, ln, sx + 10, gy + 34 + i * 20, { size: 9.5, color: i === 0 ? '#eaf1ff' : '#9db2d8' });
    });
    h.txt(ctx, 'consumer async — poll runtime 200ms + session ~500ms', 18, hh - 14, { size: 10.5, color: '#7d90bd' });
  }
  function mhSafe(hh) { return hh - 110; }

  var navNode = {
    id: 'navigation', title: 'Frontend & A* dẫn đường', group: 'consumer',
    summary: 'Frontend poll snapshot + session, project world→bản đồ SVG, A* trên lane graph có hướng rồi dẫn xe theo route.',
    answers: {
      does: 'Poll /api/runtime/snapshot ~200ms + session ~500ms; chọn node làn gần vị trí xe và ô đích; A* mở rộng open-set theo f = g + h (h = Euclid × costPerMapUnit); truy previous ra route; xe đi theo, checkIsOffRoute cảnh báo lệch.',
      role: 'Consumer cuối chuỗi — biến dữ liệu snapshot/session thành chỉ dẫn lái xe. Chạy hoàn toàn phía client, không ảnh hưởng vòng backend.',
      where: 'findRoute A* (frontend/src/routing/routeEngine.ts:31-93); poll loop (App.tsx:238-411); off-route callsite 80px (App.tsx:746-750), engine default 75px (voiceGuidance.ts:95-99).',
      why: 'Heuristic nhân costPerMapUnit để admissible theo đơn vị cost thật (code :46-50). Adjacency chỉ đẩy edge.from→to; cạnh `direction==="two-way"` được đẩy thêm chiều ngược (routeEngine.ts:22-26) — one-way tôn trọng THEO TỪNG CẠNH. Quirk: engine default 75px nhưng App truyền 80 — ghi cả hai theo dẫn chứng.'
    },
    refs: [
      { path: 'frontend/src/routing/routeEngine.ts', line: 47, symbol: 'heuristic Euclid × costPerMapUnit', excerptStart: 47, excerpt: '  const heuristic = (nodeId: string): number => {\n    const node = nodeById.get(nodeId)!;\n    return Math.hypot(targetNode.x - node.x, targetNode.y - node.y) * heuristicScale;\n  };' },
      { path: 'frontend/src/routing/routeEngine.ts', line: 52, symbol: 'A* open-set + maps', excerptStart: 52, excerpt: '  const open = new Set<string>([startNodeId]);\n  const distances = new Map<string, number>([[startNodeId, 0]]);\n  const estimates = new Map<string, number>([[startNodeId, heuristic(startNodeId)]]);\n  const previous = new Map<string, { nodeId: string; edgeId: string }>();\n\n  while (open.size > 0) {' },
      { path: 'frontend/src/routing/routeEngine.ts', line: 84, symbol: 'relax cạnh kề', excerptStart: 84, excerpt: '      if (candidate < (distances.get(step.to) ?? Number.POSITIVE_INFINITY)) {\n        distances.set(step.to, candidate);\n        estimates.set(step.to, candidate + heuristic(step.to));\n        previous.set(step.to, { nodeId: step.from, edgeId: step.edgeId });\n        open.add(step.to);\n      }' },
      { path: 'frontend/src/app/App.tsx', line: 746, symbol: 'callsite off-route — 80px', excerptStart: 746, excerpt: '    const currentOffRoute = checkIsOffRoute(\n      { x: targetVehicle.x, y: targetVehicle.y },\n      activeRoute?.points ?? [],\n      80\n    );' },
      { path: 'frontend/src/routing/voiceGuidance.ts', line: 95, symbol: 'engine default 75px', excerptStart: 95, excerpt: 'export function checkIsOffRoute(\n  vehiclePos: { x: number; y: number },\n  routePoints: Array<{ x: number; y: number }>,\n  thresholdPx: number = 75\n): boolean {' }
    ],
    pseudocode: [
      'poll snapshot 200ms + session 500ms',
      'project world→SVG, chọn node gần xe + ô đích',
      'A*: pop f nhỏ nhất trong open-set',
      'relax kề → ghi previous, đẩy vào open',
      'truy previous → route polyline',
      'lệch > 80px (App) → off-route → route lại'
    ],
    scenarios: [
      {
        id: 'astar', label: 'A* tìm đường đến ô A05',
        build: function () {
          return [
            { title: 'Lane graph + start/end', explanation: 'Đồ thị làn có cạnh 1-chiều VÀ 2-chiều: mũi tên hai đầu = edge two-way (đi được cả hai hướng). Xe ở N0, đích ô A05 qua N7.',
              durationMs: 1700, activeLines: [0, 1],
              state: { start: 'N0', đích: 'N7 → A05', edges: 'one-way + two-way' },
              scene: { car: { x: 0.07, y: 0.72 }, carDir: { x: 1, y: 0 }, route: null, info: ['session s-9 · NAVIGATING_TO_SPOT', 'target A05', 'poll 200ms ✓'] } },
            { title: 'A* mở rộng open-set', explanation: 'Mỗi vòng pop node có f = g+h nhỏ nhất, relax cạnh kề, ghi previous. h = khoảng Euclid × costPerMapUnit nên admissible.',
              durationMs: 2200, activeLines: [2, 3],
              state: { 'open-set': 'đang mở rộng', f: 'g + h' },
              scene: { car: { x: 0.07, y: 0.72 }, expanded: 8, showG: true, gvals: { N0: 0, N1: 1, N4: 2, N2: 2, N5: 3, N6: 4, N3: 3, N7: 5 }, route: null, info: ['A* đang chạy', 'pop f min → relax'] } },
            { title: 'Route found', explanation: 'Tới N7 thì dừng, truy previous → route xanh. One-way chỉ đi from→to; edge two-way được đẩy cả chiều ngược trong adjacency (routeEngine.ts:22-26).',
              durationMs: 1700, activeLines: [4],
              state: { route: 'N0→N1→N4→N5→N6→N7', 'độ dài': '5 cạnh' },
              scene: { car: { x: 0.07, y: 0.72 }, route: ROUTE_OK, info: ['route OK', '5 cạnh → A05'] } },
            { title: 'Xe đi theo route', explanation: 'Frontend animate xe theo polyline route + voice guidance; snapshot mới cập nhật vị trí mỗi 200ms.',
              durationMs: 2200, activeLines: [4, 5],
              state: { 'theo route': 'đúng', 'off-route': 'không' },
              scene: { car: { x: 0.07, y: 0.72 }, route: ROUTE_OK, carT: true, info: ['dẫn đường…', 'rẽ trái sau 20m'] } },
            { title: 'Đến ô A05', explanation: 'Route kết thúc tại node gần ô — ô đỗ không phải node đi qua (route-from-position không nối qua spot).',
              durationMs: 1600, activeLines: [4],
              state: { arrived: 'A05', session: '→ PARKED (qua episode)' },
              scene: { car: { x: 0.80, y: 0.44 }, carDir: { x: 1, y: 0 }, route: ROUTE_OK, arrived: true, info: ['đã đến A05', 'episode parked → PARKED'] } }
          ];
        }
      },
      {
        id: 'offroute', label: 'Đi lệch > 80px → route lại',
        build: function () {
          return [
            { title: 'Đang theo route', explanation: 'Xe đi theo route xanh; mỗi poll kiểm checkIsOffRoute(vị trí, route, 80).',
              durationMs: 1600, activeLines: [4],
              state: { 'off-route check': 'mỗi poll', ngưỡng: '80px (callsite App)' },
              scene: { car: { x: 0.42, y: 0.72 }, carDir: { x: 1, y: 0 }, route: ROUTE_OK, info: ['theo route', 'threshold 80px'] } },
            { title: 'Xe lệch khỏi polyline', explanation: 'Snapshot mới cho vị trí lệch xuống làn phụ — khoảng cách tới route đo được mỗi lần check.',
              durationMs: 1800, activeLines: [5],
              state: { 'khoảng lệch': 'đang đo…' },
              scene: { car: { x: 0.42, y: 0.72 }, route: ROUTE_OK, deviateTo: { x: 0.48, y: 0.94 }, info: ['vị trí lệch…', 'đo khoảng cách'] } },
            { title: '> 80px → OFF-ROUTE', explanation: 'Khoảng lệch vượt threshold → isOffRoute: cảnh báo đỏ + voice. (Engine default 75px; App truyền 80 — hai giá trị đều trong source.)',
              durationMs: 1900, activeLines: [5],
              state: { isOffRoute: true, threshold: '80px · default 75px' },
              scene: { car: { x: 0.48, y: 0.94 }, route: ROUTE_OK, offroute: true, info: ['OFF-ROUTE!', 'isOffRoute = true'] } },
            { title: 'Recompute từ vị trí mới', explanation: 'Route lại từ node gần vị trí hiện tại (N2) về N7 — A* chạy lại trên cùng graph.',
              durationMs: 1900, activeLines: [2, 3, 4],
              state: { 'route mới': 'N2→N5→N6→N7' },
              scene: { car: { x: 0.48, y: 0.88 }, expanded: 5, route: ROUTE_NEW, info: ['recompute…', 'từ node gần nhất'] } },
            { title: 'Theo route mới', explanation: 'Xe quay về làn và đi theo route mới đến A05 — vòng poll tiếp tục giám sát.',
              durationMs: 1700, activeLines: [4, 5],
              state: { isOffRoute: false, route: 'mới' },
              scene: { car: { x: 0.60, y: 0.42 }, carDir: { x: 1, y: 0 }, route: ROUTE_NEW, arrived: true, info: ['đã về route', '→ A05'] } }
          ];
        }
      }
    ],
    draw: drawNav
  };

  /* ================= register ================= */
  window.TechGarPipelinePacks.system = [captureNode, snapshotNode, gateNode, navNode];
})();
