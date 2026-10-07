const fs = require("fs"), path = require("path"), crypto = require("crypto");
function walk(dir, base, out) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) walk(p, base, out);
    else out.push(path.relative(base, p).split(path.sep).join("/"));
  }
  return out;
}
const BAK = ".analysis/algo-web-v2-redesign/backup-old-v2", CUR = "algo-web-v2";
const bak = walk(BAK, BAK, []), cur = walk(CUR, CUR, []);
const bakSet = new Set(bak);
const sha = p => crypto.createHash("sha256").update(fs.readFileSync(p)).digest("hex");
let identical = [], overwritten = [], gone = [], neu = [];
for (const f of bak) {
  const c = path.join(CUR, f);
  if (!fs.existsSync(c)) { gone.push(f); continue; }
  (sha(path.join(BAK, f)) === sha(c) ? identical : overwritten).push(f);
}
neu = cur.filter(f => !bakSet.has(f));
console.log("identical leftovers (DELETE):", identical.length);
identical.sort().forEach(f => console.log("  " + f));
console.log("overwritten at same path (KEEP - new site):", overwritten.length);
overwritten.sort().forEach(f => console.log("  " + f));
console.log("in backup but already gone:", gone.length);
console.log("new files:", neu.length);
