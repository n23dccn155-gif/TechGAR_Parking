/* interactive/homography.js — chọn cặp điểm pixel↔cm, fit homography bằng DLT thuần JS.
 * Dữ liệu gốc:
 *  - pixel cam1: calibration_points.csv của cal-20260927-160513-decd3099
 *    (paired_ground_points.json — backend/main_detect/config/shared_map_01/attempts/...)
 *  - world A–D: tấm đo 20×30 cm đo thước (cùng CSV).
 *  - world V1–V4: vị trí suy ra khi chiếu pixel qua ma trận camera_transforms.cam1
 *    đang dùng (line_correction không có tọa độ đo thước riêng — đánh dấu trong UI).
 * Ngưỡng so sánh: fit gate max_error_cm = 2.0 (rectangle_line_calibration.py:112).
 * mount(container, {seed}) → { destroy() }. Deterministic — không dùng ngẫu nhiên.
 */
(function () {
  "use strict";
  var TG = (window.TG = window.TG || {});
  TG.interactive = TG.interactive || {};

  /* px cam1 → world cm (A–D đo thước; V* chiếu qua H thật) */
  var PAIRS = [
    { id: "A",  px: [1010, 217], cm: [0.0, 0.0],    anchor: true },
    { id: "B",  px: [974, 68],   cm: [20.0, 0.0],   anchor: true },
    { id: "C",  px: [688, 68],   cm: [20.0, 30.0],  anchor: true },
    { id: "D",  px: [690, 217],  cm: [0.0, 30.0],   anchor: true },
    { id: "V1", px: [386, 178],  cm: [4.46, 60.34], anchor: false },
    { id: "V2", px: [512, 176],  cm: [4.81, 47.65], anchor: false },
    { id: "V3", px: [668, 174],  cm: [5.17, 32.13], anchor: false },
    { id: "V4", px: [876, 176],  cm: [5.04, 11.84], anchor: false }
  ];
  var GATE_CM = 2.0;           /* fit gate max_error_cm — rectangle_line_calibration.py:112 */
  var IMG_W = 1280, IMG_H = 720;
  /* khung map: phủ mọi điểm, margin 6cm */
  var MAP = { x0: -6, y0: -6, x1: 26, y1: 66 };

  /* ---------- DLT với chuẩn hoá Hartley ---------- */
  function normalize(pts) {
    var mx = 0, my = 0, i;
    for (i = 0; i < pts.length; i++) { mx += pts[i][0]; my += pts[i][1]; }
    mx /= pts.length; my /= pts.length;
    var d = 0;
    for (i = 0; i < pts.length; i++) d += Math.hypot(pts[i][0] - mx, pts[i][1] - my);
    var s = d > 0 ? (Math.SQRT2 * pts.length) / d : 1;
    return { s: s, tx: mx, ty: my };
  }
  function tMat(n) {
    return [[n.s, 0, -n.s * n.tx], [0, n.s, -n.s * n.ty], [0, 0, 1]];
  }
  function solve8(A, b) {           /* khử Gauss pivot phần, 8×8 */
    var n = 8, M = A.map(function (r, i) { return r.concat([b[i]]); });
    for (var c = 0; c < n; c++) {
      var piv = c;
      for (var r = c + 1; r < n; r++) if (Math.abs(M[r][c]) > Math.abs(M[piv][c])) piv = r;
      var t = M[c]; M[c] = M[piv]; M[piv] = t;
      if (Math.abs(M[c][c]) < 1e-12) return null;
      for (r = 0; r < n; r++) {
        if (r === c) continue;
        var f = M[r][c] / M[c][c];
        for (var k = c; k <= n; k++) M[r][k] -= f * M[c][k];
      }
    }
    return M.map(function (r, i) { return r[n] / r[i]; });
  }
  function dlt(pairs) {             /* pairs: [{px:[x,y],cm:[X,Y]}] ≥4 → H 3×3 | null */
    if (pairs.length < 4) return null;
    var src = pairs.map(function (p) { return p.px; });
    var dst = pairs.map(function (p) { return p.cm; });
    var ns = normalize(src), nd = normalize(dst);
    var rows = [], rhs = [];
    pairs.forEach(function (p) {
      var x = (p.px[0] - ns.tx) * ns.s, y = (p.px[1] - ns.ty) * ns.s;
      var X = (p.cm[0] - nd.tx) * nd.s, Y = (p.cm[1] - nd.ty) * nd.s;
      rows.push([x, y, 1, 0, 0, 0, -x * X, -y * X]); rhs.push(X);
      rows.push([0, 0, 0, x, y, 1, -x * Y, -y * Y]); rhs.push(Y);
    });
    /* bình phương tối thiểu: A^T A h = A^T b */
    var AtA = [], Atb = [], i, j, k;
    for (i = 0; i < 8; i++) { AtA.push(new Array(8).fill(0)); Atb.push(0); }
    rows.forEach(function (r, ri) {
      for (i = 0; i < 8; i++) {
        Atb[i] += r[i] * rhs[ri];
        for (j = 0; j < 8; j++) AtA[i][j] += r[i] * r[j];
      }
    });
    var hn = solve8(AtA, Atb);
    if (!hn) return null;
    var Hn = [[hn[0], hn[1], hn[2]], [hn[3], hn[4], hn[5]], [hn[6], hn[7], 1]];
    /* khử chuẩn hoá: H = inv(T_dst) · Hn · T_src */
    var Ts = tMat(ns), Td = tMat(nd);
    var TdInv = [[1 / nd.s, 0, nd.tx], [0, 1 / nd.s, nd.ty], [0, 0, 1]];
    function mul(A, B) {
      var C = [];
      for (i = 0; i < 3; i++) { C.push([0, 0, 0]);
        for (j = 0; j < 3; j++) for (k = 0; k < 3; k++) C[i][j] += A[i][k] * B[k][j]; }
      return C;
    }
    var H = mul(TdInv, mul(Hn, Ts));
    var w = H[2][2];
    for (i = 0; i < 3; i++) for (j = 0; j < 3; j++) H[i][j] /= w;
    return H;
  }
  function project(H, px) {
    var w = H[2][0] * px[0] + H[2][1] * px[1] + H[2][2];
    return [(H[0][0] * px[0] + H[0][1] * px[1] + H[0][2]) / w,
            (H[1][0] * px[0] + H[1][1] * px[1] + H[1][2]) / w];
  }

  TG.interactive.homography = {
    mount: function (container, ctx) {
      var NS = "http://www.w3.org/2000/svg";
      function s(tag, attrs) {
        var e = document.createElementNS(NS, tag);
        for (var k in attrs) e.setAttribute(k, attrs[k]);
        return e;
      }
      var selected = PAIRS.map(function () { return true; });
      var MAP_W = 320, MAP_H = 720; /* map svg cùng tỉ lệ khung cam */

      function toMap(p) {
        return [(p[0] - MAP.x0) * (MAP_W / (MAP.x1 - MAP.x0)),
                (p[1] - MAP.y0) * (MAP_H / (MAP.y1 - MAP.y0))];
      }

      var wrap = TG.el("div", "itv homo-itv");
      var panes = TG.el("div", "itv-panes");

      /* pane trái: camera */
      var camBox = TG.el("div", "itv-pane");
      camBox.appendChild(TG.el("div", "itv-pane-title", "Khung camera (px, 1280×720)"));
      var camSvg = s("svg", { viewBox: "0 0 " + IMG_W + " " + IMG_H, "class": "itv-canvas" });
      camSvg.appendChild(s("rect", { x: 0, y: 0, width: IMG_W, height: IMG_H, fill: "#3a424d" }));
      for (var i = 0; i < 5; i++) {
        var y = 150 + i * 110;
        camSvg.appendChild(s("line", { x1: 60, y1: y, x2: 1220, y2: y, stroke: "#e8ecf1", "stroke-width": 4, "stroke-dasharray": "34 30", opacity: 0.5 }));
      }
      camBox.appendChild(camSvg);

      /* pane phải: map cm */
      var mapBox = TG.el("div", "itv-pane");
      mapBox.appendChild(TG.el("div", "itv-pane-title", "Mặt bằng thế giới (cm)"));
      var mapSvg = s("svg", { viewBox: "0 0 " + MAP_W + " " + MAP_H, "class": "itv-canvas" });
      mapSvg.appendChild(s("rect", { x: 0, y: 0, width: MAP_W, height: MAP_H, fill: "#f2f4f7" }));
      /* tấm đo A–D 20×30 */
      var cA = toMap(PAIRS[0].cm), cC = toMap(PAIRS[2].cm);
      mapSvg.appendChild(s("rect", {
        x: Math.min(cA[0], cC[0]), y: Math.min(cA[1], cC[1]),
        width: Math.abs(cC[0] - cA[0]), height: Math.abs(cC[1] - cA[1]),
        fill: "none", stroke: "#98a2b3", "stroke-width": 2, "stroke-dasharray": "6 5"
      }));
      /* vạch làn chứa V1–V4 (world x≈5) */
      var l1 = toMap([5, MAP.y0]), l2 = toMap([5, MAP.y1]);
      mapSvg.appendChild(s("line", { x1: l1[0], y1: 0, x2: l2[0], y2: MAP_H, stroke: "#c2cad6", "stroke-width": 2, "stroke-dasharray": "8 6" }));
      var projLayer = s("g", {});
      mapSvg.appendChild(projLayer);
      mapBox.appendChild(mapSvg);

      panes.appendChild(camBox); panes.appendChild(mapBox);
      wrap.appendChild(panes);

      var readout = TG.el("div", "itv-readout");
      var tableWrap = TG.el("div", "itv-err-tbl");
      var bar = TG.el("div", "itv-actions");
      var btnAll = TG.el("button", "itv-btn", "Chọn cả 8 cặp");
      var btnDrop = TG.el("button", "itv-btn", "Bỏ điểm vạch làn (chỉ A–D)");
      btnAll.type = btnDrop.type = "button";
      bar.appendChild(btnAll); bar.appendChild(btnDrop);
      var note = TG.el("div", "itv-note",
        "Click điểm ở một trong hai khung để bật/tắt cặp. A–D là điểm đo thước 20×30 cm. " +
        "V1–V4 là điểm vạch làn — vị trí cm lấy theo calibration đang dùng, nên sai số của chúng là (minh họa).");
      wrap.appendChild(readout); wrap.appendChild(tableWrap); wrap.appendChild(bar); wrap.appendChild(note);
      container.appendChild(wrap);

      /* markers hai pane — click toggle cặp */
      var camMarks = [], mapMarks = [];
      PAIRS.forEach(function (p, idx) {
        [camSvg, mapSvg].forEach(function (svgEl, side) {
          var at = side === 0 ? p.px : toMap(p.cm);
          var g = s("g", { "class": "itv-mark", "data-pt": p.id, cursor: "pointer" });
          g.appendChild(s("circle", { cx: at[0], cy: at[1], r: side === 0 ? 26 : 18, fill: "rgba(0,0,0,0)", "pointer-events": "all" }));
          g.appendChild(s("circle", { cx: at[0], cy: at[1], r: side === 0 ? 11 : 7, "class": "itv-dot" }));
          var lbl = s("text", { x: at[0] + (side === 0 ? 16 : 10), y: at[1] - (side === 0 ? 14 : 8),
            "class": "itv-lbl", fill: side === 0 ? "#e8ecf1" : "#344054" });
          lbl.textContent = p.id;
          g.appendChild(lbl);
          g.addEventListener("pointerdown", function (ev) { ev.preventDefault(); toggle(idx); });
          svgEl.appendChild(g);
          (side === 0 ? camMarks : mapMarks).push(g);
        });
      });

      function toggle(idx) {
        selected[idx] = !selected[idx];
        redraw();
      }
      function errCm(H, p) {
        var q = project(H, p.px);
        return Math.hypot(q[0] - p.cm[0], q[1] - p.cm[1]);
      }
      function p95(vals) {
        var v = vals.slice().sort(function (a, b) { return a - b; });
        return v[Math.min(v.length - 1, Math.floor(0.95 * (v.length - 1)))];
      }

      function redraw() {
        var sel = PAIRS.filter(function (p, i) { return selected[i]; });
        PAIRS.forEach(function (p, idx) {
          var on = selected[idx];
          [camMarks[idx], mapMarks[idx]].forEach(function (g) {
            g.classList.toggle("off", !on);
            g.querySelector(".itv-dot").setAttribute("fill",
              on ? (p.anchor ? "#ffd23f" : "#33a3ff") : "#8a939f");
          });
        });
        while (projLayer.firstChild) projLayer.removeChild(projLayer.firstChild);

        if (sel.length < 4) {
          readout.textContent = "Đã chọn " + sel.length + "/8 cặp — cần ít nhất 4 cặp để fit.";
          tableWrap.innerHTML = "";
          return;
        }
        var H = dlt(sel);
        if (!H) { readout.textContent = "Hệ suy biến — không giải được."; return; }

        var selErr = [], allErr = [], valErr = [];
        PAIRS.forEach(function (p, idx) {
          var e = errCm(H, p);
          allErr.push(e);
          if (selected[idx]) selErr.push(e); else valErr.push(e);
          /* vẽ điểm chiếu lên map */
          var q = toMap(project(H, p.px));
          var c = s("circle", { cx: q[0], cy: q[1], r: 4, fill: selected[idx] ? "#d92d20" : "#f79009", stroke: "#fff", "stroke-width": 1 });
          projLayer.appendChild(c);
          var m = toMap(p.cm);
          projLayer.appendChild(s("line", { x1: m[0], y1: m[1], x2: q[0], y2: q[1], stroke: "#d92d20", "stroke-width": 1.5, opacity: 0.7 }));
        });
        var maxSel = Math.max.apply(null, selErr);
        var maxAll = Math.max.apply(null, allErr);
        var gate = maxAll <= GATE_CM ? "ĐẠT gate (≤ 2.0 cm)" : "KHÔNG đạt gate (> 2.0 cm)";
        readout.innerHTML = "Đã fit " + sel.length + " cặp bằng DLT. Sai số reprojection trên điểm đã chọn: max <b>" +
          maxSel.toFixed(3) + " cm</b>, p95 <b>" + p95(selErr).toFixed(3) + " cm</b>. " +
          (valErr.length ? "Điểm không dùng (kiểm chứng, minh họa): max <b>" + Math.max.apply(null, valErr).toFixed(3) + " cm</b>. " : "") +
          "Toàn bộ 8 điểm: max <b>" + maxAll.toFixed(3) + " cm</b> — " + gate + ".";

        var rows = PAIRS.map(function (p, idx) {
          return "<tr><td>" + p.id + "</td><td>" + (p.anchor ? "đo thước" : "vạch làn") +
            "</td><td>" + (selected[idx] ? "trong fit" : "kiểm chứng") + "</td><td>" +
            errCm(H, p).toFixed(3) + " cm</td></tr>";
        }).join("");
        tableWrap.innerHTML = '<table class="tbl"><thead><tr><th>Điểm</th><th>Loại</th><th>Vai trò</th><th>Sai số</th></tr></thead><tbody>' + rows + "</tbody></table>";
      }

      btnAll.addEventListener("click", function () {
        selected = PAIRS.map(function () { return true; }); redraw();
      });
      btnDrop.addEventListener("click", function () {
        selected = PAIRS.map(function (p) { return p.anchor; }); redraw();
      });

      redraw();
      return { destroy: function () { if (wrap.parentNode) wrap.parentNode.removeChild(wrap); } };
    }
  };
})();
