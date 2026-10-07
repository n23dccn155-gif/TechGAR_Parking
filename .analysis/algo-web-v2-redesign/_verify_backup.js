const fs = require("fs"), crypto = require("crypto"), path = require("path");
const lines = fs.readFileSync("backup-old-v2.sha256", "utf8").split(/\r?\n/).filter(Boolean);
let ok = 0, bad = [], miss = [];
for (const l of lines) {
  const i = l.indexOf("  ");
  const h = l.slice(0, i);
  const f = l.slice(i + 2).replace(/\\/g, "/");
  const p = path.join("backup-old-v2", f);
  if (!fs.existsSync(p)) { miss.push(f); continue; }
  const a = crypto.createHash("sha256").update(fs.readFileSync(p)).digest("hex").toUpperCase();
  a === h.toUpperCase() ? ok++ : bad.push(f);
}
console.log("manifest:", lines.length, "| OK:", ok, "| BAD:", bad.length, "| MISSING:", miss.length);
bad.slice(0, 10).forEach(f => console.log("BAD", f));
miss.slice(0, 10).forEach(f => console.log("MISS", f));
