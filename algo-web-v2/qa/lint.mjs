// qa/lint.mjs — lint tĩnh theo MEGAPLAN Task 2, chạy bằng node, không browser.
//   node qa/lint.mjs                  → lint mọi trang đã đăng ký + css/*.css
//   node qa/lint.mjs --pages=a,b      → subset trang
//   node qa/lint.mjs --files=f.json   → lint trực tiếp fixture JSON (bypass registry)
//   node qa/lint.mjs --css=x.css      → thêm file CSS ngoài css/ (test fixture)
// exit 1 nếu có ERROR; WARN chỉ in ra.
import fs from 'fs';
import vm from 'vm';
import path from 'path';
import { fileURLToPath } from 'url';
import { resolveRef, REPO_ROOT } from './lib/sources.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const ARGS = process.argv.slice(2);
const argVal = (k) => (ARGS.find(a => a.startsWith(k + '=')) || '').split('=').slice(1).join('=');
const ONLY_PAGES = argVal('--pages') ? argVal('--pages').split(',') : null;
const FIXTURE_FILES = argVal('--files') ? argVal('--files').split(',') : null;
const EXTRA_CSS = argVal('--css') ? argVal('--css').split(',') : [];

const issues = [];
const seenIds = new Map(), seenOrders = new Map();
function push(level, rule, at, msg) {
  issues.push({ level, rule, at, msg });
}

/* ---------- nạp registry: tg + terms + glossary-data + pages ---------- */
const ctx = { window: {}, console };
ctx.window = ctx;
vm.createContext(ctx);
for (const f of ['js/core/tg.js', 'js/core/terms.js']) {
  vm.runInContext(fs.readFileSync(path.join(ROOT, f), 'utf8'), ctx, { filename: f });
}
for (const f of ['js/glossary-data.js']) {
  if (fs.existsSync(path.join(ROOT, f))) {
    vm.runInContext(fs.readFileSync(path.join(ROOT, f), 'utf8'), ctx, { filename: f });
  }
}
const TG = ctx.TG;

/* trang: từ registry hoặc fixture JSON */
let defs = [];
if (FIXTURE_FILES) {
  for (const f of FIXTURE_FILES) {
    const p = path.resolve(ROOT, f);
    if (!fs.existsSync(p)) { push('ERROR', 0, f, 'fixture không tồn tại'); continue; }
    defs.push(JSON.parse(fs.readFileSync(p, 'utf8')));
  }
} else {
  /* chỉ nạp page files mà index.html include — file cũ giữ lại tới Task 12 không lint */
  const html = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
  const re = /<script[^>]+src="(js\/pages\/[^"]+\.js)"/g;
  let m;
  const pageFiles = [];
  while ((m = re.exec(html))) pageFiles.push(m[1]);
  for (const f of pageFiles) {
    const p = path.resolve(ROOT, f);
    if (!fs.existsSync(p)) { push('ERROR', 0, f, 'index.html nạp file không tồn tại'); continue; }
    try {
      vm.runInContext(fs.readFileSync(p, 'utf8'), ctx, { filename: f });
    } catch (e) {
      push('ERROR', 0, f, 'file trang lỗi khi nạp: ' + e.message);
    }
  }
  for (const id of TG.pageIds()) {
    const d = TG.getPageDef(id);
    if (ONLY_PAGES && !ONLY_PAGES.includes(id)) continue;
    defs.push(d);
  }
}

/* id hợp lệ cho prev/next + term.page: registry ∪ manifest.order ∪ special */
const MANIFEST_IDS = new Set(['overview', 'journey']);
if (fs.existsSync(path.join(ROOT, 'js', 'manifest.js'))) {
  vm.runInContext(fs.readFileSync(path.join(ROOT, 'js', 'manifest.js'), 'utf8'), ctx);
  (TG.manifest && TG.manifest.order || []).forEach(id => MANIFEST_IDS.add(id));
}
TG.pageIds().forEach(id => MANIFEST_IDS.add(id));

/* ---------- helpers ---------- */
const SENT_SPLIT = /[.!?…]\s+/;
const wc = (s) => String(s).trim().split(/\s+/).filter(Boolean).length;

/* trường prose để lint — [loc, text, isSentence]
 * isSentence=false → chỉ luật 4/5 (nhãn/tên không phải câu). */
function proseFields(def) {
  const out = [];
  const add = (loc, t, isSent) => out.push([loc, t, isSent !== false]);
  if (def.fn && def.fn.text) add('fn.text', def.fn.text);
  (def.why && def.why.paras || []).forEach((t, i) => add(`why.paras[${i}]`, t));
  (def.how || []).forEach((s, i) => {
    if (s.name) add(`how[${i}].name`, s.name, false);
    (s.paras || []).forEach((t, j) => add(`how[${i}].paras[${j}]`, t));
    if (s.figure) {
      if (s.figure.caption) add(`how[${i}].figure.caption`, s.figure.caption);
      if (s.figure.alt) add(`how[${i}].figure.alt`, s.figure.alt, false);
    }
  });
  (def.limits || []).forEach((l, i) => l && l.text && add(`limits[${i}].text`, l.text));
  (def.figures || []).forEach((f, i) => {
    if (f.caption) add(`figures[${i}].caption`, f.caption);
    if (f.alt) add(`figures[${i}].alt`, f.alt, false);
  });
  (def.formulas || []).forEach((f, i) => f.note && add(`formulas[${i}]`, f.note));
  return out;
}

/* mọi row có kind+src: values/params/sources → luật 6+7 */
function kindedRows(def) {
  const out = [];
  (def.how || []).forEach((s, i) =>
    (s.values || []).forEach((v, j) => out.push([`how[${i}].values[${j}]`, v, 'src'])));
  (def.params || []).forEach((p, i) => out.push([`params[${i}]`, p, 'src']));
  (def.sources || []).forEach((s, i) => out.push([`sources[${i}]`, s, 'ref']));
  (def.formulas || []).forEach((f, i) => f.src && out.push([`formulas[${i}]`, f, 'src']));
  return out;
}

const INTERNAL_RE = /\b(?:N\d{1,2}|T[123])\b|\bccm:|\btc:/;
const TERM_RE = /\[\[([^\[\]]+)\]\]/g;

/* ---------- luật theo trang ---------- */
for (const def of defs) {
  const at = def.id || '(no-id)';
  // luật 1: schema
  const errs = TG.validatePage(def);
  errs.forEach(e => push('ERROR', 1, at, 'schema: ' + e));

  // luật 2+3+4+5 trên prose
  let stubWarns = 0;
  for (const [loc, text, isSent] of proseFields(def)) {
    const sentences = isSent ? String(text).split(SENT_SPLIT) : [];
    for (const s of sentences) {
      const t = s.trim();
      if (!t) continue;
      const n = wc(t);
      if (n > 45) push('ERROR', 2, `${at} ${loc}`, `câu ${n} từ >45: "${t.slice(0, 50)}…"`);
      else if (n > 30) push('WARN', 2, `${at} ${loc}`, `câu ${n} từ >30`);
      // luật 3: cụt — câu <4 từ không kết thúc dấu câu, hoặc → làm động từ
      const endsPunct = /[.!?…)\]"':;]+$/.test(t) || /…$/.test(t);
      const hasArrowVerb = /\w\s+→\s+\w/.test(t);
      if ((n < 4 && !endsPunct && !/^\d/.test(t)) || hasArrowVerb) {
        stubWarns++;
        push('WARN', 3, `${at} ${loc}`, `câu cụt/→: "${t.slice(0, 60)}"`);
      }
    }
    // luật 4: ký hiệu nội bộ
    let m = String(text).match(INTERNAL_RE);
    if (m) push('ERROR', 4, `${at} ${loc}`, `ký hiệu nội bộ "${m[0]}" ngoài sources`);
    // luật 5: [[Term]] phải có trong glossary
    TERM_RE.lastIndex = 0;
    while ((m = TERM_RE.exec(text))) {
      if (!TG.getTerm(m[1].trim())) {
        push('ERROR', 5, `${at} ${loc}`, `term "${m[1].trim()}" không trong glossary`);
      }
    }
  }
  if (stubWarns >= 3) push('ERROR', 3, at, `${stubWarns} câu cụt cùng trang`);

  // luật 6+7: số có nguồn / illustrative đánh dấu / src resolve
  for (const [loc, row, srcField] of kindedRows(def)) {
    if (!row || typeof row !== 'object') continue;
    const kind = row.kind;
    if (kind === 'illustrative') {
      const blob = [row.role, row.note, row.k, row.name].filter(Boolean).join(' ');
      if (!blob.includes('(minh họa)')) {
        push('ERROR', 6, `${at} ${loc}`, `kind=illustrative thiếu "(minh họa)" trong role/note/k`);
      }
    } else {
      const sv = row[srcField];
      if (sv == null || sv === '') {
        push('ERROR', 6, `${at} ${loc}`, `kind=${kind} thiếu ${srcField}`);
        continue;
      }
      const rr = resolveRef(sv, row.sym);
      if (!rr.ok) push('ERROR', 7, `${at} ${loc}`, rr.err);
    }
  }

  // luật 9 phần trang: id/order trùng (xử sau vòng lặp), prev/next
  ['prev', 'next'].forEach(k => {
    if (def[k] != null && !MANIFEST_IDS.has(def[k])) {
      push('ERROR', 9, at, `${k}="${def[k]}" không trỏ trang tồn tại`);
    }
  });
  if (def.id != null) {
    if (seenIds.has(def.id)) push('ERROR', 9, at, `id trùng với ${seenIds.get(def.id)}`);
    seenIds.set(def.id, at);
  }
  if (typeof def.order === 'number' && !String(def.id).startsWith('_')) {
    if (seenOrders.has(def.order)) {
      push('ERROR', 9, at, `order=${def.order} trùng với ${seenOrders.get(def.order)}`);
    }
    seenOrders.set(def.order, at);
  }

  // luật 10: figures tồn tại + ≤260KB + manifest origin
  const manifestPath = path.join(ROOT, 'assets', 'real', 'manifest.json');
  let figManifest = [];
  if (fs.existsSync(manifestPath)) {
    figManifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
  }
  const figList = (def.figures || []).map((f, i) => [`figures[${i}]`, f]);
  (def.how || []).forEach((s, i) => {
    if (s && s.figure) figList.push([`how[${i}].figure`, s.figure]);
  });
  for (const [floc, fig] of figList) {
    const loc = `${at} ${floc}`;
    if (!fig || !fig.src) continue;
    const fp = path.resolve(ROOT, fig.src);
    if (!fs.existsSync(fp)) {
      push('ERROR', 10, loc, `ảnh không tồn tại: ${fig.src}`);
      continue;
    }
    const kb = fs.statSync(fp).size / 1024;
    if (kb > 260) push('ERROR', 10, loc, `ảnh ${kb.toFixed(0)}KB > 260KB`);
    if (fig.src.startsWith('assets/real/')) {
      const hit = figManifest.find(e => e.file === path.basename(fig.src));
      if (!hit) push('ERROR', 10, loc, `${fig.src} không có entry trong manifest.json`);
      else if (fig.origin && hit.origin !== fig.origin) {
        push('WARN', 10, loc, `origin "${fig.origin}" ≠ manifest "${hit.origin}"`);
      }
    }
  }
}

/* luật 5b: mọi entry glossary đủ field + page trỏ trang thật */
for (const t of TG.allTerms ? TG.allTerms() : []) {
  ['vi', 'def', 'role', 'example', 'page'].forEach(f => {
    if (!t[f]) push('ERROR', 5, `glossary "${t.term}"`, `thiếu field ${f}`);
  });
  if (t.page && !MANIFEST_IDS.has(t.page)) {
    push('ERROR', 5, `glossary "${t.term}"`, `page="${t.page}" không phải id trang thật`);
  }
}

/* ---------- luật 8: CSS (chỉ file index.html thật sự nạp + --css thêm) ---------- */
let cssFiles = [];
const indexHtml = path.join(ROOT, 'index.html');
if (fs.existsSync(indexHtml)) {
  const html = fs.readFileSync(indexHtml, 'utf8');
  const re = /<link[^>]+href="([^"]+\.css)"/g;
  let m;
  while ((m = re.exec(html))) cssFiles.push(path.resolve(ROOT, m[1]));
}
cssFiles.push(...EXTRA_CSS.map(f => path.resolve(ROOT, f)));
const RE_RADIUS = /border-radius\s*:\s*([^;!}]+)/i;
const RADIUS_OK = /^0+(?:\.0+)?(?:px|em|rem|%)?$/; // cho phép 0 / 0px / 0% (kèm !important)
const RE_ITALIC = /font-style\s*:\s*(italic|oblique)/i;
const RE_BG = /background(?:-color)?\s*:\s*([^;}{]+)/gi;
const RE_HEX = /#([0-9a-f]{6}|[0-9a-f]{3})\b/gi;
const RE_RGB = /rgba?\((\d+)[,\s]+(\d+)[,\s]+(\d+)/gi;
function isCream(r, g, b) { return r > g && g > b && (r - b) >= 12 && r >= 235; }
function* bgColors(decl) {
  let m;
  RE_HEX.lastIndex = 0;
  while ((m = RE_HEX.exec(decl))) {
    let h = m[1];
    if (h.length === 3) h = h.split('').map(c => c + c).join('');
    yield [parseInt(h.slice(0, 2), 16), parseInt(h.slice(2, 4), 16), parseInt(h.slice(4, 6), 16), '#' + h];
  }
  RE_RGB.lastIndex = 0;
  while ((m = RE_RGB.exec(decl))) yield [+m[1], +m[2], +m[3], m[0]];
}
/* contrast đơn giản --text trên --bg */
function lum(r, g, b) {
  const f = (c) => { c /= 255; return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4); };
  return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b);
}
function contrast(a, b) {
  const la = lum(...a), lb = lum(...b);
  return (Math.max(la, lb) + 0.05) / (Math.min(la, lb) + 0.05);
}
for (const cf of cssFiles) {
  const rel = path.relative(ROOT, cf);
  if (!fs.existsSync(cf)) { push('ERROR', 8, rel, 'css không tồn tại'); continue; }
  const css = fs.readFileSync(cf, 'utf8');
  css.split('\n').forEach((line, i) => {
    const ln = `${rel}:${i + 1}`;
    let m;
    if ((m = line.match(RE_RADIUS))) {
      const val = m[1].replace(/!important\s*$/i, '').trim();
      const okAll = val.split(/\s+/).every(v => RADIUS_OK.test(v));
      if (!okAll) push('ERROR', 8, ln, `border-radius khác 0: "${m[0]}"`);
    }
    if ((m = line.match(RE_ITALIC))) push('ERROR', 8, ln, `font-style ${m[1]}`);
    RE_BG.lastIndex = 0;
    while ((m = RE_BG.exec(line))) {
      for (const [r, g, b, raw] of bgColors(m[1])) {
        if (isCream(r, g, b)) push('ERROR', 8, ln, `nền kem/vàng nhạt ${raw} (r>g>b, r-b>=12, r>=235)`);
      }
    }
  });
  /* contrast --text/--bg nếu file khai tokens */
  if (/tokens\.css$/.test(cf)) {
    const tok = (name) => {
      const m = css.match(new RegExp('--' + name + '\\s*:\\s*#([0-9a-f]{6})', 'i'));
      return m ? [parseInt(m[1].slice(0, 2), 16), parseInt(m[1].slice(2, 4), 16), parseInt(m[1].slice(4, 6), 16)] : null;
    };
    const tx = tok('text'), bg = tok('bg');
    if (tx && bg && contrast(tx, bg) < 4.5) {
      push('ERROR', 8, rel, `contrast --text/--bg = ${contrast(tx, bg).toFixed(2)} < 4.5`);
    }
  }
}

/* ---------- report ---------- */
let ne = 0, nw = 0;
for (const i of issues) {
  if (i.level === 'ERROR') ne++; else nw++;
  console.log(`${i.level}  luật${i.rule}  ${i.at}  ${i.msg}`);
}
console.log(`lint: ${defs.length} trang/defs, ${cssFiles.length} css — ${ne} ERROR, ${nw} WARN`);
process.exit(ne ? 1 : 0);
