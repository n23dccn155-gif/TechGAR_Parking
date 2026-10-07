// qa/lib/sources.mjs — resolve "src" refs về file thật dưới D:\TechGar2.
// Dạng src hợp lệ:
//   "path/to/file.py"            → file tồn tại
//   "path/to/file.py:123"        → file tồn tại, dòng 123 ≤ số dòng
//   "path/to/file.py:10-20"      → khoảng dòng, cả hai ≤ số dòng
//   "path/to/file.py:10-20,40-50"→ nhiều khoảng dòng, mọi khoảng hợp lệ
//   "path/to/file.py:--name"     → suffix không số = symbol → phải xuất hiện
//                                  trong file (không ràng dòng)
// Nếu row data có `sym` (chuỗi): sym phải xuất hiện trong ±5 dòng quanh dòng.
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..', '..');
// ROOT = D:\TechGar2 (qa/lib → qa → algo-web-v2 → TechGar2)
const SITE = path.join(ROOT, 'algo-web-v2'); // fallback cho src tương đối theo site

const RE = /^(.+?)(?::(\d[\d\s,\-]*|\D.*))?$/;

const _lineCache = new Map();
function _lines(absPath) {
  if (!_lineCache.has(absPath)) {
    _lineCache.set(absPath, fs.readFileSync(absPath, 'utf8').split('\n'));
  }
  return _lineCache.get(absPath);
}

/* _parseRanges("10-20,40") → [[10,20],[40,40]] | null khi không phải list số */
function _parseRanges(suffix) {
  const parts = String(suffix).split(',');
  const out = [];
  for (const raw of parts) {
    const p = raw.trim();
    const dm = p.match(/^(\d+)\s*-\s*(\d+)$/);
    if (dm) { out.push([+dm[1], +dm[2]]); continue; }
    if (/^\d+$/.test(p)) { out.push([+p, +p]); continue; }
    return null;
  }
  return out.length ? out : null;
}

/* parseRef("a.py:1-5") → {file:'a.py', ranges:[[1,5]], lo:1, hi:5, sym:null}
 *          ("a.py:--x") → {file:'a.py', ranges:null, lo:null, hi:null, sym:'--x'}
 *          ("a.py")     → {file:'a.py', ranges:null, lo:null, hi:null, sym:null} */
export function parseRef(src) {
  let s = String(src || '').trim();
  /* notation "file (Symbol)" → file + sym */
  let parenSym = null;
  const pm = s.match(/^(.*?)\s*\(([^()]+)\)\s*$/);
  if (pm && pm[1]) { s = pm[1].trim(); parenSym = pm[2].trim(); }
  const m = s.match(RE);
  if (!m) return null;
  const file = m[1].trim();
  const suffix = (m[2] || '').trim();
  const ranges = suffix ? _parseRanges(suffix) : null;
  const sym = parenSym || (suffix && !ranges ? suffix : null);
  if (!ranges) return { file, ranges: null, lo: null, hi: null, sym };
  const lo = Math.min(...ranges.map(r => r[0]));
  const hi = Math.max(...ranges.map(r => r[1]));
  return { file, ranges, lo, hi, sym };
}

/* resolveRef(src, sym?) → {ok:true, path} | {ok:false, err} */
export function resolveRef(src, sym) {
  const r = parseRef(src);
  if (!r || !r.file) return { ok: false, err: `src không parse được: ${JSON.stringify(src)}` };
  let abs = path.resolve(ROOT, r.file);
  if (!abs.startsWith(ROOT)) return { ok: false, err: `src ra ngoài repo: ${r.file}` };
  if (!fs.existsSync(abs)) {
    /* repo-relative không có → thử site-relative (file của chính algo-web-v2) */
    const alt = path.resolve(SITE, r.file);
    if (alt.startsWith(SITE) && fs.existsSync(alt) && fs.statSync(alt).isFile()) abs = alt;
    else return { ok: false, err: `file không tồn tại: ${r.file}` };
  }
  if (!fs.statSync(abs).isFile()) return { ok: false, err: `không phải file: ${r.file}` };
  const lines = _lines(abs);
  if (r.lo != null) {
    for (const [lo, hi] of r.ranges) {
      if (lo < 1 || lo > lines.length || hi > lines.length || hi < lo) {
        return { ok: false, err: `${r.file}: dòng ${lo}-${hi} quá ${lines.length} dòng` };
      }
    }
    // sym ±5 dòng quanh [min..max] của mọi range
    if (sym) {
      const from = Math.max(0, r.lo - 1 - 5), to = Math.min(lines.length, r.hi + 5);
      const win = lines.slice(from, to).join('\n');
      if (!win.includes(sym)) {
        return { ok: false, err: `${r.file}:${r.lo}-${r.hi} sym '${sym}' không trong ±5 dòng` };
      }
    }
  } else if (r.sym != null) {
    if (!lines.join('\n').includes(r.sym)) {
      return { ok: false, err: `${r.file}: sym '${r.sym}' không có trong file` };
    }
    if (sym) { /* sym của row + sym trong src: kiểm cả hai */ }
  }
  if (sym && r.lo == null && r.sym == null) {
    // sym nhưng src không có dòng → sym phải xuất hiện trong file
    if (!lines.join('\n').includes(sym)) {
      return { ok: false, err: `${r.file}: sym '${sym}' không có trong file` };
    }
  }
  return { ok: true, path: abs };
}

export const REPO_ROOT = ROOT;
