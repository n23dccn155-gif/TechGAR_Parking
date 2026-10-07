/* render.js — renderer duy nhất: renderPage(def) → HTMLElement.
 * Luôn xuất đúng 7 <section class="sec" id="s1"…"s7"> theo thứ tự:
 *   ① Chức năng & vị trí   ② Vì sao cần        ③ Cách hoạt động
 *   ④ Số liệu & công thức  ⑤ Trực quan/minh họa ⑥ Lỗi thật & giới hạn
 *   ⑦ Nằm ở đâu trong code (trong <details> đóng sẵn)
 */
(function () {
  "use strict";
  var TG = (window.TG = window.TG || {});

  var SEC_TITLES = [
    "Chức năng & vị trí",
    "Vì sao cần",
    "Cách hoạt động",
    "Số liệu & công thức",
    "Trực quan / minh họa",
    "Lỗi thật & giới hạn",
    "Nằm ở đâu trong code"
  ];

  function el(tag, cls, text) { return TG.el(tag, cls, text); }

  function secHead(n, title) {
    var h = el("h2");
    var no = el("span", "sec-no", String(n));
    h.appendChild(no);
    h.appendChild(document.createTextNode(title));
    return h;
  }

  function newSec(n, extraCls) {
    var s = el("section", "sec" + (extraCls ? " " + extraCls : ""));
    s.id = "s" + n;
    s.appendChild(secHead(n, SEC_TITLES[n - 1]));
    return s;
  }

  function kindChip(kind) { return el("span", "kind kind-" + kind, kind || "?"); }

  function srcCell(src) {
    var td = el("td", "src");
    td.textContent = src || "—";
    return td;
  }

  /* ① pipeline strip: prev → here → next */
  function pipeStrip(def) {
    var strip = el("div", "pipe-strip");
    function node(id, label, isHere) {
      if (id == null && !isHere) return null;
      var t = id ? (TG.getPageDef(id) || {}).title : null;
      var text = t || label || id || "";
      if (isHere || !id) {
        var sp = el("span", "pipe-node" + (isHere ? " here" : ""), text);
        return sp;
      }
      var a = el("a", "pipe-node", text);
      a.href = "#/p/" + encodeURIComponent(id);
      return a;
    }
    function arrow() { return el("span", "pipe-arrow", "→"); }
    var prev = node(def.prev, null, false);
    if (prev) { strip.appendChild(prev); strip.appendChild(arrow()); }
    strip.appendChild(node(null, def.title, true));
    var next = node(def.next, null, false);
    if (next) { strip.appendChild(arrow()); strip.appendChild(next); }
    return strip;
  }

  /* values table nhỏ trong ③ */
  function kvTable(values) {
    var wrap = el("div", "tbl-wrap kvs");
    var t = el("table", "tbl");
    t.innerHTML = "<thead><tr><th>Tham số</th><th>Giá trị</th><th>Loại</th><th>Nguồn</th></tr></thead>";
    var tb = el("tbody");
    values.forEach(function (v) {
      var tr = el("tr");
      var name = el("td", "mono"); name.textContent = v.k;
      var val = el("td", "mono"); val.textContent = v.v;
      var kd = el("td"); kd.appendChild(kindChip(v.kind));
      tr.appendChild(name); tr.appendChild(val); tr.appendChild(kd);
      tr.appendChild(srcCell(v.src));
      tb.appendChild(tr);
    });
    t.appendChild(tb); wrap.appendChild(t);
    return wrap;
  }

  /* ④ formula block */
  function formulaBlock(f) {
    var box = el("div", "formula");
    box.appendChild(el("div", "f-name", f.name));
    box.appendChild(el("div", "f-expr", f.expr));
    if (f.subst || f.result) {
      var sub = el("div", "f-subst");
      sub.textContent = (f.subst || "") + " ";
      var r = el("span", "f-result", f.result || "");
      sub.appendChild(r);
      box.appendChild(sub);
    }
    if (f.note) box.appendChild(el("div", "f-note", f.note));
    if (f.src) box.appendChild(el("div", "f-src", f.src));
    return box;
  }

  /* ④ params table */
  function paramsTable(params) {
    var wrap = el("div", "tbl-wrap");
    var t = el("table", "tbl");
    t.innerHTML = "<thead><tr><th>Tham số</th><th>Giá trị</th><th>Loại</th><th>Vai trò</th><th>Nguồn</th></tr></thead>";
    var tb = el("tbody");
    params.forEach(function (p) {
      var tr = el("tr");
      var name = el("td", "mono"); name.textContent = p.name;
      var val = el("td", "mono"); val.textContent = p.value;
      var kd = el("td"); kd.appendChild(kindChip(p.kind));
      var role = el("td"); role.textContent = p.role || "";
      tr.appendChild(name); tr.appendChild(val); tr.appendChild(kd); tr.appendChild(role);
      tr.appendChild(srcCell(p.src));
      tb.appendChild(tr);
    });
    t.appendChild(tb); wrap.appendChild(t);
    return wrap;
  }

  /* ⑤ figures */
  function figureBlock(fig) {
    var f = el("figure");
    var img = el("img");
    img.src = fig.src; img.alt = fig.alt || "";
    img.loading = "lazy";
    f.appendChild(img);
    var cap = el("figcaption");
    cap.textContent = fig.caption || "";
    if (fig.origin) cap.appendChild(el("span", "origin", "nguồn: " + fig.origin));
    f.appendChild(cap);
    return f;
  }

  /* ⑥ badge cho evidence.status */
  function limitBadge(status) {
    var map = { CONFIRMED: "badge-confirmed", UNSURE: "badge-unsure", REJECTED: "badge-rejected" };
    return el("span", "badge " + (map[status] || "badge-unsure"), status || "UNSURE");
  }

  /* prev/next cuối trang */
  function prevNext(def) {
    var nav = el("nav", "prevnext");
    function side(id, dir, isNext) {
      if (!id) return el("span");
      var a = el("a");
      a.href = "#/p/" + encodeURIComponent(id);
      var d = el("span", "pn-dir", dir);
      var t = el("span", null, (TG.getPageDef(id) || {}).title || id);
      a.appendChild(d); a.appendChild(t);
      if (isNext) a.style.textAlign = "right";
      return a;
    }
    nav.appendChild(side(def.prev, "← Trước", false));
    nav.appendChild(side(def.next, "Sau →", true));
    return nav;
  }

  /* ================= renderPage ================= */
  TG.renderPage = function (def) {
    var errs = TG.validatePage ? TG.validatePage(def) : [];
    var root = el("article", "page");
    root.setAttribute("data-page", def.id || "");

    // header trang
    var h1 = el("h1", null, def.title || def.id || "—");
    root.appendChild(h1);
    var status = el("div", "statusline");
    status.appendChild(el("span", null, def.group || ""));
    status.appendChild(document.createTextNode(" · #" + (def.order != null ? def.order : "?")));
    root.appendChild(status);
    if (errs.length) {
      var warn = el("div", "nofigure");
      warn.textContent = "Trang chưa qua schema (" + errs.length + " lỗi) — xem console.";
      warn.style.borderColor = "var(--bad)";
      warn.style.color = "var(--bad)";
      root.appendChild(warn);
      errs.forEach(function (e) { console.error("[schema]", def.id, ":", e); });
    }

    var seen = new Set(); // term đã xuất trong trang này

    /* ① */
    var s1 = newSec(1);
    s1.appendChild(pipeStrip(def));
    var p = el("p"); p.innerHTML = TG.termify(def.fn && def.fn.text, seen);
    s1.appendChild(p);
    root.appendChild(s1);

    /* ② */
    var s2 = newSec(2);
    (def.why && def.why.paras || []).forEach(function (t) {
      var pp = el("p"); pp.innerHTML = TG.termify(t, seen); s2.appendChild(pp);
    });
    root.appendChild(s2);

    /* ③ */
    var s3 = newSec(3);
    (def.how || []).forEach(function (step) {
      var st = el("div", "step");
      var h3 = el("h3");
      h3.appendChild(el("span", "step-id", step.id || ""));
      h3.appendChild(document.createTextNode(" " + (step.name || "")));
      st.appendChild(h3);
      (step.paras || []).forEach(function (t) {
        var pp = el("p"); pp.innerHTML = TG.termify(t, seen); st.appendChild(pp);
      });
      if (step.figure) st.appendChild(figureBlock(step.figure));
      if (step.values && step.values.length) st.appendChild(kvTable(step.values));
      if (step.page && TG.getPageDef(step.page)) {
        var pd = TG.getPageDef(step.page);
        var pl = el("a", "step-page", "chi tiết: " + (pd.navLabel || pd.title || step.page) + " →");
        pl.href = "#/p/" + encodeURIComponent(step.page);
        st.appendChild(pl);
      }
      s3.appendChild(st);
    });
    root.appendChild(s3);

    /* ④ */
    var s4 = newSec(4);
    (def.formulas || []).forEach(function (f) { s4.appendChild(formulaBlock(f)); });
    if (def.params && def.params.length) s4.appendChild(paramsTable(def.params));
    root.appendChild(s4);

    /* ⑤ */
    var s5 = newSec(5);
    if (def.figures && def.figures.length) {
      var figs = el("div", "figures");
      def.figures.forEach(function (fig) { figs.appendChild(figureBlock(fig)); });
      s5.appendChild(figs);
    } else {
      s5.appendChild(el("div", "nofigure",
        def.noFigureReason || "Chưa có hình minh họa."));
    }
    if (def.interactive) {
      var ph = el("div", "itv-slot");
      ph.setAttribute("data-interactive", def.interactive);
      s5.appendChild(ph);
      var comp = TG.interactive && TG.interactive[def.interactive];
      if (comp && typeof comp.mount === "function") {
        comp.mount(ph, { seed: TG.hashSeed(def.id + ":" + def.interactive) });
      } else {
        ph.textContent = "Khu vực tương tác: " + def.interactive + ".";
      }
    }
    root.appendChild(s5);

    /* ⑥ */
    var s6 = newSec(6);
    var ul = el("ul", "limits");
    (def.limits || []).forEach(function (l) {
      var li = el("li");
      if (l.evidence && l.evidence.status) li.appendChild(limitBadge(l.evidence.status));
      var body = el("div");
      var tx = el("span"); tx.innerHTML = TG.termify(l.text, seen);
      body.appendChild(tx);
      if (l.evidence && (l.evidence.session || l.evidence.frame != null)) {
        var bits = [];
        if (l.evidence.session) bits.push("session " + l.evidence.session);
        if (l.evidence.frame != null) bits.push("frame " + l.evidence.frame);
        body.appendChild(el("span", "evid", bits.join(" · ")));
      }
      li.appendChild(body);
      ul.appendChild(li);
    });
    s6.appendChild(ul);
    root.appendChild(s6);

    /* ⑦ trong <details> đóng sẵn */
    var s7 = newSec(7);
    var det = document.createElement("details");
    det.className = "deep";
    var sum = document.createElement("summary");
    sum.textContent = "Mã nguồn, tham chiếu dòng & ký hiệu nội bộ";
    det.appendChild(sum);
    var db = el("div", "deep-body");
    var sl = el("ul", "src-list");
    (def.sources || []).forEach(function (s) {
      var li = el("li");
      var ref = el("span", "ref", s.ref);
      li.appendChild(ref);
      li.appendChild(document.createTextNode(" "));
      li.appendChild(kindChip(s.kind));
      if (s.note) {
        li.appendChild(document.createTextNode(" — "));
        var nt = el("span"); nt.innerHTML = TG.termify(s.note, seen);
        li.appendChild(nt);
      }
      sl.appendChild(li);
    });
    db.appendChild(sl);
    if (def.pseudocode) {
      var pre = el("pre", "pcode");
      pre.textContent = def.pseudocode;
      db.appendChild(pre);
    }
    det.appendChild(db);
    s7.appendChild(det);
    root.appendChild(s7);

    root.appendChild(prevNext(def));
    return root;
  };

  /* mục lục phải từ các section đã render */
  TG.buildToc = function (article) {
    var nav = el("nav");
    nav.appendChild(el("div", "toc-label", "Mục lục"));
    article.querySelectorAll("section.sec").forEach(function (s) {
      var h = s.querySelector("h2");
      if (!h) return;
      var a = el("a", null, h.textContent.replace(/^\d+/, "").trim() || s.id);
      a.href = "#" + s.id;
      a.addEventListener("click", function (e) {
        e.preventDefault();
        s.scrollIntoView({ behavior: TG.reducedMotion() ? "auto" : "smooth" });
      });
      nav.appendChild(a);
    });
    return nav;
  };
})();
