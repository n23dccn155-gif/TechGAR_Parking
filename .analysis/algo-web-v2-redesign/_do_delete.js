const fs = require("fs"), path = require("path");
const ROOT = "algo-web-v2";
const txt = fs.readFileSync(".analysis/algo-web-v2-redesign/DELETE-LIST.txt", "utf8").split(/\r?\n/);
const secA = txt.slice(txt.findIndex(l => l.startsWith("=== A.")), txt.findIndex(l => l.startsWith("=== B.")))
  .filter(l => l && !l.startsWith("==="));
const secB = txt.slice(txt.findIndex(l => l.startsWith("=== B.")), txt.findIndex(l => l.startsWith("=== C.")))
  .filter(l => l && !l.startsWith("===")).map(l => l.trim().split(/\s+/)[0]);
const targets = [...secA.map(s => s.trim()), ...secB];
console.log("targets:", targets.length, "(A:", secA.length, "+ B:", secB.length, ")");
let del = 0, missing = [], outside = [];
for (const rel of targets) {
  if (!rel || rel.includes("..") || path.isAbsolute(rel)) { outside.push(rel); continue; }
  const p = path.join(ROOT, rel);
  if (!fs.existsSync(p)) { missing.push(rel); continue; }
  const st = fs.statSync(p);
  if (st.isDirectory()) { outside.push(rel + " (is dir — skip)"); continue; }
  fs.unlinkSync(p); del++;
}
console.log("deleted:", del, "| missing:", missing.length, "| skipped:", outside.length);
missing.slice(0, 10).forEach(f => console.log("  MISS", f));
outside.slice(0, 10).forEach(f => console.log("  SKIP", f));
// dọn thư mục rỗng (bottom-up)
let removed = 0, again = true;
while (again) {
  again = false;
  const walk = d => {
    for (const e of fs.readdirSync(d, { withFileTypes: true })) {
      if (e.isDirectory()) { walk(path.join(d, e.name)); }
    }
    if (d !== ROOT && fs.readdirSync(d).length === 0) { fs.rmdirSync(d); removed++; again = true; }
  };
  walk(ROOT);
}
console.log("empty dirs removed:", removed);
