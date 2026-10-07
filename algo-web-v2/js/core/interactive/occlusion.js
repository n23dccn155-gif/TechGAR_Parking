/* interactive/occlusion.js — slider khoảng cách hai xe → trạng thái OcclusionGuard.
 * Ngưỡng thật từ backend/main_detect/src/techgar/occlusion_guard.py:
 *  - pair: inter/min(area) ≤ 0.20  (L85), gap ≤ 0.4·max(hypot(ref))  (L88)
 *  - covering: chứa mọi center ±pad 0.15·min(ref) và area ≥ 1.6·median  (L109-112)
 *  - watershed: seed ≤ 0.25·hypot (L167), hai seed ≥ 0.2·min(ref) (L170), vùng ≥20pts (L181)
 *  - rớt group: khoảng cách member > 3·max(hypot) (L99)
 * Mô hình 1 chiều: hai xe bằng nhau W×H trên cùng làn; khi hai box chạm nhau
 * detector thấy một contour — hộp bao = hợp hai box. Không dùng ngẫu nhiên.
 */
(function () {
  "use strict";
  var TG = (window.TG = window.TG || {});
  TG.interactive = TG.interactive || {};

  var CAR_W = 80, CAR_H = 44;          /* kích thước xe mô hình (px) */
  var HYP = Math.hypot(CAR_W, CAR_H);  /* hypot(reference) */
  var GAP_MAX = 0.4 * HYP;             /* ngưỡng gap cho pair ứng viên */
  var DROP_D = 3 * HYP;                /* rớt group khi member xa hơn */
  var LANE_Y = 60, CX = 320;           /* tâm làn + tâm canvas */
  var D_MAX = 2.6 * CAR_W;

  TG.interactive.occlusion = {
    mount: function (container, ctx) {
      var NS = "http://www.w3.org/2000/svg";
      function s(tag, attrs) {
        var e = document.createElementNS(NS, tag);
        for (var k in attrs) e.setAttribute(k, attrs[k]);
        return e;
      }

      var d = 1.5 * CAR_W; /* trạng thái đầu: hai xe tách, ngoài vùng pair */

      var wrap = TG.el("div", "itv occ-itv");
      var svg = s("svg", { viewBox: "0 0 640 160", "class": "itv-canvas" });
      svg.appendChild(s("rect", { x: 0, y: 0, width: 640, height: 160, fill: "#3a424d" }));
      svg.appendChild(s("line", { x1: 10, y1: LANE_Y, x2: 630, y2: LANE_Y, stroke: "#e8ecf1", "stroke-width": 3, "stroke-dasharray": "26 22", opacity: 0.5 }));

      var cover = s("rect", { fill: "none", stroke: "#f79009", "stroke-width": 3, "stroke-dasharray": "8 5" });
      var carA = s("rect", { width: CAR_W, height: CAR_H, fill: "#0b57d0", stroke: "#dfe5ee", "stroke-width": 2 });
      var carB = s("rect", { width: CAR_W, height: CAR_H, fill: "#d92d20", stroke: "#dfe5ee", "stroke-width": 2 });
      var cAt = s("text", { "class": "itv-lbl", fill: "#ffd23f" }); cAt.textContent = "track A";
      var cBt = s("text", { "class": "itv-lbl", fill: "#ffd23f" }); cBt.textContent = "track B";
      svg.appendChild(cover); svg.appendChild(carA); svg.appendChild(carB);
      svg.appendChild(cAt); svg.appendChild(cBt);
      wrap.appendChild(svg);

      var sliderBox = TG.el("div", "itv-slider-box");
      var lbl = TG.el("label", "itv-slider-lbl", "Khoảng cách tâm hai xe");
      var slider = document.createElement("input");
      slider.type = "range"; slider.min = "0"; slider.max = String(Math.round(D_MAX));
      slider.step = "1"; slider.value = String(Math.round(d));
      slider.setAttribute("class", "itv-slider");
      sliderBox.appendChild(lbl); sliderBox.appendChild(slider);
      wrap.appendChild(sliderBox);

      var state = TG.el("div", "itv-state");
      var readout = TG.el("div", "itv-readout");
      var note = TG.el("div", "itv-note",
        "Ngưỡng thật từ occlusion_guard.py: pair cần chồng ≤20% diện tích nhỏ và gap ≤0.4·hypot; " +
        "guard chỉ mở khi một contour ôm cả hai tâm với diện tích ≥1.6× median; watershed chia khi hai seed cách ≥0.2·cạnh nhỏ nhất.");
      wrap.appendChild(state); wrap.appendChild(readout); wrap.appendChild(note);
      container.appendChild(wrap);

      function render() {
        var ax = CX - d / 2 - CAR_W / 2, bx = CX + d / 2 - CAR_W / 2;
        carA.setAttribute("x", ax); carA.setAttribute("y", LANE_Y - CAR_H / 2);
        carB.setAttribute("x", bx); carB.setAttribute("y", LANE_Y - CAR_H / 2);
        cAt.setAttribute("x", ax + 6); cAt.setAttribute("y", LANE_Y - CAR_H / 2 - 8);
        cBt.setAttribute("x", bx + 6); cBt.setAttribute("y", LANE_Y - CAR_H / 2 - 8);

        var inter = Math.max(0, Math.min(ax + CAR_W, bx + CAR_W) - Math.max(ax, bx)) * CAR_H;
        var minArea = CAR_W * CAR_H;
        var overlapPct = (inter / minArea) * 100;
        var gapPx = Math.max(0, d - CAR_W);         /* mép-mép theo trục ngang */
        var touching = gapPx <= 0;                /* một contour? */
        var coverArea = touching ? (d + CAR_W) * CAR_H : 0;
        var coverRatio = coverArea / minArea;
        var seedGapOK = d >= 0.2 * Math.min(CAR_W, CAR_H);

        var cls, txt;
        if (touching && coverRatio >= 1.6) {
          cls = "warn"; cover.style.display = "";
          cover.setAttribute("x", ax - 4); cover.setAttribute("y", LANE_Y - CAR_H / 2 - 12);
          cover.setAttribute("width", (d + CAR_W) + 8); cover.setAttribute("height", CAR_H + 24);
          txt = "GROUP MỞ — contour ôm cả hai xe (" + coverRatio.toFixed(2) + "× ≥ 1.6× median): " +
            "hai track đóng băng, watershed " + (seedGapOK ? "được phép chia" : "bị chặn vì seed quá gần");
        } else {
          cover.style.display = "none";
          if (touching) {
            cls = "bad";
            txt = "CHỒNG SÂU — blob chỉ " + coverRatio.toFixed(2) + "× xe < 1.6× median: " +
              "không chứng minh được hai đối tượng, guard không mở";
          } else if (gapPx <= GAP_MAX && overlapPct <= 20) {
            cls = "ok";
            txt = "PAIR ỨNG VIÊN — gap " + gapPx.toFixed(0) + "px ≤ " + GAP_MAX.toFixed(0) +
              "px (0.4·hypot): hai track sạch ghi nhận nhau, chờ contour ôm";
          } else if (d > DROP_D) {
            cls = "bad";
            txt = "QUÁ XA — khoảng cách " + d.toFixed(0) + "px > 3·hypot (" + DROP_D.toFixed(0) +
              "px): group bị hủy nếu từng tồn tại";
          } else {
            cls = "";
            txt = "ĐỘC LẬP — gap " + gapPx.toFixed(0) + "px > " + GAP_MAX.toFixed(0) +
              "px (0.4·hypot): hai track tách bình thường";
          }
        }
        state.className = "itv-state " + cls;
        state.textContent = txt;
        readout.textContent = "d = " + Math.round(d) + "px · chồng hộp " + overlapPct.toFixed(0) +
          "% (ngưỡng 20%) · gap mép " + gapPx.toFixed(0) + "/" + GAP_MAX.toFixed(0) +
          "px · contour bao " + (touching ? coverRatio.toFixed(2) + "× xe (cần ≥1.6×)" : "chưa hợp nhất");
      }

      slider.addEventListener("input", function () { d = Number(slider.value); render(); });
      render();
      return { destroy: function () { if (wrap.parentNode) wrap.parentNode.removeChild(wrap); } };
    }
  };
})();
