/* terms.js — glossary registry + resolve [[Term]] trong prose + tooltip.
 * Markup: [[Kalman filter]] → lần đầu trong trang hiện "Kalman filter (bộ lọc
 * dự đoán vị trí)", các lần sau thu về <abbr class="term"> với tooltip.
 * Term tra không phân biệt hoa thường; alias trỏ về cùng entry.
 * Term thiếu trong glossary → console.error (Playwright/e2e sẽ bắt).
 */
(function () {
  "use strict";
  var TG = (window.TG = window.TG || {});

  var byKey = Object.create(null); // lower(term|alias) -> entry

  TG.defineTerms = function (list) {
    if (!Array.isArray(list)) throw new Error("TG.defineTerms: list phải là mảng");
    list.forEach(function (e) {
      if (!e || !e.term) { console.error("TG.defineTerms: entry thiếu term", e); return; }
      byKey[key(e.term)] = e;
      (e.aliases || []).forEach(function (a) { byKey[key(a)] = e; });
    });
  };
  TG.getTerm = function (name) { return byKey[key(name)] || null; };
  TG.allTerms = function () {
    var seen = Object.create(null), out = [];
    Object.keys(byKey).forEach(function (k) {
      var e = byKey[k];
      if (!seen[e.term]) { seen[e.term] = 1; out.push(e); }
    });
    return out.sort(function (a, b) { return a.term.localeCompare(b.term, "vi"); });
  };

  function key(s) { return String(s || "").trim().toLowerCase(); }

  /* termify(text, seen): text thuần → HTML an toàn, resolve [[Term]].
   * seen = Set() theo trang (renderPage tạo mới mỗi lần render).
   * Trả về chuỗi HTML — chỉ escape phần text ngoài markup.
   */
  var MARKUP_RE = /\[\[([^\[\]]+)\]\]/g;
  TG.termify = function (text, seen) {
    seen = seen || new Set();
    var src = String(text == null ? "" : text);
    var out = "", last = 0, m;
    MARKUP_RE.lastIndex = 0;
    while ((m = MARKUP_RE.exec(src))) {
      out += TG.esc(src.slice(last, m.index));
      var name = m[1].trim();
      var entry = TG.getTerm(name);
      if (!entry) {
        console.error("[terms] term không có trong glossary:", name);
        out += TG.esc(name);
      } else if (!seen.has(entry.term)) {
        seen.add(entry.term);
        out += '<abbr class="term term-first" tabindex="0" data-term="' +
          TG.esc(key(entry.term)) + '" data-vi="' + TG.esc(entry.vi || "") + '">' +
          TG.esc(name) + "</abbr>" +
          (entry.vi ? ' <span class="term-vi">(' + TG.esc(entry.vi) + ")</span>" : "");
      } else {
        out += '<abbr class="term" tabindex="0" data-term="' +
          TG.esc(key(entry.term)) + '" data-vi="' + TG.esc(entry.vi || "") + '">' +
          TG.esc(name) + "</abbr>";
      }
      last = m.index + m[0].length;
    }
    out += TG.esc(src.slice(last));
    return out;
  };

  /* para(text, seen) tiện dụng: <p> đã termify. */
  TG.para = function (text, seen) {
    var p = document.createElement("p");
    p.innerHTML = TG.termify(text, seen);
    return p;
  };

  /* ---------------- tooltip ---------------- */
  var tipEl = null;
  function ensureTip() {
    if (tipEl || typeof document === "undefined") return tipEl;
    tipEl = document.createElement("div");
    tipEl.className = "tip";
    tipEl.hidden = true;
    document.body.appendChild(tipEl);
    return tipEl;
  }
  function showTip(target) {
    var entry = TG.getTerm(target.getAttribute("data-term"));
    if (!entry) return;
    var tip = ensureTip(); if (!tip) return;
    tip.innerHTML = "";
    var vi = document.createElement("span");
    vi.className = "tip-vi";
    vi.textContent = entry.term + (entry.vi ? " — " + entry.vi : "");
    var def = document.createElement("span");
    def.className = "tip-def";
    def.textContent = entry.def || "";
    tip.appendChild(vi); tip.appendChild(def);
    tip.hidden = false;
    var r = target.getBoundingClientRect();
    var tw = tip.offsetWidth, th = tip.offsetHeight;
    var x = Math.min(r.left, window.innerWidth - tw - 8);
    /* ưu tiên phía trên term — không che đoạn/tiêu đề đang đọc phía dưới */
    var y = r.top - th - 6;
    if (y < 4) y = r.bottom + 6;
    if (y + th > window.innerHeight - 8) y = Math.max(4, r.top - th - 6);
    tip.style.left = Math.max(4, x) + "px";
    tip.style.top = Math.max(4, y) + "px";
  }
  function hideTip() { if (tipEl) tipEl.hidden = true; }

  TG.bindTermTips = function (root) {
    if (typeof document === "undefined") return;
    (root || document).addEventListener("mouseover", function (e) {
      var t = e.target && e.target.closest ? e.target.closest(".term") : null;
      if (t) showTip(t);
    });
    (root || document).addEventListener("mouseout", function (e) {
      var t = e.target && e.target.closest ? e.target.closest(".term") : null;
      if (t && !(e.relatedTarget && t.contains(e.relatedTarget))) hideTip();
    });
    (root || document).addEventListener("focusin", function (e) {
      var t = e.target && e.target.closest ? e.target.closest(".term") : null;
      if (t) showTip(t);
    });
    (root || document).addEventListener("focusout", function (e) {
      if (e.target && e.target.classList && e.target.classList.contains("term")) hideTip();
    });
  };
})();
