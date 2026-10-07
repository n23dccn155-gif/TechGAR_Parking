#!/usr/bin/env node
/* build-values.mjs — Task 11: sinh js/quickvalues-data.js từ params[] của mọi trang
 * mà index.html nạp. Mỗi dòng: {name, value, kind, src, page}.
 * EXTRAS giữ giá trị thủ công hợp lệ không nằm trong params[] (ví dụ descriptor length).
 * Chạy: node qa/build-values.mjs   (tự động chạy lại khi trang thêm params)
 */
import { readFileSync, writeFileSync, readdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const INDEX = join(ROOT, "index.html");
const OUT = join(ROOT, "js", "quickvalues-data.js");

/* Giá trị curated không có trong params[] nhưng đáng giữ (user/author-added). */
const EXTRAS = [
  { name: "descriptor length", value: "416", kind: "class-default", src: "backend/main_detect/src/techgar/tracklet_descriptor.py:61", page: "tracklet-descriptor" }
];

/* Trang được index.html nạp, theo đúng thứ tự script tag. */
const html = readFileSync(INDEX, "utf8");
const pageFiles = [...html.matchAll(/js\/pages\/([a-z0-9_-]+)\.js/gi)].map((m) => m[1]);

const rows = [];
const seen = new Set();
const push = (r) => {
  const key = (r.name + "|" + r.page).toLowerCase();
  if (seen.has(key)) return;
  seen.add(key);
  rows.push(r);
};

for (const slug of pageFiles) {
  if (slug === "_fixture") continue;
  const file = join(ROOT, "js", "pages", slug + ".js");
  const src = readFileSync(file, "utf8");
  let def = null;
  const TG = { definePage: (d) => { def = d; } };
  try {
    new Function("TG", "window", src)(TG, { TG });
  } catch (e) {
    console.error(`SKIP ${slug}: ${e.message}`);
    continue;
  }
  if (!def || !Array.isArray(def.params)) continue;
  for (const p of def.params) {
    push({ name: p.name, value: String(p.value), kind: p.kind, src: p.src, page: def.id });
  }
}
for (const r of EXTRAS) push(r);

const line = (r) =>
  `    { name: ${JSON.stringify(r.name)}, value: ${JSON.stringify(r.value)}, kind: ${JSON.stringify(r.kind)}, src: ${JSON.stringify(r.src)}, page: ${JSON.stringify(r.page)} }`;

const out = `/* quickvalues-data.js — bảng số liệu tra nhanh qua TG.defineQuickValues.
 * GENERATED bởi qa/build-values.mjs từ params[] của mọi trang (Task 11).
 * Không sửa tay — thêm giá trị vào params[] của trang hoặc EXTRAS trong script.
 * Mỗi entry: {name, value, kind, src, page}.
 */
(function () {
  "use strict";
  var TG = (window.TG = window.TG || {});

  TG.defineQuickValues([
${rows.map(line).join(",\n")}
  ]);
})();
`;
writeFileSync(OUT, out);
console.log(`quickvalues: ${rows.length} rows từ ${pageFiles.length} trang (+${EXTRAS.length} extras)`);
