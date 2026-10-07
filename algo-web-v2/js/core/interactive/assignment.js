/* interactive/assignment.js — ma trận chi phí 4×4 theo seed, gán tối ưu vs tham lam.
 * Mô phỏng LAPJV: cell > cost_limit khóa như cost 10.0 thật
 *   (motion_tracker.py: cost_limit=0.90, ô không khả thi đặt 10.0).
 * Tối ưu = duyệt 4! hoán vị (tương đương Hungarian ở kích thước này).
 * Ngẫu nhiên chỉ qua TG.rng(seed) — cùng seed cho cùng ma trận.
 */
(function () {
  "use strict";
  var TG = (window.TG = window.TG || {});
  TG.interactive = TG.interactive || {};

  var N = 4, COST_LIMIT = 0.90, LOCKED = 10.0;

  function genMatrix(seed) {
    /* trả về ma trận có ít nhất một gán hợp lệ; thử seed+1,+2... nếu bất khả thi */
    for (var s = seed; s < seed + 40; s++) {
      var rnd = TG.rng(s), M = [], i, j;
      for (i = 0; i < N; i++) {
        M.push([]);
        for (j = 0; j < N; j++) {
          M[i][j] = rnd() < 0.12 ? LOCKED : Math.round((0.05 + rnd() * 0.8) * 100) / 100;
        }
      }
      if (optimal(M)) return { m: M, seed: s };
    }
    return null;
  }
  function perms(k, prefix, used, out) {
    if (prefix.length === k) { out.push(prefix.slice()); return; }
    for (var i = 0; i < k; i++) {
      if (used[i]) continue;
      used[i] = 1; prefix.push(i);
      perms(k, prefix, used, out);
      prefix.pop(); used[i] = 0;
    }
    return out;
  }
  var PERMS = perms(N, [], {}, []);
  function costOf(M, p) {
    var s = 0;
    for (var i = 0; i < N; i++) {
      if (M[i][p[i]] >= COST_LIMIT) return Infinity; /* lapjv từ chối cặp quá đắt */
      s += M[i][p[i]];
    }
    return s;
  }
  function optimal(M) {
    var best = null, bc = Infinity;
    PERMS.forEach(function (p) {
      var c = costOf(M, p);
      if (c < bc) { bc = c; best = p; }
    });
    return best ? { perm: best, cost: bc } : null;
  }
  function greedy(M) {
    var cells = [], i, j;
    for (i = 0; i < N; i++) for (j = 0; j < N; j++) cells.push([M[i][j], i, j]);
    cells.sort(function (a, b) { return a[0] - b[0]; });
    var usedR = {}, usedC = {}, p = new Array(N).fill(-1), c = 0;
    cells.forEach(function (t) {
      if (t[0] >= COST_LIMIT) return;
      if (usedR[t[1]] || usedC[t[2]]) return;
      usedR[t[1]] = usedC[t[2]] = 1; p[t[1]] = t[2]; c += t[0];
    });
    return p.indexOf(-1) < 0 ? { perm: p, cost: c } : null;
  }

  TG.interactive.assignment = {
    mount: function (container, ctx) {
      var seed = (ctx && typeof ctx.seed === "number") ? ctx.seed : 7;
      var wrap = TG.el("div", "itv assign-itv");
      var grid = TG.el("div", "itv-assign-grid");
      var readout = TG.el("div", "itv-readout");
      var bar = TG.el("div", "itv-actions");
      var btn = TG.el("button", "itv-btn", "Ma trận mới (seed kế)");
      btn.type = "button";
      bar.appendChild(btn);
      var note = TG.el("div", "itv-note",
        "Ô ≥0.90 bị khóa như cost 10.0 thật (lapjv từ chối cặp quá đắt). Xanh = phương án tối ưu toàn cục, " +
        "viền cam = chỗ tham lam chọn khác. Cùng seed luôn cho cùng ma trận (minh họa).");
      wrap.appendChild(grid); wrap.appendChild(readout); wrap.appendChild(bar); wrap.appendChild(note);
      container.appendChild(wrap);

      function render() {
        var g = genMatrix(seed);
        if (!g) { readout.textContent = "Không sinh được ma trận khả thi."; return; }
        seed = g.seed;
        var M = g.m, opt = optimal(M), gr = greedy(M);
        grid.innerHTML = "";
        var tbl = TG.el("table", "tbl itv-cost");
        var head = "<thead><tr><th>track \\ det</th>" +
          M[0].map(function (_, j) { return "<th>D" + (j + 1) + "</th>"; }).join("") + "</tr></thead>";
        var body = M.map(function (row, i) {
          var tds = row.map(function (v, j) {
            var locked = v >= COST_LIMIT;
            var cls = locked ? "itv-cell-lock" : "";
            if (opt && opt.perm[i] === j) cls += " itv-cell-opt";
            if (gr && gr.perm[i] === j && (!opt || opt.perm[i] !== j)) cls += " itv-cell-gr";
            return '<td class="' + cls + '">' + (locked ? "10.0" : v.toFixed(2)) + "</td>";
          }).join("");
          return "<tr><th>T" + (i + 1) + "</th>" + tds + "</tr>";
        }).join("");
        tbl.innerHTML = head + "<tbody>" + body + "</tbody>";
        grid.appendChild(tbl);

        var diff = gr && opt && gr.perm.join() !== opt.perm.join();
        var verdict = !gr ? " — tham lam bế tắc (không gán đủ hàng)" :
          (diff ? ' — tham lam <b>thua</b> ' + (gr.cost - opt.cost).toFixed(2) + " vì nhìn cục bộ" :
                  " — hai phương án trùng nhau");
        readout.innerHTML = "seed=" + g.seed + " · Tối ưu (duyệt 4! như LAPJV): <b>" +
          (opt ? opt.cost.toFixed(2) : "không khả thi") + "</b>" +
          " · Tham lam (ô rẻ nhất trước): <b>" + (gr ? gr.cost.toFixed(2) : "không khả thi") + "</b>" +
          verdict + " (minh họa).";
      }

      btn.addEventListener("click", function () { seed += 1; render(); });
      render();
      return { destroy: function () { if (wrap.parentNode) wrap.parentNode.removeChild(wrap); } };
    }
  };
})();
