/* TechGar2 Pipeline V2 — identity pack (Builder B)
 * Nodes: handoff · slot-vision · binder
 * Mô phỏng giáo dục — số liệu minh họa trừ khi ghi "runtime" với file:dòng.
 * Classic script, no fetch/CDN. Registry: window.TechGarPipelinePacks.identity
 */
(function () {
  "use strict";
  var W = typeof window !== "undefined" ? window : globalThis;
  var P = W.TechGarPipelinePacks = W.TechGarPipelinePacks || {};

  /* ---------------- helpers ---------------- */
  var lerp = function (a, b, t) { return a + (b - a) * t; };
  var ease = function (t) { return t < 0 ? 0 : t > 1 ? 1 : t * t * (3 - 2 * t); };
  var pulse = function (time, hz) { return 0.5 + 0.5 * Math.sin((time || 0) * 6.28318 * (hz || 0.5)); };

  var COL = {
    cam1: "#16324f", cam2: "#143b2e", world: "#241f12", panel: "#101820",
    gid: "#ffd166", local: "#8ecae6", car: "#4cc9f0", carDim: "#33617a",
    ok: "#57cc99", bad: "#ef476f", warn: "#ffb703", dim: "#5b6b7a",
    slotFree: "#2b6f4e", slotOcc: "#a63d40", slotClaim: "#8a6d1d",
    ink: "#e8edf2", faint: "#9aa8b4", line: "#33414e"
  };

  function rr(ctx, x, y, w, h, r) {
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.arcTo(x + w, y, x + w, y + h, r);
    ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r);
    ctx.arcTo(x, y, x + w, y, r);
    ctx.closePath();
  }

  function panel(ctx, x, y, w, h, title, fill) {
    ctx.fillStyle = fill || COL.panel;
    rr(ctx, x, y, w, h, 10); ctx.fill();
    ctx.strokeStyle = COL.line; ctx.lineWidth = 1; ctx.stroke();
    if (title) {
      ctx.fillStyle = COL.faint;
      ctx.font = "600 12px system-ui, sans-serif";
      ctx.textAlign = "left"; ctx.textBaseline = "top";
      ctx.fillText(title, x + 10, y + 8);
    }
  }

  function label(ctx, txt, x, y, opt) {
    opt = opt || {};
    ctx.fillStyle = opt.color || COL.ink;
    ctx.font = (opt.bold ? "700 " : opt.weight ? opt.weight + " " : "500 ") +
      (opt.size || 12) + "px system-ui, sans-serif";
    ctx.textAlign = opt.align || "left";
    ctx.textBaseline = opt.baseline || "middle";
    ctx.fillText(txt, x, y);
  }

  function car(ctx, x, y, w, h, color, alpha) {
    ctx.save();
    ctx.globalAlpha = alpha == null ? 1 : alpha;
    ctx.fillStyle = color || COL.car;
    rr(ctx, x - w / 2, y - h / 2, w, h, Math.min(w, h) * 0.28);
    ctx.fill();
    ctx.fillStyle = "rgba(255,255,255,.25)";
    rr(ctx, x - w * 0.28, y - h * 0.18, w * 0.56, h * 0.36, 4); ctx.fill();
    ctx.restore();
  }

  function idBadge(ctx, x, y, gidTxt, localTxt, dim) {
    ctx.save();
    if (dim) ctx.globalAlpha = 0.5;
    var w = 92, h = 30;
    ctx.fillStyle = "rgba(6,10,14,.78)";
    rr(ctx, x, y, w, h, 7); ctx.fill();
    ctx.fillStyle = COL.gid; ctx.font = "700 13px system-ui, sans-serif";
    ctx.textAlign = "center"; ctx.textBaseline = "middle";
    ctx.fillText(gidTxt, x + w / 2, y + 9);
    ctx.fillStyle = COL.local; ctx.font = "600 10px system-ui, sans-serif";
    ctx.fillText(localTxt, x + w / 2, y + 21);
    ctx.restore();
  }

  function histChip(ctx, x, y, w, bars, color) {
    var n = bars.length, bw = w / n;
    ctx.fillStyle = "rgba(255,255,255,.06)";
    rr(ctx, x - 3, y - 14, w + 6, 20, 4); ctx.fill();
    for (var i = 0; i < n; i++) {
      ctx.fillStyle = color || COL.gid;
      var bh = 3 + bars[i] * 11;
      ctx.fillRect(x + i * bw + 1, y + 4 - bh, bw - 2, bh);
    }
  }

  function bar(ctx, x, y, w, h, frac, color, txt) {
    ctx.fillStyle = "rgba(255,255,255,.08)";
    rr(ctx, x, y, w, h, h / 2); ctx.fill();
    if (frac > 0) {
      ctx.fillStyle = color;
      rr(ctx, x, y, Math.max(h, w * Math.min(1, frac)), h, h / 2); ctx.fill();
    }
    if (txt) label(ctx, txt, x + w + 6, y + h / 2, { size: 11, color: COL.ink });
  }

  function dashedLine(ctx, x1, y1, x2, y2, color) {
    ctx.save();
    ctx.strokeStyle = color || COL.dim;
    ctx.setLineDash([5, 5]); ctx.lineWidth = 1.4;
    ctx.beginPath(); ctx.moveTo(x1, y1); ctx.lineTo(x2, y2); ctx.stroke();
    ctx.restore();
  }

  function frame(title, explanation, activeLines, state, durationMs, scene) {
    return { title: title, explanation: explanation, activeLines: activeLines, state: state, durationMs: durationMs, scene: scene };
  }

  /* ================= NODE 1 — handoff ================= */

  var HANDOFF_PSEUDO = [
    "Track cam1 đã gán GID — cập nhật điểm trên bản đồ chung (homography)",
    "Xe hướng ra mép/vùng chồng lấn → mở điểm hẹn (thời hạn 45 frame)",
    "Mỗi frame còn thấy: làm mới vị trí + hướng đi + album màu",
    "Ứng viên cam2 → điểm khớp = .55 vị trí + .30 ngoại hình + .10 cỡ + .05 hướng",
    "lapjv ghép một-một (limit 0.92) + đòi chênh lệch 0.08 với đối thủ",
    "Đủ bằng chứng liên tiếp (1–3 frame) → nhận: local đổi, GID giữ",
    "Lỡ điểm hẹn → vết chờ; nhận lại mã số 'ngủ' bằng album + vòng tới được",
    "Mọi đường thất bại mới cấp GID mới — không cấp sớm"
  ];

  function handoffScenes() {
    var S = [];
    S.push(frame("Cam1 đang theo dõi G#5",
      "Từ điển nhanh: track là vết theo dõi của một xe trong một cam; local ID là số cam đó tự đánh (đổi cam đổi số); GID là mã số chung của xe xuyên mọi cam; episode là biên bản xe-đỗ-ô, gặp ở node cuối. G#5 đang được cam1 theo dõi qua local#12 — vị trí chiếu qua homography sang bản đồ chung nên mọi khoảng cách đo trên bản đồ, không đo pixel.",
      [0],
      { gid: "G#5", local_cam1: "local#12 (confirmed)", local_cam2: "—", bản_đồ: "chiếu qua homography", điểm_hẹn: "chưa mở" },
      2400,
      { kind: "handoff", phase: "track", car1: { x0: 0.18, x1: 0.38, y: 0.60 }, cam1Lost: false, worldTrail: [[0.16, 0.55], [0.24, 0.55], [0.33, 0.55]], entry: null, cand: null }));
    S.push(frame("Xe hướng ra mép → đặt điểm hẹn",
      "Xe đi về phía mép ảnh hoặc vùng chồng lấn → hệ thống đặt sẵn một điểm hẹn bên cam2 TRƯỚC khi cam2 thấy xe: kèm vị trí dự đoán, hướng đi và album màu của xe.",
      [1, 2],
      { điểm_hẹn: "G#5 → cam2", còn_hạn: "45 frame", vận_tốc: "(0.62, 0.02) world/frame", album: "24 mẫu tối đa / cam" },
      2600,
      { kind: "handoff", phase: "open", car1: { x0: 0.38, x1: 0.62, y: 0.60 }, cam1Lost: false, worldTrail: [[0.16, 0.55], [0.24, 0.55], [0.33, 0.55], [0.45, 0.55]], entry: { ttl0: 45, ttl1: 41, v: [0.62, 0.02], overlap: true }, cand: null }));
    S.push(frame("Cam1 mất dấu — điểm hẹn còn hạn",
      "Xe khuất khỏi cam1 nhưng điểm hẹn chưa hủy — thời gian chờ đếm ngược. Đoán tiếp vị trí theo hướng xe để vẽ hành lang chờ bên cam2.",
      [2],
      { cam1: "local#12 → LOST", còn_hạn: "41 → 34 frame", hành_lang: "ngoại suy world+velocity", điểm_hẹn: "còn hiệu lực" },
      2400,
      { kind: "handoff", phase: "lost", car1: { x0: 0.62, x1: 0.80, y: 0.60 }, cam1Lost: true, worldTrail: [[0.33, 0.55], [0.45, 0.55], [0.58, 0.55], [0.68, 0.55]], entry: { ttl0: 41, ttl1: 34, v: [0.62, 0.02], overlap: true }, cand: null }));
    S.push(frame("Cam2 thấy ứng viên",
      "Vết mới local#3 lọt vào hành lang chờ — được đưa đi chấm điểm kể cả khi chưa xác nhận. Ứng viên khác local#9 đứng quá xa điểm hẹn.",
      [3],
      { cam2: "local#3 (chờ xác nhận) trong hành lang", "local#9": "ngoài hành lang", điểm_hẹn: "đợi ghép" },
      2400,
      { kind: "handoff", phase: "candidate", cam1Lost: true, worldTrail: [[0.45, 0.55], [0.58, 0.55], [0.68, 0.55]], car2: { x: 0.16, y: 0.58 }, far2: { x: 0.82, y: 0.30 }, entry: { ttl0: 34, ttl1: 31, v: [0.62, 0.02], overlap: true }, cand: null }));
    S.push(frame("Chấm điểm 4 tiêu chí",
      "Điểm khớp = lệch vị trí dự đoán + khác ngoại hình + khác kích thước + khác hướng, cộng theo trọng số trong source (0.55/0.30/0.10/0.05). local#3 được 0.164 — dưới ngưỡng 0.92; local#9 quá xa điểm hẹn nên bị loại ngay.",
      [3],
      { "local#3": "điểm 0.164", "local#9": "loại: quá xa điểm hẹn", limit: "≤ 0.92" },
      2800,
      { kind: "handoff", phase: "cost", cam1Lost: true, car2: { x: 0.16, y: 0.58 }, far2: { x: 0.82, y: 0.30 }, entry: { ttl0: 31, ttl1: 29, v: [0.62, 0.02], overlap: true },
        cand: { terms: [{ k: "vị trí", w: 0.55, v: 0.20, c: 0.110 }, { k: "ngoại hình", w: 0.30, v: 0.12, c: 0.036 }, { k: "cỡ", w: 0.10, v: 0.08, c: 0.008 }, { k: "hướng", w: 0.05, v: 0.20, c: 0.010 }], total: 0.164, reject: "local#9: lệch 1.9× bán kính → loại" } }));
    S.push(frame("Ghép một-một + chênh lệch rõ",
      "Bộ giải lapjv ghép tối ưu một-một (limit 0.92). Cặp thắng phải hơn đối thủ ít nhất 0.08 điểm — không thì hoãn lại chờ thêm bằng chứng. Ứng viên còn cần đủ số lần bắt gặp liên tiếp (1–3 frame tùy trường hợp).",
      [4, 5],
      { lapjv: "1-1 tối ưu", margin: "0.756 ≥ 0.08", bằng_chứng: "2/2 (overlap corridor)", hoãn: "nếu thiếu → giữ ID-less" },
      2800,
      { kind: "handoff", phase: "assign", cam1Lost: true, car2: { x: 0.16, y: 0.58 }, entry: { ttl0: 29, ttl1: 27, v: [0.62, 0.02], overlap: true },
        cand: { total: 0.164, margin: 0.756, streak0: 0, streak1: 2, need: 2 } }));
    S.push(frame("Nhận điểm hẹn: số đổi — GID giữ nguyên",
      "local#3 của cam2 được nhận vào G#5. Một xe — một mã số qua hai camera; local ID chỉ là số riêng của từng cam.",
      [5],
      { cam2: "local#3 → G#5", điểm_hẹn: "consumed", registry: "G#5 active (cam2)" },
      2400,
      { kind: "handoff", phase: "bind", cam1Lost: true, car2: { x0: 0.16, x1: 0.30, y: 0.58 }, worldTrail: [[0.45, 0.55], [0.58, 0.55], [0.68, 0.55], [0.78, 0.55]], entry: null, cand: null }));
    S.push(frame("Cùng một xe, hai góc nhìn",
      "Điểm hẹn đặt trước + chấm nhiều tiêu chí + đếm bằng chứng liên tiếp = đường nhanh nhất giữ mã số. Nếu lỡ, vòng nhận lại 'người quen' là đường cứu.",
      [7],
      { result: "G#5 liên tục cam1→cam2", đường_cứu: "nhận lại người quen nếu lỡ", deep_ReID: "KHÔNG dùng" },
      2600,
      { kind: "handoff", phase: "done", cam1Lost: true, car2: { x0: 0.30, x1: 0.44, y: 0.58 }, worldTrail: [[0.16, 0.55], [0.33, 0.55], [0.45, 0.55], [0.58, 0.55], [0.68, 0.55], [0.78, 0.55]], entry: null, cand: null }));
    return S;
  }

  function reidScenes() {
    var S = [];
    S.push(frame("Điểm hẹn mở như thường",
      "G#5 lại đi về vùng chồng lấn — điểm hẹn mở với thời hạn 45 frame như trước. Lần này stream rớt đúng các frame biên.",
      [1, 2],
      { điểm_hẹn: "G#5 → cam2", còn_hạn: "45 frame" },
      2200,
      { kind: "handoff", phase: "open", car1: { x0: 0.40, x1: 0.64, y: 0.60 }, cam1Lost: false, worldTrail: [[0.16, 0.55], [0.33, 0.55], [0.45, 0.55]], entry: { ttl0: 45, ttl1: 42, v: [0.62, 0.02], overlap: true }, cand: null }));
    S.push(frame("Rớt frame → điểm hẹn quá hạn",
      "Không frame nào làm mới và không ứng viên nào đến đúng lúc: điểm hẹn hết hạn. Xe ở cam2 xuất hiện trễ — vết mới chưa ai nhận ra.",
      [6],
      { còn_hạn: "0 — entry hủy", cam2: "local#4 mới (ID-less)", điểm_hẹn: "missed" },
      2600,
      { kind: "handoff", phase: "expired", cam1Lost: true, car2: { x: 0.30, y: 0.58 }, worldTrail: [[0.45, 0.55], [0.58, 0.55]], entry: { ttl0: 3, ttl1: 0, v: [0.62, 0.02], overlap: true }, cand: null }));
    S.push(frame("Vết mới chờ — chưa cấp số mới",
      "Cấp mã số mới ngay sẽ tạo hai hồ sơ cho một xe. Hệ thống lật sổ các mã số đang 'ngủ' trong cửa sổ giữ chỗ (60s, xe đang chạy chỉ 12s) — G#5 còn đó.",
      [6],
      { "local#4": "ID-less (đợi)", registry: "G#5 đang 'ngủ'", cửa_sổ_giữ: "còn 34/60s", GID_mới: "CHƯA cấp" },
      2600,
      { kind: "handoff", phase: "waiting", cam1Lost: true, car2: { x: 0.30, y: 0.58 }, worldTrail: [[0.45, 0.55], [0.58, 0.55]], entry: null, cand: null }));
    S.push(frame("Nhận lại người quen: đủ gần + đúng dáng",
      "Ứng viên phải nằm trong vòng có-thể-tới (tốc độ × thời gian mất dấu, trên bản đồ chung) VÀ giống album màu — album chỉ là histogram HSV/LAB/L, không phải mô hình học sâu — vẫn qua bộ ghép lapjv (limit 0.95). G#5 khớp: điểm khác biệt 0.24 < ngưỡng 0.60.",
      [6],
      { tới_được: "trong vòng tròn", ngoại_hình: "0.24 < 0.60", deep_ReID: "histogram HSV/LAB/L — không embedding" },
      2800,
      { kind: "handoff", phase: "reid", cam1Lost: true, car2: { x: 0.30, y: 0.58 }, worldTrail: [[0.45, 0.55], [0.58, 0.55]], entry: null,
        cand: { gallery: true, dist: 0.24, thr: 0.60, reachable: true } }));
    S.push(frame("Nhận ra — G#5 quay lại",
      "local#4 được nhận lại vào G#5 qua đường cứu này — chậm hơn điểm hẹn nhưng cứu được mã số khi stream rớt đúng lúc.",
      [6, 7],
      { cam2: "local#4 → G#5", registry: "G#5 active", đường_cứu: "identity cứu được" },
      2400,
      { kind: "handoff", phase: "bind", cam1Lost: true, car2: { x0: 0.30, x1: 0.46, y: 0.58 }, worldTrail: [[0.45, 0.55], [0.58, 0.55], [0.72, 0.55]], entry: null, cand: null }));
    S.push(frame("Tóm tắt: thử mọi cách trước khi cấp số mới",
      "Thứ tự cứu mã số: điểm hẹn → nhận lại người quen → quỹ đạo chung → cuối cùng mới cấp số mới. Số mới chỉ cấp cho vết đã xác nhận — đó là cách một xe giữ một mã số.",
      [7],
      { order: "điểm hẹn → người quen → quỹ đạo → số mới", rule: "số mới chỉ cho vết chắc", result: "1 xe = 1 GID" },
      2600,
      { kind: "handoff", phase: "done", cam1Lost: true, car2: { x0: 0.46, x1: 0.58, y: 0.58 }, worldTrail: [[0.16, 0.55], [0.33, 0.55], [0.45, 0.55], [0.58, 0.55], [0.72, 0.55]], entry: null, cand: null }));
    return S;
  }

  /* ================= NODE 2 — slot-vision ================= */

  var VISION_PSEUDO = [
    "Với mỗi ô đỗ: lấy kênh sáng của vùng đa giác ô",
    "Tạo 25 phiên bản sáng khác nhau (5×5 mức) → ngưỡng riêng từng bản",
    "Bản nào thấy tỉ lệ 'khác nền' thấp → cộng 1 phiếu TRỐNG",
    "empty_votes ≥ 12 (= 25//2) → tạm kết luận TRỐNG",
    "Trạm lõi: vật đặc ở lõi ô → lật lại CÓ XE",
    "Trạm viền: đường viền trong ô đủ dày → lật lại CÓ XE",
    "Làm mượt: trạng thái giữ đủ occupied_seconds mới chốt",
    "'Có xe' là phần bù — không có phiếu occupied riêng"
  ];

  function visionScenes() {
    var ratios = [
      0.21, 0.19, 0.24, 0.18, 0.22,
      0.17, 0.15, 0.20, 0.16, 0.19,
      0.23, 0.18, 0.14, 0.21, 0.17,
      0.11, 0.10, 0.16, 0.12, 0.09,
      0.13, 0.14, 0.11, 0.15, 0.12
    ];
    var emptyVotes = ratios.filter(function (r) { return r < 0.12; }).length;
    var S = [];
    S.push(frame("Vùng đo của ô — khác vùng chặn chuyển động",
      "Mỗi ô đỗ có đa giác riêng: vùng đếm pixel và vùng lõi. Đây là vùng phân tích ô — khác vùng ROI chặn chuyển động ở node local. Xe đứng yên: mắt chuyển động mù, công đoạn này vẫn đo được.",
      [0],
      { slot: "A05", vùng_đếm: "~4200 px (minh họa)", lõi: "lõi ô", luồng: "worker ~2fps — không trong loop tracking" },
      2400,
      { kind: "vision", phase: "roi", slotRatio: 0.62, ratios: ratios, thr: 0.12, emptyVotes: emptyVotes }));
    S.push(frame("25 phiên bản sáng — không cược vào một ngưỡng",
      "Kênh sáng của ô được tách thành 25 phiên bản sáng-tối khác nhau (5×5 mức, xem refs). Mỗi bản tự đếm pixel 'khác nền' trong vùng ô — cho 25 tỉ lệ riêng.",
      [0, 1],
      { phiên_bản: "5 CLAHE × 5 gamma = 25", kênh: "L của LAB", mỗi_bản: "adaptive threshold + median + dilate" },
      2600,
      { kind: "vision", phase: "variants", ratios: ratios, thr: 0.12, emptyVotes: emptyVotes }));
    S.push(frame("Đếm phiếu TRỐNG",
      "Phiên bản nào thấy tỉ lệ khác-nền thấp hơn ngưỡng thì góp một phiếu TRỐNG. Xe trong ô giữ tỉ lệ cao ở đa số bản: chỉ có " + emptyVotes + " phiếu trống, thiếu mốc 12 → ô KHÔNG trống.",
      [2, 3],
      { empty_votes: emptyVotes + " / 25", mốc: "≥ 12 mới trống", tạm_kết_luận: "occupied (thiếu phiếu trống)" },
      2800,
      { kind: "vision", phase: "vote", ratios: ratios, thr: 0.12, emptyVotes: emptyVotes, required: 12, verdict: "occupied" }));
    S.push(frame("Hai trạm kiểm lật ngược (không cần ở đây)",
      "Hai trạm kiểm chỉ chạy khi phiếu đã cho 'trống': một trạm tìm vật đặc ở lõi ô (cứu xe tối màu), một trạm đo đường viền trong ô (cứu xe bóng nhẵn). Phiếu đã thiếu nên cả hai bị bỏ qua.",
      [4, 5],
      { tạm: "false → bỏ qua 2 cổng", trạm_lõi: "chỉ áp khi vote=free", trạm_viền: "chỉ áp khi vote=free" },
      2400,
      { kind: "vision", phase: "gates", ratios: ratios, thr: 0.12, emptyVotes: emptyVotes, verdict: "occupied", gatesUsed: false }));
    S.push(frame("Bộ làm mượt — đủ lâu mới đổi màu",
      "Kết quả phải giữ đủ occupied_seconds (0.5s, tham số chạy thật) mới chốt 'có xe' — một cú nháy không đổi màu ô được.",
      [6],
      { dwell: "≥ 0.5s", xác_nhận: "đang tích lũy", nháy: "bị chặn" },
      2400,
      { kind: "vision", phase: "smooth", ratios: ratios, thr: 0.12, emptyVotes: emptyVotes, dwell0: 0, dwell1: 0.5, need: 0.5, verdict: "occupied" }));
    S.push(frame("Bằng chứng kèm dấu giờ — kết quả cũ bị loại",
      "Mỗi kết quả mang theo số phiếu, tỉ lệ và dấu giờ nguồn. Hệ thống chỉ nhận kết quả có giờ tăng dần — job trễ hạn bị loại, không áp vào bước sau.",
      [7],
      { bằng_chứng: "votes+ratios+rescue+timestamp", tăng_dần: "timestamp tăng mới chấp nhận", trễ: "rejected" },
      2600,
      { kind: "vision", phase: "evidence", ratios: ratios, thr: 0.12, emptyVotes: emptyVotes, verdict: "occupied" }));
    S.push(frame("Tóm tắt: trống phải được chứng minh",
      "Luật chơi bất đối xứng: chỉ đếm phiếu TRỐNG (đủ 12/25 mới tạm trống) — 'có xe' là phần còn lại sau hai trạm kiểm và làm mượt. Khó bỏ sót xe hơn khó báo nhầm.",
      [7],
      { rule: "trống ⇐ empty_votes ≥ 12 ∧ không-lõi ∧ không-viền", occupied: "phần bù — không có occupied_votes", bất_đối_xứng: "an toàn hơn" },
      2600,
      { kind: "vision", phase: "done", ratios: ratios, thr: 0.12, emptyVotes: emptyVotes, verdict: "occupied", slotRatio: 0.62 }));
    return S;
  }

  function visionEdgeScenes() {
    var ratios = [
      0.08, 0.07, 0.10, 0.09, 0.06,
      0.11, 0.05, 0.08, 0.10, 0.07,
      0.09, 0.12, 0.06, 0.08, 0.10,
      0.16, 0.11, 0.09, 0.13, 0.07,
      0.10, 0.08, 0.12, 0.09, 0.11
    ];
    var emptyVotes = ratios.filter(function (r) { return r < 0.12; }).length;
    var S = [];
    S.push(frame("Xe tối màu + bóng — phiếu bị lừa",
      "Xe đen trong ô A05: đa số phiên bản đếm tỉ lệ thấp vì thân xe gần màu nền. Phiếu trống đạt " + emptyVotes + " ≥ 12 → tạm kết luận TRỐNG — báo sai nếu dừng ở đây.",
      [0, 1, 2, 3],
      { empty_votes: emptyVotes + " / 25", mốc: "≥ 12", tạm: "TRUE — nguy hiểm", nguyên_nhân: "xe tối màu + bóng" },
      2800,
      { kind: "vision", phase: "vote", ratios: ratios, thr: 0.12, emptyVotes: emptyVotes, required: 12, verdict: "free→?" }));
    S.push(frame("Trạm lõi lật lại",
      "Ảnh gốc (không qua phiên bản) lộ một vật đặc ngay lõi ô — dấu hiệu xe thật mà các bản tối đã đánh mất. Kết luận lật: TRỐNG → CÓ XE.",
      [4],
      { trạm_lõi: "component ở lõi → lật", is_free: "FALSE", kết_luận: "occupied" },
      2600,
      { kind: "vision", phase: "rescue", ratios: ratios, thr: 0.12, emptyVotes: emptyVotes, verdict: "occupied", gatesUsed: true, rescueUsed: true }));
    S.push(frame("Trạm viền — cửa sau cùng",
      "Nếu trạm lõi không cứu, đường viền trong ô đủ dày vẫn lật được — dành cho xe bóng nhẵn ít vân. Ở đây trạm lõi đã lật nên không cần.",
      [5],
      { viền: "(chỉ chạy nếu vẫn trống)", order: "phiếu → lõi → viền", kết_luận: "occupied" },
      2400,
      { kind: "vision", phase: "edge", ratios: ratios, thr: 0.12, emptyVotes: emptyVotes, verdict: "occupied" }));
    S.push(frame("Kết quả cuối + bài học",
      "Ô vẫn báo CÓ XE: phiếu trống đạt ngưỡng nhưng bị trạm lõi vô hiệu. Đây là lý do hệ thống vote cho TRỐNG rồi đặt trạm lật — chứ không đếm hai phía cân bằng.",
      [6, 7],
      { kết_luận: "occupied (trạm lõi)", nháy: "làm mượt vẫn đòi đủ giờ", bài_học: "phiếu ≠ kết luận cuối" },
      2600,
      { kind: "vision", phase: "done", ratios: ratios, thr: 0.12, emptyVotes: emptyVotes, verdict: "occupied", slotRatio: 0.62, rescueUsed: true }));
    return S;
  }

  /* ================= NODE 3 — binder ================= */

  var BINDER_PSEUDO = [
    "Ghép vết xe → ô theo độ chồng lấn (lapjv; +0.15 ưu tiên ô đang giữ)",
    "Ghi quan sát: tâm/chồng-lấn/tươi — vết mất dấu không 'tươi' (vision_primary)",
    "Xe dừng → vết chết → đóng dấu đơn xin ô tại mốc lost",
    "Đơn tích điểm + chờ pixel xác nhận 'có xe' ≥ 2 lần",
    "Đủ cửa (0.35s sau lost, ≥3 quan sát, chồng lấn ≥0.35, thấy-vào-ô, không đối thủ) → bind",
    "Hoặc: chồng lấn ≥0.60 kéo dài + đứng yên → bind thẳng",
    "Episode parked: ô đỏ, mã số khóa chỗ, vết local tách ra",
    "Rời ô: pixel báo trống → thẻ chờ (departure) giữ GID 5s",
    "Vết rời đúng ô khớp thẻ chờ → trả lại GID (sai ô/cam → lỗi)"
  ];

  function binderScenes() {
    var S = [];
    S.push(frame("Xe lái vào ô — ghép vết với ô",
      "Mỗi frame, mã số đang hoạt động được ghép vào ô theo độ chồng lấn — ô đang giữ được cộng thêm điểm để không nhảy lung tung. G#5 đang tiến vào A05, độ khớp tăng dần.",
      [0, 1],
      { track: "G#5 → A05", overlap: "0.18 → 0.45", đối_thủ: "A04 score 0.06", ô_đang_giữ: "+0.15 ô đang giữ" },
      2600,
      { kind: "binder", phase: "approach", car: { x0: 0.30, x1: 0.47, y: 0.52 }, slot: "A05", overlap0: 0.18, overlap1: 0.45 }));
    S.push(frame("Xe dừng — vết 'chết' là tín hiệu",
      "Mắt chuyển động không thấy vật đứng yên: vết mất dấu và không còn 'tươi' để đếm giờ đỗ. Nhưng chính cú mất dấu này mở ra đơn xin nhận ô.",
      [1, 2],
      { track: "G#5 LOST", fresh: "false", claim: "mở — lost_at_s đóng dấu", chuyển_động: "mù khi xe đứng" },
      2600,
      { kind: "binder", phase: "stopped", car: { x: 0.52, y: 0.52 }, slot: "A05", overlap: 0.62, trackLost: true, claim: { obs: 3, overlap: 0.62 } }));
    S.push(frame("Đơn xin ô tích dần + chờ pixel xác nhận",
      "Điểm đơn = chồng lấn + số mẫu + hướng vào + mức tiến vào ô (trọng số trong source). Song song, luồng pixel báo 'có xe' liên tiếp — cần ít nhất 2 lần. Hai nguồn phải cùng đồng ý.",
      [3],
      { score: "0.55·0.62+0.20·1+0.15·1+0.10·0.4 ≈ 0.73", xác_nhận: "1/2 → 2/2", hai_nguồn: "vết xe + pixel ô" },
      2800,
      { kind: "binder", phase: "converge", car: { x: 0.52, y: 0.52 }, slot: "A05", overlap: 0.62, trackLost: true,
        claim: { score: 0.73, streak0: 1, streak1: 2, need: 2 },
        terms: [{ k: "chồng lấn", w: 0.55, v: 0.62 }, { k: "số mẫu", w: 0.20, v: 1.0 }, { k: "vào ô", w: 0.15, v: 1.0 }, { k: "tiến vào", w: 0.10, v: 0.4 }] }));
    S.push(frame("Cửa kiểm trước khi chốt",
      "Chỉ chốt khi đủ: quá 0.35s sau mất dấu + pixel xác nhận ≥2 lần + ≥3 quan sát + chồng lấn đỉnh ≥0.35 + thấy xe thật sự đi vào ô + không đối thủ tranh.",
      [4],
      { sau_lost: "0.42s ≥ 0.35", xác_nhận: "2 ≥ 2", quan_sát: "3 ≥ 3", chồng_lấn: "0.62 ≥ 0.35", vào_ô: "thấy đi vào ✓", đối_thủ: "không" },
      2800,
      { kind: "binder", phase: "gates", car: { x: 0.52, y: 0.52 }, slot: "A05", overlap: 0.62, trackLost: true,
        claim: { score: 0.73, streak0: 2, streak1: 2, need: 2 },
        gates: [["mất dấu +0.35s", true], ["xác nhận ≥ 2", true], ["quan sát ≥ 3", true], ["chồng lấn ≥ 0.35", true], ["đi vào ô", true], ["không đối thủ", true]] }));
    S.push(frame("Mở episode — ô đỏ, mã số khóa",
      "Đủ cửa → bind và mở episode 'A05:G5:F812' trạng thái parked: ô đổi đỏ, mã số được giữ chỗ, mọi kèo ghép khác của G#5 đóng lại — không ai cướp được ô này.",
      [4, 6],
      { episode: "A05:G5:F812 parked", slot: "đỏ — occupied", giữ_chỗ: "G#5 khóa", điểm_hẹn: "đã hủy" },
      2800,
      { kind: "binder", phase: "parked", car: { x: 0.52, y: 0.52 }, slot: "A05", parked: true, episode: "A05:G5:F812", reservation: true,
        trackLost: true, trackLabel: "vết tách — episode giữ G#5", carNote: "vết tách — xe đậu yên" }));
    S.push(frame("Xe lùi ra — thẻ chờ giữ mã số",
      "Pixel báo ô trống → cấp thẻ chờ (departure token) cho G#5: kèm hình ô, ngoại hình và bằng chứng ô nào/cam nào, hiệu lực 5 giây. Episode chuyển 'đang rời'. Đây là bằng chứng duy nhất mở lại được mã số.",
      [7],
      { episode: "departing", thẻ_chờ: "G#5 @A05 — 5.0s", pixel: "trống ×2 → xác nhận", giữ_chỗ: "giữ tới khi chốt" },
      2600,
      { kind: "binder", phase: "departing", car: { x0: 0.52, x1: 0.62, y: 0.52 }, slot: "A05", parked: false, token: { gid: "G#5", ttl0: 5.0, ttl1: 2.6 },
        trackLost: true, trackLabel: "vết mới local#7 — chờ khớp thẻ", carNote: "vết mới chưa ràng — xe đang lùi" }));
    S.push(frame("Nhận lại: vết rời đúng ô được trả mã số",
      "Bước cứu chạy TRƯỚC khi cấp số mới: vết local#7 rời đúng ô A05 khớp thẻ chờ — đúng cam + đúng ô (sai thì báo lỗi, không nhận bừa). G#5 trở về — không cấp số mới.",
      [8],
      { "local#7": "→ G#5 (recovered)", bằng_chứng: "đúng cam + đúng slot", GID_mới: "không cấp", order: "recovery trước allocation" },
      2600,
      { kind: "binder", phase: "recover", car: { x0: 0.62, x1: 0.74, y: 0.50 }, slot: "A05", parked: false, recovered: true,
        trackLabel: "vết local#7 sống — đã trả G#5" }));
    S.push(frame("Tóm tắt: hai nguồn cùng đồng ý",
      "Chủ ô chỉ được chốt khi vết xe và pixel cùng đồng ý (đường đơn), hoặc chồng lấn cao đủ lâu (đường nhanh). Thẻ chờ là cây cầu duy nhất qua khoảng cả hai mắt đều 'mù' lúc xe đang lùi.",
      [4, 5, 8],
      { paths: "đường đơn | đường nhanh", episode: "kết luận cuối về chỗ đỗ", thẻ_chờ: "cầu nối khi xe rời" },
      2600,
      { kind: "binder", phase: "done", car: { x: 0.74, y: 0.50 }, slot: "A05", parked: false, recovered: true }));
    return S;
  }

  function binderEdgeScenes() {
    var S = [];
    S.push(frame("Xe lê bánh vào ô — vết còn sống",
      "Khác kịch bản trên: xe nhích từ từ vào A05 nên mắt chuyển động vẫn thấy — vết còn sống, quan sát còn 'tươi'. Không có cú mất dấu → không có đơn xin ô.",
      [0, 1],
      { track: "G#5 vẫn confirmed", fresh: "true", claim: "không mở — chưa lost" },
      2400,
      { kind: "binder", phase: "approach", car: { x0: 0.40, x1: 0.50, y: 0.52 }, slot: "A05", overlap0: 0.40, overlap1: 0.62 }));
    S.push(frame("Chồng lấn cao kéo dài → đếm giờ đỗ",
      "Chồng lấn ≥ 0.60 giữ liên tục → đồng hồ đỗ chạy: cần đủ ≈1.15 giây VÀ tối thiểu 8 mẫu quan sát (ngưỡng trong source, xem refs).",
      [5],
      { overlap: "0.62 ≥ 0.60", dwell: "0 → 1.15s", samples: "≥ 8", track: "vẫn alive" },
      2600,
      { kind: "binder", phase: "dwell", car: { x: 0.52, y: 0.52 }, slot: "A05", overlap: 0.62, dwell0: 0, dwell1: 1.15, need: 1.15 }));
    S.push(frame("Kiểm đứng yên — trừ xe đang trôi",
      "Giờ đỗ chỉ đếm khi tâm xe ổn định: ≥60% điểm đo gọn trong vòng tròn nhỏ (bán kính 0.06×đường chéo ô) và tổng độ trôi không quá 0.10×đường chéo (tối thiểu 5px). Xe trôi dần thì đếm lại từ đầu — 'đỗ' là đã dừng, không phải đang nằm trong ô.",
      [5],
      { inlier: "78% ≥ 60%", drift: "3.1px ≤ 5px", stable: "true" },
      2600,
      { kind: "binder", phase: "stable", car: { x: 0.52, y: 0.52 }, slot: "A05", overlap: 0.62, dwell0: 1.15, dwell1: 1.15, need: 1.15, stable: true }));
    S.push(frame("Chốt thẳng — không cần đơn",
      "Đủ giờ đỗ + đứng yên + chồng lấn → bind và mở episode 'A05:G5:F812' ngay — không qua đơn xin vì vết chưa chết. Hai đường cùng đổ về một episode.",
      [5, 6],
      { episode: "A05:G5:F812 parked", path: "strong-overlap (không claim)", slot: "đỏ" },
      2400,
      { kind: "binder", phase: "parked", car: { x: 0.52, y: 0.52 }, slot: "A05", parked: true, episode: "A05:G5:F812", reservation: true }));
    S.push(frame("So sánh hai đường chốt",
      "Đường đơn: xe khựng hẳn → vết chết → đơn + pixel xác nhận → chốt (chậm hơn ~0.35s). Đường nhanh: vết sống + chồng lấn cao bền + đứng yên → chốt. Bản chạy thật vision_primary dùng cả hai.",
      [4, 5],
      { claim_path: "lost → claim → streak → bind", strong_path: "alive → dwell+stable → bind", both: "vision_primary" },
      2800,
      { kind: "binder", phase: "compare", car: { x: 0.52, y: 0.52 }, slot: "A05", parked: true, episode: "A05:G5:F812", reservation: true }));
    return S;
  }

  /* ---------------- draws ---------------- */

  function drawHandoff(ctx, f, view) {
    var s = f.scene, w = view.width, h = view.height, t = ease(view.progress);
    var pw = w * 0.335, ph = h * 0.44, py = h * 0.055;
    var c1x = w * 0.03, c2x = w * 0.635;
    panel(ctx, c1x, py, pw, ph, "CAM1", COL.cam1);
    panel(ctx, c2x, py, pw, ph, "CAM2", COL.cam2);
    // overlap zones
    ctx.fillStyle = "rgba(255,183,3,.10)";
    ctx.fillRect(c1x + pw * 0.68, py + 24, pw * 0.24, ph - 34);
    ctx.fillRect(c2x + pw * 0.08, py + 24, pw * 0.24, ph - 34);
    label(ctx, "overlap", c1x + pw * 0.80, py + ph - 14, { size: 10, color: COL.warn, align: "center" });
    label(ctx, "overlap", c2x + pw * 0.20, py + ph - 14, { size: 10, color: COL.warn, align: "center" });
    // cam1 car
    if (s.car1) {
      var x1 = c1x + pw * lerp(s.car1.x0, s.car1.x1, t), y1 = py + ph * s.car1.y;
      var lost = s.cam1Lost && t > 0.4;
      ctx.save(); if (lost) ctx.globalAlpha = 0.28;
      car(ctx, x1, y1, pw * 0.20, ph * 0.18, COL.car);
      ctx.restore();
      if (lost) dashedLine(ctx, x1 - pw * 0.11, y1 - ph * 0.10, x1 + pw * 0.11, y1 + ph * 0.10, COL.bad);
      idBadge(ctx, x1 - 46, y1 - ph * 0.24, lost ? "G#5 · LOST" : "G#5", "local#12 · cam1", lost);
    }
    // cam2 cars
    if (s.car2) {
      var cx2 = s.car2.x0 != null ? lerp(s.car2.x0, s.car2.x1, t) : s.car2.x;
      var x2 = c2x + pw * cx2, y2 = py + ph * s.car2.y;
      car(ctx, x2, y2, pw * 0.20, ph * 0.18, COL.car);
      var bound = s.phase === "bind" || s.phase === "done";
      var tentative = s.phase === "candidate" || s.phase === "cost" || s.phase === "assign";
      var waiting = s.phase === "expired" || s.phase === "waiting" || s.phase === "reid";
      var gidTxt = bound ? "G#5" : waiting ? "ID-less" : "local#3";
      var localTxt = bound ? "local→G#5 · cam2" : tentative ? "local#3 tentative" : "local#4 ID-less";
      if (s.phase === "reid") gidTxt = "local#4 →?";
      idBadge(ctx, x2 - 46, y2 - ph * 0.24, gidTxt, localTxt, !bound);
      if (bound) {
        var p = pulse(view.time / 1000, 0.8);
        ctx.strokeStyle = "rgba(87,204,153," + (0.4 + 0.5 * p) + ")";
        ctx.lineWidth = 2.5;
        rr(ctx, x2 - pw * 0.13, y2 - ph * 0.13, pw * 0.26, ph * 0.26, 8); ctx.stroke();
      }
    }
    if (s.far2) {
      var fx = c2x + pw * s.far2.x, fy = py + ph * s.far2.y;
      car(ctx, fx, fy, pw * 0.17, ph * 0.15, COL.carDim, 0.85);
      idBadge(ctx, fx - 40, fy - ph * 0.20, "local#9", "ngoài hành lang", true);
    }
    // shared world map strip
    var wy = py + ph + h * 0.035, wh = h * 0.20;
    panel(ctx, c1x, wy, w * 0.94, wh, "BẢN ĐỒ CHUNG (homography — đơn vị calibration, không phải px)", COL.world);
    if (s.worldTrail) {
      ctx.strokeStyle = COL.gid; ctx.lineWidth = 2; ctx.beginPath();
      s.worldTrail.forEach(function (p, i) {
        var px = c1x + w * 0.94 * (0.08 + p[0] * 0.84), pyy = wy + wh * (0.25 + p[1] * 0.5);
        i ? ctx.lineTo(px, pyy) : ctx.moveTo(px, pyy);
      });
      ctx.stroke();
      var last = s.worldTrail[s.worldTrail.length - 1];
      ctx.fillStyle = COL.gid;
      ctx.beginPath(); ctx.arc(c1x + w * 0.94 * (0.08 + last[0] * 0.84), wy + wh * (0.25 + last[1] * 0.5), 5, 0, 7); ctx.fill();
    }
    // corridor prediction from entry
    if (s.entry && s.entry.v) {
      var ex = c1x + w * 0.94 * (0.08 + 0.68 * 0.84), ey = wy + wh * (0.25 + 0.55 * 0.5);
      var p = pulse(view.time / 1000, 0.7);
      ctx.strokeStyle = "rgba(255,209,102," + (0.3 + 0.5 * p) + ")";
      ctx.setLineDash([6, 4]); ctx.lineWidth = 2;
      ctx.beginPath(); ctx.moveTo(ex, ey); ctx.lineTo(ex + w * 0.94 * 0.14 * s.entry.v[0], ey); ctx.stroke();
      ctx.setLineDash([]);
      // corridor on cam2
      ctx.fillStyle = "rgba(255,209,102," + (0.05 + 0.07 * p) + ")";
      ctx.fillRect(c2x + pw * 0.05, py + 30, pw * 0.28, ph * 0.55);
    }
    // entry card
    var cardY = wy + wh + h * 0.02, cardH = h * 0.24;
    if (s.entry) {
      var ttl = Math.round(lerp(s.entry.ttl0, s.entry.ttl1, t));
      var alpha = s.phase === "expired" ? Math.max(0.25, 1 - t * 0.7) : 1;
      ctx.save(); ctx.globalAlpha = alpha;
      panel(ctx, c1x, cardY, w * 0.46, cardH, "ĐIỂM HẸN  G#5 → cam2", "#1d2836");
      label(ctx, "vận tốc " + (s.entry.v ? "(" + s.entry.v[0] + "," + s.entry.v[1] + ")" : "—"), c1x + 14, cardY + cardH * 0.38, { size: 12 });
      label(ctx, "album màu", c1x + 14, cardY + cardH * 0.62, { size: 11, color: COL.faint });
      histChip(ctx, c1x + w * 0.30, cardY + cardH * 0.62, 90, [0.3, 0.7, 0.9, 0.5, 0.8, 0.4, 0.6, 0.2], COL.gid);
      label(ctx, "còn hạn", c1x + 14, cardY + cardH * 0.84, { size: 11, color: COL.faint });
      bar(ctx, c1x + 48, cardY + cardH * 0.80, w * 0.30, 9, ttl / 45, ttl > 10 ? COL.gid : COL.bad, ttl + "f");
      ctx.restore();
    }
    // candidate cost detail
    if (s.cand && s.cand.terms) {
      panel(ctx, c1x + w * 0.50, cardY, w * 0.44, cardH, "ĐIỂM KHỚP  local#3 ← G#5", "#1d2836");
      var bx = c1x + w * 0.50 + 14, bw = w * 0.44 - 175;
      s.cand.terms.forEach(function (term, i) {
        var by = cardY + cardH * (0.24 + i * 0.15);
        label(ctx, term.k + " ×" + term.w, bx, by, { size: 11, color: COL.faint });
        bar(ctx, bx + 92, by - 5, bw, 9, Math.min(1, term.c * 3), COL.local, term.c.toFixed(3));
      });
      label(ctx, "Σ = " + s.cand.total + "  ≤ 0.92 ✓", bx, cardY + cardH * 0.80, { size: 13, bold: true, color: COL.ok });
      label(ctx, s.cand.reject, bx, cardY + cardH * 0.92, { size: 10, color: COL.bad });
    }
    if (s.cand && s.cand.streak0 != null) {
      panel(ctx, c1x + w * 0.50, cardY, w * 0.44, cardH, "GHÉP MỘT-MỘT", "#1d2836");
      var bx2 = c1x + w * 0.50 + 14;
      label(ctx, "lapjv → local#3 ↔ G#5 (cost " + s.cand.total + ")", bx2, cardY + cardH * 0.34, { size: 12 });
      label(ctx, "margin 0.756 ≥ 0.08 ✓", bx2, cardY + cardH * 0.55, { size: 12, color: COL.ok });
      var st = Math.round(lerp(s.cand.streak0, s.cand.streak1, t));
      label(ctx, "bằng chứng liên tiếp", bx2, cardY + cardH * 0.76, { size: 12, color: COL.faint });
      bar(ctx, bx2 + 110, cardY + cardH * 0.72, w * 0.18, 9, st / s.cand.need, COL.ok, st + "/" + s.cand.need);
    }
    if (s.cand && s.cand.gallery) {
      panel(ctx, c1x + w * 0.50, cardY, w * 0.44, cardH, "NHẬN LẠI 'NGƯỜI QUEN'  (histogram — không deep)", "#1d2836");
      var bx3 = c1x + w * 0.50 + 14;
      label(ctx, "album G#5 (cam1)", bx3, cardY + cardH * 0.30, { size: 11, color: COL.faint });
      histChip(ctx, bx3 + 130, cardY + cardH * 0.30, 80, [0.3, 0.7, 0.9, 0.5, 0.8, 0.4, 0.6, 0.2], COL.gid);
      label(ctx, "album local#4 (cam2)", bx3, cardY + cardH * 0.55, { size: 11, color: COL.faint });
      histChip(ctx, bx3 + 130, cardY + cardH * 0.55, 80, [0.35, 0.65, 0.85, 0.55, 0.75, 0.45, 0.55, 0.25], COL.local);
      label(ctx, "distance " + s.cand.dist + " < " + s.cand.thr + " ✓", bx3, cardY + cardH * 0.82, { size: 13, bold: true, color: COL.ok });
      // reachable ring on world map
      var rx = c1x + w * 0.94 * (0.08 + 0.58 * 0.84), ry = wy + wh * (0.25 + 0.55 * 0.5);
      ctx.strokeStyle = "rgba(142,202,230,.6)"; ctx.setLineDash([4, 4]);
      ctx.beginPath(); ctx.arc(rx, ry, wh * 0.45, 0, 7); ctx.stroke(); ctx.setLineDash([]);
      label(ctx, "tới được", rx, ry - wh * 0.5, { size: 9, color: COL.local, align: "center" });
    }
    // verdict ribbon
    if (s.phase === "bind" || s.phase === "done") {
      var vp = pulse(view.time / 1000, 0.6);
      ctx.fillStyle = "rgba(87,204,153," + (0.12 + 0.1 * vp) + ")";
      rr(ctx, w * 0.30, h * 0.94 - 18, w * 0.40, 34, 8); ctx.fill();
      label(ctx, "1 xe · 1 GID qua 2 camera", w * 0.5, h * 0.94, { size: 14, bold: true, color: COL.ok, align: "center" });
    }
    // waiting badge
    if (s.phase === "waiting" || s.phase === "expired") {
      label(ctx, s.phase === "expired" ? "ĐIỂM HẸN QUÁ HẠN — lỡ ghép" : "VẾT MỚI CHỜ — chưa cấp mã số",
        w * 0.5, h * 0.94, { size: 13, bold: true, color: COL.warn, align: "center" });
    }
  }

  function drawVision(ctx, f, view) {
    var s = f.scene, w = view.width, h = view.height, t = ease(view.progress);
    // left: slot ROI
    var lx = w * 0.03, ly = h * 0.06, lw = w * 0.36, lh = h * 0.60;
    panel(ctx, lx, ly, lw, lh, "CAM — Ô A05 (vùng ô)", COL.cam1);
    var sx = lx + lw * 0.18, sy = ly + lh * 0.22, sw = lw * 0.62, sh = lh * 0.52;
    ctx.strokeStyle = COL.faint; ctx.lineWidth = 2;
    ctx.strokeRect(sx, sy, sw, sh);
    // analysis vs core mask
    ctx.fillStyle = "rgba(142,202,230,.08)"; ctx.fillRect(sx, sy, sw, sh);
    ctx.fillStyle = "rgba(255,209,102,.10)";
    ctx.fillRect(sx + sw * 0.25, sy + sh * 0.25, sw * 0.5, sh * 0.5);
    label(ctx, "vùng đếm (analysis_mask)", sx + 4, sy - 14, { size: 10, color: COL.local });
    label(ctx, "lõi (core_mask)", sx + sw * 0.5, sy + sh * 0.5, { size: 10, color: COL.gid, align: "center" });
    // car inside (occupied)
    var showCar = s.phase !== "roi" || true;
    if (showCar) car(ctx, sx + sw * 0.5, sy + sh * 0.52, sw * 0.55, sh * 0.42, s.verdict === "free→?" ? "#2e3d4d" : COL.car);
    // slot verdict color
    var occ = s.verdict === "occupied";
    var freeTam = s.verdict === "free→?";
    ctx.strokeStyle = freeTam ? COL.warn : occ ? COL.slotOcc : COL.slotFree;
    ctx.lineWidth = 4; ctx.strokeRect(sx - 3, sy - 3, sw + 6, sh + 6);
    label(ctx, freeTam ? "TRỐNG (tạm)" : occ ? "CÓ XE" : "—",
      sx + sw + 10, sy + 10, { size: 14, bold: true, color: freeTam ? COL.warn : occ ? COL.bad : COL.ok });
    // right: variant grid 5x5
    var gx = w * 0.44, gy = h * 0.06, gw = w * 0.53, gh = h * 0.46;
    panel(ctx, gx, gy, gw, gh, "25 biến thể CLAHE×gamma — mỗi ô = ratio 'khác nền' của 1 biến thể", COL.panel);
    if (s.ratios) {
      var cw = (gw - 60) / 5, ch = (gh - 60) / 5;
      var reveal = Math.floor(lerp(0, 26, t));
      s.ratios.forEach(function (r, i) {
        var row = Math.floor(i / 5), col = i % 5;
        var x = gx + 18 + col * cw, y = gy + 42 + row * ch;
        var empty = r < (s.thr || 0.12);
        var shown = s.phase === "roi" ? false : (i < reveal || s.phase !== "variants");
        ctx.fillStyle = !shown ? "rgba(255,255,255,.05)" : empty ? "rgba(87,204,153,.20)" : "rgba(239,71,111,.18)";
        rr(ctx, x, y, cw - 6, ch - 6, 4); ctx.fill();
        if (shown) {
          label(ctx, r.toFixed(2), x + (cw - 6) / 2, y + (ch - 6) / 2 - 5, { size: 10, align: "center", color: empty ? COL.ok : COL.bad });
          label(ctx, empty ? "trống" : "có vật", x + (cw - 6) / 2, y + (ch - 6) / 2 + 8, { size: 8, align: "center", color: empty ? COL.ok : COL.bad });
        }
      });
    }
    // bottom: vote tally + gates
    var by = gy + gh + h * 0.03, bh = h * 0.26;
    panel(ctx, gx, by, gw, bh, "PHIẾU TRỐNG & CỔNG LẬT", "#1d2836");
    if (s.emptyVotes != null && s.phase !== "roi") {
      var ev = Math.round(s.phase === "vote" ? lerp(0, s.emptyVotes, t) : s.emptyVotes);
      label(ctx, "empty_votes", gx + 16, by + bh * 0.26, { size: 12, color: COL.faint });
      bar(ctx, gx + 110, by + bh * 0.26 - 6, gw * 0.30, 11, ev / 25, COL.ok, ev + "/25");
      var reqX = gx + 110 + gw * 0.30 * (12 / 25);
      ctx.strokeStyle = COL.warn; ctx.setLineDash([3, 3]);
      ctx.beginPath(); ctx.moveTo(reqX, by + bh * 0.26 - 10); ctx.lineTo(reqX, by + bh * 0.26 + 10); ctx.stroke();
      ctx.setLineDash([]);
      label(ctx, "≥12 = free", reqX + 4, by + bh * 0.26 - 14, { size: 9, color: COL.warn });
    }
    var gates = [["empty_votes ≥ 12", s.emptyVotes != null && s.phase !== "roi" ? s.emptyVotes >= 12 : null],
      ["core-rescue lật", s.rescueUsed === true ? true : s.gatesUsed ? false : null],
      ["edge recheck lật", s.gatesUsed && !s.rescueUsed ? "n/a" : null]];
    gates.forEach(function (g, i) {
      var yy = by + bh * (0.52 + i * 0.16);
      var mark = g[1] === true ? "✓" : g[1] === false ? "✗" : "·";
      var color = g[1] === true ? COL.ok : g[1] === false ? COL.bad : COL.dim;
      label(ctx, mark + "  " + g[0], gx + 16, yy, { size: 11, color: color });
    });
    // dwell bar (smooth phase)
    if (s.dwell0 != null) {
      var dw = lerp(s.dwell0, s.dwell1, t);
      label(ctx, "giờ 'có xe'", gx + gw * 0.55, by + bh * 0.26, { size: 12, color: COL.faint });
      bar(ctx, gx + gw * 0.55 + 100, by + bh * 0.26 - 6, gw * 0.22, 11, dw / s.need, COL.bad, dw.toFixed(2) + "s/" + s.need + "s");
    }
    if (s.phase === "evidence") {
      label(ctx, 'evidence = {empty_votes:' + s.emptyVotes + ', required:12, rescue:false, ts:mono↑}', gx + 16, by + bh * 0.80, { size: 11, color: COL.local });
    }
    if (s.phase === "rescue") {
      var p = pulse(view.time / 1000, 0.9);
      ctx.fillStyle = "rgba(255,183,3," + (0.10 + 0.10 * p) + ")";
      ctx.fillRect(sx + sw * 0.25, sy + sh * 0.25, sw * 0.5, sh * 0.5);
      label(ctx, "component đặc ở lõi → LẬT", sx + sw * 0.5, sy - 30, { size: 12, bold: true, color: COL.warn, align: "center" });
    }
    // verdict ribbon
    var vtxt = occ ? "OCCUPIED — phần bù khi không chứng minh được trống" : freeTam ? "vote nói TRỐNG — chờ cổng lật" : s.phase === "done" ? "OCCUPIED" : "";
    if (vtxt) label(ctx, vtxt, w * 0.5, h * 0.955, { size: 13, bold: true, color: occ ? COL.bad : COL.warn, align: "center" });
  }

  function drawBinder(ctx, f, view) {
    var s = f.scene, w = view.width, h = view.height, t = ease(view.progress);
    // left: camera slot map
    var lx = w * 0.03, ly = h * 0.06, lw = w * 0.40, lh = h * 0.62;
    panel(ctx, lx, ly, lw, lh, "CAM — bản đồ ô đỗ", COL.cam1);
    var slots = [["A04", 0.12, 0.30], ["A05", 0.50, 0.30], ["A06", 0.12, 0.66]];
    slots.forEach(function (sl) {
      var id = sl[0], px = lx + lw * sl[1], py = ly + lh * sl[2], pw2 = lw * 0.34, ph2 = lh * 0.24;
      var isTarget = sl[0] === s.slot;
      var fill = "rgba(255,255,255,.04)";
      if (isTarget && s.parked) fill = "rgba(166,61,64,.55)";
      else if (isTarget && (s.claim || s.phase === "stopped" || s.phase === "converge" || s.phase === "gates" || s.phase === "dwell" || s.phase === "stable")) fill = "rgba(138,109,29,.45)";
      ctx.fillStyle = fill; ctx.fillRect(px, py, pw2, ph2);
      ctx.strokeStyle = isTarget ? (s.parked ? COL.bad : COL.warn) : COL.line;
      ctx.lineWidth = isTarget ? 3 : 1.5; ctx.strokeRect(px, py, pw2, ph2);
      label(ctx, id, px + 6, py + 12, { size: 11, color: isTarget ? COL.ink : COL.faint });
      if (isTarget && s.parked) label(ctx, "G#5", px + pw2 - 8, py + ph2 - 10, { size: 13, bold: true, color: COL.gid, align: "right" });
    });
    // car
    var carX = s.car.x0 != null ? lerp(s.car.x0, s.car.x1, t) : s.car.x;
    var cxx = lx + lw * carX, cyy = ly + lh * s.car.y;
    var lostFade = s.trackLost ? Math.max(0.3, 1 - t * 0.6) : 1;
    car(ctx, cxx, cyy, lw * 0.20, lh * 0.13, COL.car, lostFade);
    if (s.trackLost) {
      dashedLine(ctx, cxx - lw * 0.11, cyy - lh * 0.08, cxx + lw * 0.11, cyy + lh * 0.08, COL.bad);
      label(ctx, s.carNote || "vết mất dấu — xe vẫn ở đây", cxx, cyy - lh * 0.15, { size: 10, color: COL.bad, align: "center" });
    }
    idBadge(ctx, cxx - 46, cyy - lh * 0.24, s.parked || s.recovered ? "G#5" : s.trackLost ? "G#5 · LOST" : "G#5", "track→slot", !s.parked && !s.recovered);
    // overlap meter near slot
    var ov = s.overlap != null ? s.overlap : (s.overlap0 != null ? lerp(s.overlap0, s.overlap1, t) : null);
    if (ov != null) {
      label(ctx, "overlap " + ov.toFixed(2), lx + lw * 0.55, ly + lh * 0.16, { size: 12, color: COL.local });
      bar(ctx, lx + lw * 0.72, ly + lh * 0.16 - 6, lw * 0.20, 10, ov, ov >= 0.6 ? COL.ok : COL.warn);
      ctx.strokeStyle = COL.gid; ctx.setLineDash([3, 3]);
      var ox = lx + lw * 0.72 + lw * 0.20 * 0.6;
      ctx.beginPath(); ctx.moveTo(ox, ly + lh * 0.16 - 9); ctx.lineTo(ox, ly + lh * 0.16 + 9); ctx.stroke(); ctx.setLineDash([]);
    }
    // right: convergence panel
    var rx = w * 0.48, ry = h * 0.06, rw = w * 0.49, rh = h * 0.62;
    panel(ctx, rx, ry, rw, rh, "HAI NGUỒN CÙNG ĐỒNG Ý → CHỦ Ô", "#1d2836");
    var iy = ry + 34;
    // track lane
    label(ctx, "VẾT XE", rx + 14, iy, { size: 11, bold: true, color: COL.local });
    label(ctx, s.trackLabel || (s.trackLost ? "mất dấu — chỉ còn ký ức đơn" : "còn sống, tươi"), rx + 14, iy + 18, { size: 11, color: s.trackLost ? COL.bad : COL.ok });
    // vision lane
    label(ctx, "PIXEL Ô", rx + rw * 0.5, iy, { size: 11, bold: true, color: COL.local });
    var streak = s.claim && s.claim.streak0 != null ? Math.round(lerp(s.claim.streak0, s.claim.streak1, t)) : (s.parked || s.phase === "departing" ? 2 : null);
    label(ctx, streak != null ? "xác nhận " + streak + "/2 'có xe'" : (s.phase === "departing" ? "trống ×2" : "—"), rx + rw * 0.5, iy + 18, { size: 11, color: streak >= 2 ? COL.ok : COL.faint });
    // claim score terms
    if (s.terms) {
      label(ctx, "điểm đơn", rx + 14, iy + 44, { size: 12, color: COL.faint });
      s.terms.forEach(function (term, i) {
        var yy = iy + 64 + i * 20;
        label(ctx, term.k + " ×" + term.w, rx + 14, yy, { size: 11, color: COL.faint });
        bar(ctx, rx + 110, yy - 5, rw * 0.30, 8, Math.min(1, term.v), COL.local, "×" + term.v.toFixed(2));
      });
      label(ctx, "Σ ≈ " + s.claim.score, rx + 14, iy + 64 + s.terms.length * 20 + 4, { size: 13, bold: true, color: COL.gid });
    }
    // streak bar
    if (s.claim && s.claim.streak0 != null) {
      label(ctx, "pixel xác nhận", rx + rw * 0.5, iy + 44, { size: 12, color: COL.faint });
      bar(ctx, rx + rw * 0.5, iy + 62, rw * 0.28, 10, streak / s.claim.need, COL.ok, streak + "/" + s.claim.need);
    }
    // gates checklist
    if (s.gates) {
      label(ctx, "cửa kiểm", rx + 14, iy + 44, { size: 12, bold: true, color: COL.faint });
      s.gates.forEach(function (g, i) {
        var col = i % 2, row = Math.floor(i / 2);
        label(ctx, (g[1] ? "✓ " : "✗ ") + g[0], rx + 14 + col * rw * 0.48, iy + 66 + row * 20, { size: 11, color: g[1] ? COL.ok : COL.bad });
      });
    }
    // dwell bar (edge scenario)
    if (s.dwell0 != null) {
      var dw = lerp(s.dwell0, s.dwell1, t);
      label(ctx, "giờ đỗ (chồng lấn ≥0.60)", rx + 14, iy + 44, { size: 12, color: COL.faint });
      bar(ctx, rx + 14, iy + 62, rw * 0.55, 12, dw / s.need, dw >= s.need ? COL.ok : COL.warn, dw.toFixed(2) + "s / " + s.need + "s");
      if (s.stable != null) label(ctx, "đứng yên: ≥60% trong vòng (r=0.06·diag) ∧ trôi (drift)≤max(5px,0.10·diag) → " + (s.stable ? "✓" : "✗"), rx + 14, iy + 90, { size: 11, color: s.stable ? COL.ok : COL.bad });
    }
    // token card
    if (s.token) {
      var ttl = lerp(s.token.ttl0, s.token.ttl1, t);
      var ty = iy + rh * 0.42;
      panel(ctx, rx + 14, ty, rw - 28, rh * 0.44, "THẺ CHỜ (departure token)", "#3a2a12");
      label(ctx, "G#5 @ A05 (bằng chứng cam+ô)", rx + 26, ty + 34, { size: 12, color: COL.gid });
      histChip(ctx, rx + 26, ty + 62, 80, [0.3, 0.7, 0.9, 0.5, 0.8, 0.4, 0.6, 0.2], COL.gid);
      label(ctx, "còn hạn", rx + 26, ty + 92, { size: 11, color: COL.faint });
      bar(ctx, rx + 60, ty + 87, rw * 0.45, 10, ttl / 5, ttl > 1.5 ? COL.gid : COL.bad, ttl.toFixed(1) + "s");
    }
    // recovered flash
    if (s.recovered) {
      var p = pulse(view.time / 1000, 0.8);
      ctx.strokeStyle = "rgba(87,204,153," + (0.5 + 0.4 * p) + ")"; ctx.lineWidth = 3;
      rr(ctx, cxx - lw * 0.13, cyy - lh * 0.12, lw * 0.26, lh * 0.22, 8); ctx.stroke();
      label(ctx, "local#7 → G#5 (thẻ chờ)", cxx, cyy + lh * 0.16, { size: 11, bold: true, color: COL.ok, align: "center" });
    }
    // bottom: episode strip
    var ey = ry + rh + h * 0.03, eh = h * 0.24;
    panel(ctx, rx, ey, rw, eh, "EPISODE ĐỖ Ô", COL.panel);
    if (s.episode) {
      label(ctx, s.episode, rx + 14, ey + 34, { size: 14, bold: true, color: COL.gid });
      var st = s.phase === "departing" ? "departing" : "parked";
      label(ctx, "state: " + st, rx + 14, ey + 58, { size: 12, color: st === "parked" ? COL.bad : COL.warn });
      if (s.reservation) label(ctx, "giữ chỗ: G#5 khóa — vết tách, điểm hẹn hủy", rx + 14, ey + 80, { size: 11, color: COL.local });
      if (s.phase === "compare") {
        label(ctx, "đường đơn: mất dấu→đơn→pixel xác nhận→chốt  |  đường nhanh: vết sống→giờ đỗ+đứng yên→chốt", rx + 14, ey + 102, { size: 11, color: COL.faint });
      }
    } else {
      label(ctx, "chưa có episode — pending", rx + 14, ey + 34, { size: 12, color: COL.dim });
      if (s.claim) label(ctx, "đơn xin ô đang tích (chưa phải session PARKED)", rx + 14, ey + 58, { size: 11, color: COL.faint });
      if (s.phase === "recover") label(ctx, "thẻ chờ khớp → bind_external_id(G#5)", rx + 14, ey + 58, { size: 11, color: COL.ok });
    }
  }

  /* ---------------- node defs ---------------- */

  var SRC = "backend/main_detect/";

  var handoffNode = {
    id: "handoff",
    title: "Giữ cùng một xe qua hai camera",
    group: "identity",
    summary: "Cam1 mất dấu, cam2 nhặt lại — hệ thống nhận ra vẫn là chiếc xe cũ và giữ nguyên một mã số.",
    answers: {
      does: "Trước khi xe ra khỏi cam1, hệ thống đặt sẵn một 'điểm hẹn' bên cam2: dự đoán chỗ xe sẽ xuất hiện. Ứng viên nào khớp nhất — gần điểm hẹn, giống ngoại hình, cùng cỡ, cùng hướng — được nhận là cùng xe. Lỡ mất dấu lâu: một vòng nhận lại 'người quen' cứu mã số cũ.",
      role: "Trước: mỗi cam tự theo dõi riêng. Sau: một mã số chung (GID) cho phần gắn ô và phiên dùng. Mất nó: mỗi lần đổi cam là một 'người mới' — một xe sinh nhiều hồ sơ.",
      where: "CrossCameraManager._upsert_handoff / _match_pending_handoffs / _match_dormant_identities — backend/main_detect/src/techgar/cross_camera_manager.py",
      why: "Chấm điểm nhiều tiêu chí + đòi chênh lệch rõ với đối thủ + đếm bằng chứng liên tiếp để không nhận nhầm khi hai xe qua cùng lúc (dẫn chứng source). 'Ngoại hình' chỉ là histogram màu — source ép use_deep_reid=False, không có deep ReID."
    },
    refs: [
      { path: SRC + "src/techgar/cross_camera_manager.py", line: 2572, symbol: "_upsert_handoff", excerptStart: 2572, excerpt: "    def _upsert_handoff(\n        self,\n        cam_id: str,\n        local_track_id: int,\n        track,\n        frame_idx: int,\n        all_tracks: Dict[str, dict],\n        timestamp_s: Optional[float] = None,\n    ) -> None:\n        global_id = self._local_to_global.get((cam_id, local_track_id))\n        if global_id is None:\n            return" },
      { path: SRC + "src/techgar/cross_camera_manager.py", line: 2831, symbol: "_candidate_cost", excerptStart: 2831, excerpt: "    def _candidate_cost(\n        self, entry: HandoffEntry, cam_id: str, track, frame_idx: int,\n        timestamp_s: Optional[float] = None,\n    ) -> Tuple[Optional[float], str, dict]:\n        \"\"\"Return a conservative handoff cost, otherwise its rejection reason.\"\"\"" },
      { path: SRC + "src/techgar/cross_camera_manager.py", line: 3615, symbol: "_match_pending_handoffs (lapjv)", excerptStart: 3613, excerpt: "                costs[row, col] = cost\n                details_by_pair[(row, col)] = details\n        _, row_to_col, _ = lapjv(costs, extend_cost=True, cost_limit=0.92)" },
      { path: SRC + "src/techgar/cross_camera_manager.py", line: 391, symbol: "use_deep_reid=False", excerptStart: 391, excerpt: "        if use_deep_reid:\n            raise ValueError(\n                \"DeepReID is not available in the motion backend: provide a \"\n                \"trained model and a vehicle-crop feature pipeline first\"\n            )\n        self.use_deep_reid = False\n        self.deep_reid_extractor = None" },
      { path: SRC + "src/techgar/cross_camera_manager.py", line: 4911, symbol: "_match_dormant_identities", excerptStart: 4911, excerpt: "    def _match_dormant_identities(\n        self,\n        all_tracks: Dict[str, dict],\n        frame_idx: int,\n        camera_timestamps_s: Optional[Dict[str, float]],\n    ) -> set[Tuple[str, int]]:\n        \"\"\"Recover mature fragments, deferring plausible one-frame matches." },
      { path: SRC + "two_camera.py", line: 2779, symbol: "update_all_tracks callsite", excerptStart: 2779, excerpt: "            global_ids = manager.update_all_tracks(\n                observable, frame_index,\n                camera_timestamps_s=camera_timestamps_s,\n                protected_local_keys=protected_local_keys,\n                protected_global_ids=pending_arrival_global_ids,\n            )" }
    ],
    pseudocode: HANDOFF_PSEUDO,
    scenarios: [
      { id: "handoff-qua-vung-chuyen", label: "Bình thường: qua vùng chuyển giữa hai cam", build: handoffScenes },
      { id: "reid-dormant-cuu", label: "Nhánh khó: rớt frame — nhận lại mã số cũ", build: reidScenes }
    ],
    draw: drawHandoff
  };

  var visionNode = {
    id: "slot-vision",
    title: "Nhìn ô trống hay có xe",
    group: "identity",
    summary: "Xe đã dừng thì mắt chuyển động không thấy gì — một công đoạn riêng đếm pixel trong ô để nói trống hay có xe.",
    answers: {
      does: "Mỗi ô được tách thành 25 phiên bản sáng khác nhau; bản nào thấy ô gần như nền thì góp một phiếu TRỐNG. Đủ 12 trên 25 phiếu mới tạm kết luận trống — hai trạm kiểm (vật đặc ở lõi, đường viền) rồi bộ làm mượt có thể lật lại thành có xe.",
      role: "Trước: ảnh gốc, chạy luồng riêng ~2fps ngoài vòng tracking. Sau: kết quả là bằng chứng cho binder quyết chủ ô. Mất nó: xe dừng xong 'bốc hơi' — không ai chứng minh ô đang đậu.",
      where: "ParkingDetector.detect / accept_evidence — backend/main_detect/src/techgar/parking_detector.py; worker two_camera.py:process_parking_frame",
      why: "Chỉ đếm phiếu TRỐNG (empty_votes ≥ 25//2 = 12), không đếm phiếu 'có xe' — có xe là phần bù còn lại (dẫn chứng pd:533-566). Thiết kế nghiêng về khó sót xe hơn khó báo nhầm ô trống [suy luận]."
    },
    refs: [
      { path: SRC + "src/techgar/parking_detector.py", line: 454, symbol: "25 biến thể", excerptStart: 454, excerpt: "        delta_gamma = [-0.2, -0.1, 0.0, 0.1, 0.2]\n        delta_clahe = [-0.5, -0.2, 0.0, 0.2, 0.5]\n        total_combinations = len(delta_clahe) * len(delta_gamma)" },
      { path: SRC + "src/techgar/parking_detector.py", line: 533, symbol: "required_votes", excerptStart: 532, excerpt: "        # ── Pass 1: Threshold + Center Cluster ──\n        required_votes = total_combinations // 2\n        is_free_list = [True] * len(self._rois)\n\n        for i, roi in enumerate(self._rois):\n            if roi is None:\n                continue\n            is_free = empty_votes[i] >= required_votes" },
      { path: SRC + "src/techgar/parking_detector.py", line: 542, symbol: "core-rescue", excerptStart: 541, excerpt: "            evidence = base_evidence[i]\n            if (\n                is_free\n                and evidence is not None\n                and self._has_core_rescue(evidence)\n            ):\n                is_free = False" },
      { path: SRC + "src/techgar/parking_detector.py", line: 602, symbol: "accept_evidence (monotonic)", excerptStart: 602, excerpt: "    def accept_evidence(self, results: List[SlotResult], timestamp_s: float,\n                        frame_idx: int) -> bool:\n        \"\"\"Commit fresh worker evidence exactly once, on the coordinator thread.\n\n        Rejected/late worker jobs never alter this state. Source time, not\n        display FPS or polling count, determines dwell and release duration.\n        \"\"\"" },
      { path: SRC + "two_camera.py", line: 1591, symbol: "process_parking_frame", excerptStart: 1591, excerpt: "def process_parking_frame(\n    detector: ParkingDetector,\n    frame: np.ndarray,\n    include_debug: bool,\n) -> tuple[list, tuple[np.ndarray, np.ndarray] | None, float]:\n    \"\"\"Run slow parking work outside the live display loop.\"\"\"\n    results = detector.detect(frame, apply_smoothing=not detector.stable_evidence)" }
    ],
    pseudocode: VISION_PSEUDO,
    scenarios: [
      { id: "xe-dung-trong-o", label: "Bình thường: xe dừng trong ô", build: visionScenes },
      { id: "xe-toi-rescue-lat", label: "Nhánh khó: xe tối màu — phiếu trống bị lật lại", build: visionEdgeScenes }
    ],
    draw: drawVision
  };

  var binderNode = {
    id: "binder",
    title: "Gắn đúng xe với đúng ô",
    group: "identity",
    summary: "Hai nguồn bằng chứng — vết xe và pixel ô — cùng đồng ý mới kết luận 'xe nào đậu ô nào'; kết luận đó ghi thành episode mà cả hệ thống tin theo.",
    answers: {
      does: "Mỗi frame, ghép vết xe với ô theo độ chồng lấn. Xe dừng thì vết 'chết' — bằng chứng từ lúc còn thấy tích thành đơn xin ô; khi pixel cũng xác nhận đủ lần thì chốt và mở episode. Đường hai: xe lê bánh chậm, vết còn sống mà chồng lấn cao bền → chốt thẳng. Xe rời ô: cấp thẻ chờ giữ mã số một lúc để nhận lại đúng xe.",
      role: "Trước: mã số chung từ node trước + kết quả trống/đậu. Sau: episode là kết luận cuối cùng mà phiên và API tin theo. Mất nó: có vết xe, có ảnh ô, nhưng không biết ô nào của xe nào.",
      where: "SlotVehicleBinder.update_tracks/_record_arrival_claim/_try_commit_arrival_claim/_bind_vehicle — backend/main_detect/src/techgar/slot_vehicle_binder.py; token → manager.bind_external_id",
      why: "Bản chạy thật vision_primary (two_camera:2328) ưu tiên bằng chứng pixel: quan sát mất dấu không còn 'tươi' nên không được đếm giờ đỗ — tránh episode ảo. Thẻ rời ô yêu cầu đúng cam + đúng ô nên xe khác không cướp được mã số (raise tại ccm:713)."
    },
    refs: [
      { path: SRC + "src/techgar/slot_vehicle_binder.py", line: 1285, symbol: "_batch_match (lapjv)", excerptStart: 1285, excerpt: "    def _batch_match(self, active_tracks: Dict[int, object]) -> Dict[int, Tuple[str, dict]]:\n        track_ids = sorted(int(global_id) for global_id in active_tracks)\n        bindings = [binding for binding in self._bindings.values() if binding.polygon is not None]\n        if not track_ids or not bindings:\n            return {}\n\n        invalid_cost = 10.0\n        costs = np.full((len(track_ids), len(bindings)), invalid_cost, dtype=np.float64)" },
      { path: SRC + "src/techgar/slot_vehicle_binder.py", line: 1167, symbol: "_try_commit_arrival_claim", excerptStart: 1167, excerpt: "    def _try_commit_arrival_claim(\n        self,\n        slot_id: str,\n        frame_idx: int,\n        timestamp_s: float,\n    ) -> Optional[int]:\n        if self._defer_arrival_commits:\n            return None\n        binding = self._bindings.get(slot_id)\n        if (\n            binding is None\n            or not binding.vision_occupied\n            or binding.vision_occupied_streak < self.arrival_vision_confirmations\n            or binding.vehicle_id is not None" },
      { path: SRC + "src/techgar/slot_vehicle_binder.py", line: 888, symbol: "_open_parking_episode", excerptStart: 888, excerpt: "    def _open_parking_episode(\n        self,\n        global_id: int,\n        slot_id: str,\n        frame_idx: int,\n        reason: str,\n    ) -> dict:\n        binding = self._bindings.get(slot_id)\n        current = self._episode_by_slot.get(slot_id)" },
      { path: SRC + "src/techgar/slot_vehicle_binder.py", line: 1449, symbol: "_create_departure_token", excerptStart: 1449, excerpt: "    def _create_departure_token(\n        self,\n        binding: SlotBinding,\n        global_id: int,\n        timestamp_s: float,\n        *,\n        reason: str,\n        confirmed_empty: bool,\n        predeparture: bool = False,\n    ) -> DepartureToken:\n        \"\"\"Create or advance a token without ever discarding its GID on noise.\"\"\"" },
      { path: SRC + "src/techgar/cross_camera_manager.py", line: 690, symbol: "bind_external_id", excerptStart: 690, excerpt: "    def bind_external_id(\n        self,\n        cam_id: str,\n        local_track_id: int,\n        global_id: int,\n        frame_idx: int,\n        source: str = \"external\",\n        *,\n        source_slot_id: Optional[str] = None,\n        source_camera_id: Optional[str] = None,\n    ) -> int:\n        \"\"\"Bind a verified global identity before normal ID allocation." },
      { path: SRC + "two_camera.py", line: 2328, symbol: "policy vision_primary", excerptStart: 2327, excerpt: "            camera_id: SlotVehicleBinder(\n                policy=\"vision_primary\",\n                recovery_retention_seconds=args.slot_recovery_seconds," },
      { path: SRC + "two_camera.py", line: 2764, symbol: "recover trước update_all_tracks", excerptStart: 2764, excerpt: "            protected_local_keys, recovery_diagnostics = recover_departing_vehicle_ids(\n                observable,\n                manager,\n                binders,\n                transforms,\n                frame_index,\n                camera_timestamps_s,\n                args.slot_recovery_max_expand_ratio,\n                shared_map_anchor=shared_map_anchor,\n            )" }
    ],
    pseudocode: BINDER_PSEUDO,
    scenarios: [
      { id: "dung-do-token", label: "Bình thường: dừng → đơn xin ô → đỗ → nhận lại mã số", build: binderScenes },
      { id: "strong-overlap", label: "Nhánh: xe lê bánh — chốt thẳng qua chồng lấn", build: binderEdgeScenes }
    ],
    draw: drawBinder
  };

  P.identity = [handoffNode, visionNode, binderNode];
})();
