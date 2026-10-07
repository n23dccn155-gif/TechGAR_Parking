/* router.js — hash router + khung điều hướng.
 * Routes: #/ (tổng quan) · #/p/<id> · #/glossary · #/values · #/journey ·
 *         #/search?q=…
 * Nav trái sinh từ TG.manifest.groups + pageDefs (sắp theo order).
 * Không fetch, không module — chạy được từ file://.
 */
(function () {
  "use strict";
  var TG = (window.TG = window.TG || {});

  var viewEl = null, tocEl = null, navEl = null, backdropEl = null, toggleEl = null;

  /* ---------------- parse ---------------- */
  function parseHash() {
    var h = location.hash.replace(/^#\/?/, "");
    var qIdx = h.indexOf("?");
    var query = {};
    if (qIdx >= 0) {
      h.slice(qIdx + 1).split("&").forEach(function (kv) {
        var p = kv.split("=");
        if (p[0]) query[decodeURIComponent(p[0])] = decodeURIComponent(p.slice(1).join("=") || "");
      });
      h = h.slice(0, qIdx);
    }
    var parts = h.split("/").filter(Boolean);
    if (!parts.length) return { kind: "overview" };
    if (parts[0] === "p" && parts[1]) {
      var raw = decodeURIComponent(parts[1]);
      var sec = null, ci = raw.indexOf("#");
      if (ci >= 0) { sec = raw.slice(ci + 1); raw = raw.slice(0, ci); }
      return { kind: "page", id: raw, sec: sec };
    }
    if (parts[0] === "glossary") return { kind: "glossary" };
    if (parts[0] === "values") return { kind: "values" };
    if (parts[0] === "journey") return { kind: "journey" };
    if (parts[0] === "search") return { kind: "search", q: query.q || "" };
    return { kind: "overview" };
  }

  /* ---------------- nav trái ---------------- */
  function pageTitleOr(id, fallback) {
    var d = TG.getPageDef(id);
    return (d && d.title) || fallback || id;
  }

  function buildNav() {
    if (!navEl) return;
    navEl.innerHTML = "";
    var groups = (TG.manifest && TG.manifest.groups) || [];
    var defs = TG.allPages();
    groups.forEach(function (g) {
      var ids = (g.pages || []).filter(function (id) { return defs[id]; });
      if (!ids.length) return;
      ids.sort(function (a, b) { return (defs[a].order || 0) - (defs[b].order || 0); });
      var box = TG.el("div", "nav-group");
      box.appendChild(TG.el("div", "nav-group-label", g.label || g.id));
      ids.forEach(function (id) {
        var d = defs[id];
        var a = TG.el("a", "nav-link");
        a.href = "#/p/" + encodeURIComponent(id);
        a.setAttribute("data-page", id);
        var idx = TG.el("span", "nav-idx", String(d.order));
        var t = TG.el("span", null, d.navLabel || d.title || id);
        a.appendChild(idx); a.appendChild(t);
        box.appendChild(a);
      });
      navEl.appendChild(box);
    });
    /* nhóm tiện ích — luôn hiện, kể cả trên mobile khi toplinks bị hẹp */
    var util = TG.el("div", "nav-group");
    util.appendChild(TG.el("div", "nav-group-label", "Trang chung"));
    [["#/", "Tổng quan"], ["#/journey", "Hành trình"],
     ["#/glossary", "Thuật ngữ"], ["#/values", "Số liệu"]].forEach(function (x) {
      var a = TG.el("a", "nav-link");
      a.href = x[0];
      a.appendChild(TG.el("span", null, x[1]));
      util.appendChild(a);
    });
    navEl.appendChild(util);
  }

  function highlightNav(route) {
    if (!navEl) return;
    var cur = route.kind === "page" ? route.id : null;
    navEl.querySelectorAll("a.nav-link").forEach(function (a) {
      if (a.getAttribute("data-page") === cur) a.setAttribute("aria-current", "page");
      else a.removeAttribute("aria-current");
    });
  }

  function closeNav() {
    if (navEl) navEl.classList.remove("open");
    if (backdropEl) backdropEl.classList.remove("open");
    if (toggleEl) toggleEl.setAttribute("aria-expanded", "false");
  }

  /* ---------------- trang nội bộ ---------------- */
  function mountNode(node) {
    viewEl.innerHTML = "";
    if (tocEl) tocEl.innerHTML = "";
    viewEl.appendChild(node);
  }

  function mountAlgorithmPage(def) {
    var art = TG.renderPage(def);
    viewEl.innerHTML = "";
    viewEl.appendChild(art);
    if (tocEl) {
      tocEl.innerHTML = "";
      tocEl.appendChild(TG.buildToc(art));
    }
    document.title = (def.title || def.id) + " — TechGAR Pipeline";
  }

  function mountPlaceholder(title) {
    var box = TG.el("div", "placeholder");
    box.textContent = "Trang \"" + title + "\" chưa có nội dung (đang xây dựng).";
    mountNode(box);
    document.title = title + " — TechGAR Pipeline";
  }

  /* bản đồ nhóm → trang có link — dùng trong overview (và fallback) */
  function pipeMap() {
    var strip = TG.el("div", "pipe-overview");
    var groups = (TG.manifest && TG.manifest.groups) || [];
    var defs = TG.allPages();
    groups.forEach(function (g) {
      var ids = (g.pages || []).filter(function (id) { return defs[id]; });
      if (!ids.length) return;
      var row = TG.el("div", "pipe-strip");
      row.appendChild(TG.el("span", "pipe-node", g.label || g.id));
      ids.forEach(function (id) {
        row.appendChild(TG.el("span", "pipe-arrow", "→"));
        var a = TG.el("a", "pipe-node", defs[id].title || id);
        a.href = "#/p/" + encodeURIComponent(id);
        row.appendChild(a);
      });
      strip.appendChild(row);
    });
    return strip;
  }

  function mountOverview() {
    var def = TG.getPageDef("overview");
    if (def) {
      mountAlgorithmPage(def);
      var s3 = viewEl.querySelector("#s3");
      if (s3) s3.appendChild(pipeMap());
      return;
    }
    var box = TG.el("article", "page");
    box.appendChild(TG.el("h1", null, "TechGAR Smart Parking — pipeline"));
    var p = TG.el("p", "subtitle",
      "Minh họa giáo dục bám mã nguồn: camera → ROI/motion → tracking → handoff → occupancy → gate/QR → bản đồ/A*.");
    box.appendChild(p);
    box.appendChild(pipeMap());
    mountNode(box);
    document.title = "Tổng quan — TechGAR Pipeline";
  }

  function mountGlossary() {
    var box = TG.el("article", "page");
    box.appendChild(TG.el("h1", null, "Thuật ngữ"));
    box.appendChild(TG.el("p", "subtitle",
      "Thuật ngữ tiếng Anh giữ nguyên; mỗi mục giải thích tiếng Việt + vai trò trong pipeline."));
    var terms = TG.allTerms();
    if (!terms.length) {
      box.appendChild(TG.el("div", "placeholder", "Glossary chưa có mục nào."));
    }
    terms.forEach(function (t) {
      var e = TG.el("div", "gls-entry");
      var h = TG.el("h3");
      h.textContent = t.term + " ";
      var vi = TG.el("span", "gls-vi", "· " + (t.vi || ""));
      h.appendChild(vi);
      e.appendChild(h);
      if (t.def) e.appendChild(TG.el("p", null, t.def));
      if (t.role) {
        var r = TG.el("p", null, "");
        r.textContent = "Vai trò: " + t.role;
        e.appendChild(r);
      }
      if (t.example) {
        var x = TG.el("p", null, "");
        x.textContent = "Ví dụ: " + t.example;
        e.appendChild(x);
      }
      var meta = TG.el("div", "gls-meta");
      if (t.page) {
        var a = TG.el("a", null, "#/p/" + t.page);
        a.href = "#/p/" + encodeURIComponent(t.page);
        meta.appendChild(document.createTextNode("Xem trang: "));
        meta.appendChild(a);
      }
      e.appendChild(meta);
      box.appendChild(e);
    });
    mountNode(box);
    document.title = "Thuật ngữ — TechGAR Pipeline";
  }

  function mountValues() {
    var box = TG.el("article", "page");
    box.appendChild(TG.el("h1", null, "Số liệu tra nhanh"));
    box.appendChild(TG.el("p", "subtitle",
      "Bảng tổng hợp tham số/ngưỡng lấy từ mã nguồn — mỗi hàng kèm loại và nguồn."));
    var rows = TG.getQuickValues();
    if (!rows.length) {
      box.appendChild(TG.el("div", "placeholder", "Chưa có số liệu (quickvalues-data.js đang trống)."));
    } else {
      var wrap = TG.el("div", "tbl-wrap");
      var t = TG.el("table", "tbl");
      t.innerHTML = "<thead><tr><th>Tên</th><th>Giá trị</th><th>Loại</th><th>Nguồn</th><th>Trang</th></tr></thead>";
      var tb = TG.el("tbody");
      rows.forEach(function (r) {
        var tr = TG.el("tr");
        var n = TG.el("td", "mono"); n.textContent = r.name;
        var v = TG.el("td", "mono"); v.textContent = r.value;
        var k = TG.el("td"); k.appendChild(TG.el("span", "kind kind-" + r.kind, r.kind || "?"));
        var s = TG.el("td", "src"); s.textContent = r.src || "—";
        var pg = TG.el("td");
        if (r.page) {
          var a = TG.el("a", null, r.page);
          a.href = "#/p/" + encodeURIComponent(r.page);
          pg.appendChild(a);
        }
        tr.appendChild(n); tr.appendChild(v); tr.appendChild(k); tr.appendChild(s); tr.appendChild(pg);
        tb.appendChild(tr);
      });
      t.appendChild(tb); wrap.appendChild(t);
      box.appendChild(wrap);
    }
    mountNode(box);
    document.title = "Số liệu tra nhanh — TechGAR Pipeline";
  }

  function mountSearch(q) {
    var box = TG.el("article", "page");
    box.appendChild(TG.el("h1", null, "Tìm kiếm"));
    var input = TG.el("input");
    input.type = "search";
    input.value = q || "";
    input.placeholder = "Nhập từ khóa…";
    input.style.width = "100%";
    input.style.maxWidth = "480px";
    input.style.height = "44px";
    input.style.border = "1px solid var(--line)";
    input.style.padding = "0 12px";
    input.style.marginBottom = "14px";
    box.appendChild(input);
    var results = TG.el("div");
    box.appendChild(results);
    TG.search.renderInto(results, q);
    var deb = null;
    input.addEventListener("input", function () {
      clearTimeout(deb);
      deb = setTimeout(function () {
        var v = input.value.trim();
        history.replaceState(null, "", "#/search" + (v ? "?q=" + encodeURIComponent(v) : ""));
        TG.search.renderInto(results, v);
      }, 120);
    });
    mountNode(box);
    document.title = "Tìm kiếm — TechGAR Pipeline";
    if (!q) input.focus();
  }

  /* ---------------- route ---------------- */
  function route() {
    var r = parseHash();
    closeNav();
    highlightNav(r);
    if (r.kind === "overview") { mountOverview(); return; }
    if (r.kind === "glossary") { mountGlossary(); return; }
    if (r.kind === "values") { mountValues(); return; }
    if (r.kind === "search") { mountSearch(r.q); return; }
    if (r.kind === "journey") {
      var jd = TG.getPageDef("journey");
      if (jd) mountAlgorithmPage(jd); else mountPlaceholder("Hành trình");
      return;
    }
    // r.kind === 'page'
    var def = TG.getPageDef(r.id);
    if (!def) { mountPlaceholder(r.id); return; }
    mountAlgorithmPage(def);
    if (r.sec && /^s[1-7]$/.test(r.sec)) {
      var tgt = viewEl.querySelector("#" + r.sec);
      if (tgt) { tgt.scrollIntoView(); return; }
    }
    window.scrollTo(0, 0);
  }

  TG.router = {
    go: function (hash) { location.hash = hash; },
    route: route,
    parse: parseHash,
    neighbors: function (id) {
      var order = (TG.manifest && TG.manifest.order) || TG.pageIds();
      var i = order.indexOf(id);
      return {
        prev: i > 0 ? order[i - 1] : null,
        next: i >= 0 && i < order.length - 1 ? order[i + 1] : null
      };
    },
    init: function (opts) {
      opts = opts || {};
      viewEl = opts.view;
      tocEl = opts.toc || null;
      navEl = opts.nav || null;
      backdropEl = opts.backdrop || null;
      toggleEl = opts.toggle || null;
      buildNav();
      if (toggleEl) {
        toggleEl.addEventListener("click", function () {
          var open = navEl && navEl.classList.toggle("open");
          if (backdropEl) backdropEl.classList.toggle("open", !!open);
          toggleEl.setAttribute("aria-expanded", open ? "true" : "false");
        });
      }
      if (backdropEl) backdropEl.addEventListener("click", closeNav);
      window.addEventListener("hashchange", route);
      route();
    }
  };
})();
