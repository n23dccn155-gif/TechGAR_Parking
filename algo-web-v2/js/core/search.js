/* search.js — chỉ mục tìm kiếm client-side trên page defs + terms.
 * Không fetch, không worker: index dựng lazy từ registry (đủ nhỏ cho 25 trang).
 * Dùng bởi route #/search?q=… và ô search trên topbar.
 */
(function () {
  "use strict";
  var TG = (window.TG = window.TG || {});

  function stripMarkup(s) { return String(s == null ? "" : s).replace(/\[\[|\]\]/g, ""); }
  function flat(x, acc) {
    if (x == null) return acc;
    if (typeof x === "string" || typeof x === "number") acc.push(String(x));
    else if (Array.isArray(x)) x.forEach(function (i) { flat(i, acc); });
    else if (typeof x === "object") {
      Object.keys(x).forEach(function (k) {
        if (k === "src" || k === "ref" || k === "origin") return; // nguồn tra riêng
        flat(x[k], acc);
      });
    }
    return acc;
  }
  function norm(s) {
    return String(s || "").toLowerCase()
      .normalize("NFD").replace(/[̀-ͯ]/g, "")
      .replace(/đ/g, "d").replace(/Đ/g, "d");
  }

  var index = null;
  function buildIndex() {
    index = [];
    TG.pageIds().forEach(function (id) {
      if (id.charAt(0) === "_") return;           // trang nội bộ không index
      var d = TG.getPageDef(id);
      /* hay theo từng section để link tới anchor #s<n> */
      var secHay = [
        norm(stripMarkup(flat([d.title, d.fn], []).join(" "))),
        norm(stripMarkup(flat([d.why], []).join(" "))),
        norm(stripMarkup(flat([d.how], []).join(" "))),
        norm(stripMarkup(flat([d.formulas, d.params], []).join(" "))),
        norm(stripMarkup(flat([d.figures, d.noFigureReason], []).join(" "))),
        norm(stripMarkup(flat([d.limits], []).join(" "))),
        norm(stripMarkup(flat([d.sources, d.pseudocode], []).join(" ")))
      ];
      var parts = [];
      flat([d.title, d.fn, d.why, d.how, d.formulas, d.params,
        d.limits, d.sources, d.pseudocode], parts);
      index.push({
        id: id, title: d.title || id, group: d.group || "",
        hay: norm(parts.map(stripMarkup).join(" ")),
        secs: secHay
      });
    });
    TG.allTerms().forEach(function (t) {
      index.push({
        id: null, term: t.term, title: "Thuật ngữ: " + t.term,
        group: "glossary",
        hay: norm([t.term, t.vi, t.def, t.role, t.example, (t.aliases || []).join(" ")].join(" "))
      });
    });
  }

  /* chọn section tốt nhất cho hit: section chứa nhiều term nhất */
  function bestSection(row, terms) {
    if (!row.secs) return 1;
    var best = 1, bestN = -1;
    row.secs.forEach(function (hay, i) {
      var n = 0;
      terms.forEach(function (t) { if (hay.indexOf(t) >= 0) n++; });
      if (n > bestN) { bestN = n; best = i + 1; }
    });
    return best;
  }

  TG.search = {
    invalidate: function () { index = null; },
    run: function (q, limit) {
      if (!index) buildIndex();
      var terms = norm(q).split(/\s+/).filter(Boolean);
      if (!terms.length) return [];
      var hits = [];
      index.forEach(function (row) {
        var score = 0, ok = true;
        for (var i = 0; i < terms.length; i++) {
          var t = terms[i];
          if (row.hay.indexOf(t) < 0) { ok = false; break; }
          score += row.hay.split(t).length - 1;
          if (norm(row.title).indexOf(t) >= 0) score += 5;
        }
        if (ok) hits.push({ row: row, score: score, sec: bestSection(row, terms) });
      });
      hits.sort(function (a, b) { return b.score - a.score; });
      return hits.slice(0, limit || 40).map(function (h) {
        h.row.sec = h.sec;
        return h.row;
      });
    },
    /* render danh sách kết quả vào el (dùng bởi router) */
    renderInto: function (el, q) {
      el.innerHTML = "";
      var hits = TG.search.run(q);
      if (!hits.length) {
        var empty = TG.el("div", "search-empty",
          q ? 'Không có kết quả cho "' + q + '".' : "Nhập từ khóa để tìm.");
        el.appendChild(empty);
        return;
      }
      var ul = TG.el("ul", "search-hits");
      hits.forEach(function (r) {
        var li = TG.el("li");
        var a = TG.el("a", "hit-title", r.title);
        a.href = r.id
          ? "#/p/" + encodeURIComponent(r.id) + (r.sec > 1 ? "#s" + r.sec : "")
          : "#/glossary";
        li.appendChild(a);
        var ctx = TG.el("div", "hit-ctx",
          (r.id ? "trang /p/" + r.id + (r.sec > 1 ? " · mục " + r.sec : "")
               : "glossary — " + (r.term || "")));
        li.appendChild(ctx);
        ul.appendChild(li);
      });
      el.appendChild(ul);
    }
  };
})();
