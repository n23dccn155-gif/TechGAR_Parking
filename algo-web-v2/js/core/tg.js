/* tg.js — TG namespace: registries trang/terms/quick-values, validatePage,
 * seeded RNG, utils chung. Không module, không fetch — classic script.
 */
(function () {
  "use strict";
  var TG = (window.TG = window.TG || {});

  /* ---------------- registries ---------------- */
  var pageDefs = Object.create(null);   // id -> page def (TG.definePage)
  var quickValues = [];                 // list từ defineQuickValues

  TG.definePage = function (def) {
    if (!def || !def.id) throw new Error("TG.definePage: missing id");
    if (pageDefs[def.id]) console.warn("TG.definePage: duplicate id", def.id);
    pageDefs[def.id] = def;
  };
  TG.getPageDef = function (id) { return pageDefs[id] || null; };
  TG.pageIds = function () { return Object.keys(pageDefs); };
  TG.allPages = function () { return pageDefs; };

  TG.defineQuickValues = function (list) {
    if (!Array.isArray(list)) throw new Error("TG.defineQuickValues: list phải là mảng");
    quickValues = quickValues.concat(list);
  };
  TG.getQuickValues = function () { return quickValues.slice(); };

  /* ---------------- schema validation ----------------
   * Hợp đồng §Schema trong MEGAPLAN. Trả về mảng lỗi (string[]);
   * rỗng = hợp lệ. Chạy được trong node (không DOM).
   */
  var KINDS = {
    runtime: 1, config: 1, derived: 1,
    "class-default": 1, illustrative: 1, inference: 1
  };
  var GROUPS = {
    setup: 1, "single-cam": 1, "multi-cam": 1,
    binding: 1, "gate-frontend": 1, data: 1,
    common: 1                       // trang chung: overview, journey
  };
  var LIMIT_STATUS = { CONFIRMED: 1, UNSURE: 1, REJECTED: 1 };
  var INTERACTIVES = { roi: 1, homography: 1, occlusion: 1, assignment: 1 };
  var ID_RE = /^_?[a-z0-9-]+$/;      // '_' đầu = trang nội bộ/test (vd. _fixture)
  var STEP_ID_RE = /^3\.\d+$/;

  function isNonEmptyStr(v) { return typeof v === "string" && v.trim().length > 0; }

  function checkKinded(errs, list, label, fields) {
    // values[] / params[] / sources[]: kind hợp lệ; src/ref bắt buộc trừ illustrative
    if (list == null) return;
    if (!Array.isArray(list)) { errs.push(label + " phải là mảng"); return; }
    list.forEach(function (row, i) {
      var at = label + "[" + i + "]";
      if (!row || typeof row !== "object") { errs.push(at + " không phải object"); return; }
      fields.forEach(function (f) {
        if (row[f] == null || row[f] === "") errs.push(at + "." + f + " thiếu");
      });
      if (!KINDS[row.kind]) errs.push(at + ".kind lạ: " + JSON.stringify(row.kind));
      var ref = row.src != null ? row.src : row.ref;
      if (row.kind !== "illustrative" && !isNonEmptyStr(ref)) {
        errs.push(at + " thiếu src/ref (kind=" + row.kind + ")");
      }
    });
  }

  TG.validatePage = function (def) {
    var errs = [];
    if (!def || typeof def !== "object") return ["def không phải object"];

    if (!isNonEmptyStr(def.id) || !ID_RE.test(def.id)) {
      errs.push("id phải khớp /^_?[a-z0-9-]+$/: " + JSON.stringify(def.id));
    }
    if (!GROUPS[def.group]) errs.push("group lạ: " + JSON.stringify(def.group));
    if (!isNonEmptyStr(def.title)) errs.push("thiếu title");
    if (typeof def.order !== "number" || !isFinite(def.order)) errs.push("order phải là số");
    ["prev", "next"].forEach(function (k) {
      if (def[k] != null && typeof def[k] !== "string") errs.push(k + " phải là string hoặc null");
    });

    // ①
    if (!def.fn || !isNonEmptyStr(def.fn.text)) errs.push("thiếu fn.text (mục ①)");
    // ②
    if (!def.why || !Array.isArray(def.why.paras) || def.why.paras.length < 1 ||
        !def.why.paras.every(isNonEmptyStr)) {
      errs.push("why.paras phải có ≥1 đoạn không rỗng (mục ②)");
    }
    // ③
    if (!Array.isArray(def.how) || def.how.length < 1) {
      errs.push("how phải có ≥1 bước (mục ③)");
    } else {
      var lastN = 0;
      def.how.forEach(function (s, i) {
        var at = "how[" + i + "]";
        if (!s || typeof s !== "object") { errs.push(at + " không phải object"); return; }
        if (!isNonEmptyStr(s.id) || !STEP_ID_RE.test(s.id)) {
          errs.push(at + ".id phải dạng 3.x: " + JSON.stringify(s.id));
        } else {
          var n = parseInt(s.id.slice(2), 10);
          if (n <= lastN) errs.push(at + ".id không tăng dần: " + s.id);
          lastN = n;
        }
        if (!isNonEmptyStr(s.name)) errs.push(at + ".name thiếu");
        if (!Array.isArray(s.paras) || s.paras.length < 1 ||
            !s.paras.every(isNonEmptyStr)) {
          errs.push(at + ".paras phải có ≥1 đoạn");
        }
        checkKinded(errs, s.values, at + ".values", ["k", "v"]);
        if (s.figure != null) {
          var fg = s.figure;
          if (!fg || typeof fg !== "object" ||
              !isNonEmptyStr(fg.src) || !isNonEmptyStr(fg.alt)) {
            errs.push(at + ".figure phải là object có src/alt không rỗng");
          }
        }
      });
    }
    // ④: ít nhất một trong formulas/params khác rỗng
    var fOk = Array.isArray(def.formulas) && def.formulas.length > 0;
    var pOk = Array.isArray(def.params) && def.params.length > 0;
    if (!fOk && !pOk) errs.push("cần formulas hoặc params khác rỗng (mục ④)");
    if (def.formulas != null) {
      if (!Array.isArray(def.formulas)) errs.push("formulas phải là mảng");
      else def.formulas.forEach(function (f, i) {
        var at = "formulas[" + i + "]";
        if (!f || !isNonEmptyStr(f.name) || !isNonEmptyStr(f.expr)) {
          errs.push(at + " thiếu name/expr");
        }
      });
    }
    checkKinded(errs, def.params, "params", ["name", "value", "role"]);
    // ⑤
    if (def.figures != null && !Array.isArray(def.figures)) {
      errs.push("figures phải là mảng");
    } else (def.figures || []).forEach(function (fig, i) {
      var at = "figures[" + i + "]";
      if (!fig || !isNonEmptyStr(fig.src) || !isNonEmptyStr(fig.alt)) {
        errs.push(at + " thiếu src/alt");
      }
    });
    if ((!def.figures || def.figures.length === 0) && !isNonEmptyStr(def.noFigureReason)) {
      errs.push("figures rỗng ⇒ noFigureReason phải là string không rỗng (mục ⑤)");
    }
    if (def.interactive != null && !INTERACTIVES[def.interactive]) {
      errs.push("interactive lạ: " + JSON.stringify(def.interactive));
    }
    // ⑥
    if (!Array.isArray(def.limits) || def.limits.length < 1) {
      errs.push("limits phải có ≥1 mục (mục ⑥)");
    } else def.limits.forEach(function (l, i) {
      var at = "limits[" + i + "]";
      if (!l || !isNonEmptyStr(l.text)) { errs.push(at + ".text thiếu"); return; }
      if (l.evidence != null) {
        if (typeof l.evidence !== "object") errs.push(at + ".evidence phải là object");
        else if (l.evidence.status != null && !LIMIT_STATUS[l.evidence.status]) {
          errs.push(at + ".evidence.status lạ: " + JSON.stringify(l.evidence.status));
        }
      }
    });
    // ⑦
    if (!Array.isArray(def.sources) || def.sources.length < 1) {
      errs.push("sources phải có ≥1 mục (mục ⑦)");
    }
    checkKinded(errs, def.sources, "sources", ["ref"]);
    if (def.pseudocode != null && typeof def.pseudocode !== "string") {
      errs.push("pseudocode phải là string hoặc null");
    }
    return errs;
  };

  /* ---------------- utils ---------------- */
  TG.esc = function (s) {
    return String(s == null ? "" : s)
      .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;").replace(/'/g, "&#39;");
  };
  TG.clamp = function (v, lo, hi) { return v < lo ? lo : v > hi ? hi : v; };
  TG.lerp = function (a, b, t) { return a + (b - a) * t; };
  TG.fmt = function (v, d) {
    var x = Number(v); if (!isFinite(x)) return String(v);
    return x.toFixed(d == null ? 2 : d);
  };
  TG.el = function (tag, cls, text) {
    var e = document.createElement(tag);
    if (cls) e.className = cls;
    if (text != null) e.textContent = text;
    return e;
  };
  TG.reducedMotion = function () {
    return !!(window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches);
  };

  /* ---------------- seeded RNG ----------------
   * mulberry32 + string hash — cảnh minh họa deterministic.
   */
  function hashSeed(str) {
    var h = 1779033703 ^ String(str).length;
    for (var i = 0; i < String(str).length; i++) {
      h = Math.imul(h ^ String(str).charCodeAt(i), 3432918353);
      h = (h << 13) | (h >>> 19);
    }
    return h >>> 0;
  }
  TG.hashSeed = hashSeed;
  TG.rng = function (seed) {
    var a = typeof seed === "number" ? seed >>> 0 : hashSeed(seed);
    return function () {
      a |= 0; a = (a + 0x6d2b79f5) | 0;
      var t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  };
})();
