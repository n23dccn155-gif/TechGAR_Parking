/* interactive/roi.js — kéo đỉnh đa giác ROI trên khung 1280×720.
 * Dữ liệu gốc sao từ backend/main_detect/config/roi_mask_cam1.json (polygon 4 đỉnh,
 * thứ tự đỉnh giữ nguyên như file config: bl → br → tr → tl).
 * mount(container, {seed}) → { destroy() }. Không dùng ngẫu nhiên.
 */
(function () {
  "use strict";
  var TG = (window.TG = window.TG || {});
  TG.interactive = TG.interactive || {};

  var W = 1280, H = 720;
  /* nguồn: backend/main_detect/config/roi_mask_cam1.json — bản polygon hiện hành */
  var REAL_POLY = [[116, 687], [1273, 677], [1242, 139], [158, 143]];

  function area(poly) {
    var s = 0;
    for (var i = 0; i < poly.length; i++) {
      var a = poly[i], b = poly[(i + 1) % poly.length];
      s += a[0] * b[1] - b[0] * a[1];
    }
    return Math.abs(s) / 2;
  }

  TG.interactive.roi = {
    mount: function (container, ctx) {
      var poly = REAL_POLY.map(function (p) { return p.slice(); });
      var NS = "http://www.w3.org/2000/svg";
      function s(tag, attrs) {
        var e = document.createElementNS(NS, tag);
        for (var k in attrs) e.setAttribute(k, attrs[k]);
        return e;
      }

      var wrap = TG.el("div", "itv roi-itv");
      var svg = s("svg", { viewBox: "0 0 " + W + " " + H, "class": "itv-canvas", preserveAspectRatio: "xMidYMid meet" });
      /* nền sàn đậm + vạch làn gợi ý (minh họa phông nền camera) */
      svg.appendChild(s("rect", { x: 0, y: 0, width: W, height: H, fill: "#3a424d" }));
      for (var i = 0; i < 5; i++) {
        var y = 140 + i * 115;
        svg.appendChild(s("line", { x1: 60, y1: y, x2: 1220, y2: y, stroke: "#e8ecf1", "stroke-width": 4, "stroke-dasharray": "34 30", opacity: 0.55 }));
      }

      var shade = s("path", { fill: "rgba(9,12,16,0.62)", "fill-rule": "evenodd" });
      var outline = s("polygon", { fill: "none", stroke: "#0b57d0", "stroke-width": 3 });
      svg.appendChild(shade); svg.appendChild(outline);

      var handles = poly.map(function (p, idx) {
        var g = s("g", { "class": "itv-handle", "data-v": idx, cursor: "grab" });
        g.appendChild(s("circle", { cx: p[0], cy: p[1], r: 24, fill: "rgba(0,0,0,0)", "pointer-events": "all" }));
        g.appendChild(s("circle", { cx: p[0], cy: p[1], r: 10, fill: "#ffd23f", stroke: "#1c2128", "stroke-width": 2 }));
        svg.appendChild(g);
        return g;
      });

      var readout = TG.el("div", "itv-readout");
      var bar = TG.el("div", "itv-actions");
      var btnReset = TG.el("button", "itv-btn", "Về đa giác thật");
      btnReset.type = "button";
      bar.appendChild(btnReset);
      var note = TG.el("div", "itv-note",
        "Kéo đỉnh vàng. Vùng xám ngoài đa giác là phần bị mask bỏ qua. Đa giác mặc định sao nguyên roi_mask_cam1.json.");
      wrap.appendChild(svg); wrap.appendChild(readout); wrap.appendChild(bar); wrap.appendChild(note);
      container.appendChild(wrap);

      function redraw() {
        var pts = poly.map(function (p) { return p.join(","); }).join(" ");
        var hole = "M" + poly.map(function (p) { return p[0] + " " + p[1]; }).join("L") + "Z";
        shade.setAttribute("d", "M0 0H" + W + "V" + H + "H0Z " + hole);
        outline.setAttribute("points", pts);
        handles.forEach(function (g, idx) {
          var cs = g.querySelectorAll("circle");
          cs[0].setAttribute("cx", poly[idx][0]); cs[0].setAttribute("cy", poly[idx][1]);
          cs[1].setAttribute("cx", poly[idx][0]); cs[1].setAttribute("cy", poly[idx][1]);
        });
        var pct = (area(poly) / (W * H)) * 100;
        readout.textContent = "Diện tích ROI còn lại: " + pct.toFixed(1) + "% khung hình" +
          " (" + Math.round(area(poly)).toLocaleString("vi-VN") + " px² / 921.600 px²)";
      }

      /* kéo đỉnh — pointer events + capture, hit target 24px (≥16 theo spec) */
      var drag = -1;
      function svgPt(ev) {
        var r = svg.getBoundingClientRect();
        return [
          TG.clamp((ev.clientX - r.left) * (W / r.width), 0, W),
          TG.clamp((ev.clientY - r.top) * (H / r.height), 0, H)
        ];
      }
      var downs = handles.map(function (g, idx) {
        var fn = function (ev) { ev.preventDefault(); drag = idx; g.setPointerCapture && g.setPointerCapture(ev.pointerId); g.style.cursor = "grabbing"; };
        g.addEventListener("pointerdown", fn);
        return fn;
      });
      function onMove(ev) {
        if (drag < 0) return;
        var p = svgPt(ev);
        poly[drag][0] = Math.round(p[0]); poly[drag][1] = Math.round(p[1]);
        redraw();
      }
      function onUp(ev) {
        if (drag >= 0) { handles[drag].style.cursor = "grab"; drag = -1; }
      }
      svg.addEventListener("pointermove", onMove);
      svg.addEventListener("pointerup", onUp);
      svg.addEventListener("pointercancel", onUp);

      btnReset.addEventListener("click", function () {
        poly = REAL_POLY.map(function (p) { return p.slice(); });
        redraw();
      });

      redraw();
      return {
        destroy: function () {
          svg.removeEventListener("pointermove", onMove);
          svg.removeEventListener("pointerup", onUp);
          svg.removeEventListener("pointercancel", onUp);
          if (wrap.parentNode) wrap.parentNode.removeChild(wrap);
        }
      };
    }
  };
})();
