// Owner-verifier cho identity pack (Builder B) — SPEC V2 §5.
// Chạy từ BẤT KỲ cwd nào:  node .analysis/algos-v2/_verify_identity_b.mjs
// Kiểm tra: contract node/scenario/frame, determinism, refs excerpt khớp file
// gốc, draw() không throw (ctx stub), và invariant fidelity (empty_votes 12,
// cost terms, claim score). KHÔNG dùng verifier của builder khác.
import { readFileSync, existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join, resolve } from "node:path";
import vm from "node:vm";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..");
const PACK = join(ROOT, "algo-web", "packs", "pipeline-identity.js");

let pass = 0, fail = 0;
const fails = [];
function ok(cond, name, detail) {
  if (cond) pass++;
  else { fail++; fails.push(name + (detail ? " — " + detail : "")); }
}
function approx(a, b, eps = 1e-3) { return Math.abs(a - b) <= eps; }

// ---- load pack (classic script → vm, window fallback = globalThis) ----
const code = readFileSync(PACK, "utf8");
vm.runInThisContext(code, { filename: "pipeline-identity.js" });
const packs = globalThis.TechGarPipelinePacks;
ok(packs && typeof packs === "object", "registry TechGarPipelinePacks tồn tại");
const nodes = packs && packs.identity;
ok(Array.isArray(nodes) && nodes.length === 3, "identity = 3 node", `got ${nodes && nodes.length}`);
const ids = (nodes || []).map((n) => n.id);
ok(JSON.stringify(ids) === JSON.stringify(["handoff", "slot-vision", "binder"]),
  "đúng 3 node id", JSON.stringify(ids));

const NODE_REQ = ["id", "title", "group", "summary", "answers", "refs", "pseudocode", "scenarios", "draw"];
const ANS_KEYS = ["does", "role", "where", "why"];

// ---- ctx stub: nuốt mọi call để phát hiện throw ----
function makeCtx() {
  const target = {};
  return new Proxy(target, {
    get(t, k) {
      if (k === "canvas") return { width: 1280, height: 720 };
      if (!(k in t)) t[k] = () => {};
      return t[k];
    },
    set(t, k, v) { t[k] = v; return true; },
  });
}

for (const node of nodes || []) {
  for (const k of NODE_REQ)
    ok(node[k] != null, `${node.id}: có field ${k}`);
  for (const k of ANS_KEYS)
    ok(node.answers && typeof node.answers[k] === "string" && node.answers[k].length > 10,
      `${node.id}: answers.${k} ngắn gọn, có nội dung`);
  ok(Array.isArray(node.pseudocode) && node.pseudocode.length >= 5 && node.pseudocode.length <= 10,
    `${node.id}: pseudocode 5-10 dòng`, `got ${node.pseudocode && node.pseudocode.length}`);
  ok(Array.isArray(node.scenarios) && node.scenarios.length >= 2,
    `${node.id}: ≥2 scenario`, `got ${node.scenarios && node.scenarios.length}`);
  ok(typeof node.draw === "function", `${node.id}: draw là function`);

  // ---- refs: file tồn tại + excerpt khớp source thật ----
  ok(Array.isArray(node.refs) && node.refs.length >= 3, `${node.id}: ≥3 refs`);
  for (const r of node.refs || []) {
    const abs = join(ROOT, r.path);
    ok(existsSync(abs), `${node.id}: ref file tồn tại`, r.path);
    if (!existsSync(abs)) continue;
    const lines = readFileSync(abs, "utf8").replace(/\r\n/g, "\n").split("\n");
    ok(r.line >= 1 && r.line <= lines.length, `${node.id}: ref line hợp lệ`, `${r.path}:${r.line}`);
    const n = r.excerpt.split("\n").length;
    const actual = lines.slice(r.excerptStart - 1, r.excerptStart - 1 + n).join("\n");
    ok(actual === r.excerpt, `${node.id}: excerpt khớp @${r.excerptStart} (${r.symbol})`,
      actual === r.excerpt ? "" : `source thực tế:\n${actual.slice(0, 300)}`);
  }

  // ---- scenarios/frames ----
  for (const sc of node.scenarios || []) {
    ok(typeof sc.build === "function", `${node.id}/${sc.id}: build là function`);
    const f1 = sc.build(), f2 = sc.build();
    ok(Array.isArray(f1) && f1.length >= 3, `${node.id}/${sc.id}: ≥3 frame`, `got ${f1.length}`);
    ok(JSON.stringify(f1) === JSON.stringify(f2), `${node.id}/${sc.id}: build deterministic`);
    f1.forEach((fr, i) => {
      const tag = `${node.id}/${sc.id}/f${i}`;
      ok(typeof fr.title === "string" && fr.title.length > 0, `${tag}: title`);
      ok(typeof fr.explanation === "string" && fr.explanation.length > 10, `${tag}: explanation`);
      ok(Array.isArray(fr.activeLines) && fr.activeLines.length > 0 &&
        fr.activeLines.every((l) => Number.isInteger(l) && l >= 0 && l < node.pseudocode.length),
        `${tag}: activeLines 0-based hợp lệ`);
      ok(fr.state && typeof fr.state === "object" && !Array.isArray(fr.state) && Object.keys(fr.state).length > 0,
        `${tag}: state non-empty`);
      ok(Number.isFinite(fr.durationMs) && fr.durationMs > 0, `${tag}: durationMs > 0`);
      ok(fr.scene && typeof fr.scene === "object", `${tag}: scene object`);
      // draw không throw ở 3 mốc progress
      for (const p of [0, 0.5, 1]) {
        try {
          node.draw(makeCtx(), fr, { width: 1280, height: 720, progress: p, time: 1.25, previous: i ? f1[i - 1] : null });
          ok(true, `${tag}: draw ok @${p}`);
        } catch (e) {
          ok(false, `${tag}: draw throw @${p}`, String(e && e.message || e));
        }
      }
    });
  }
}

// ---- fidelity invariants ----
const vision = nodes.find((n) => n.id === "slot-vision");
for (const sc of vision.scenarios) {
  sc.build().forEach((fr, i) => {
    const s = fr.scene, tag = `slot-vision/${sc.id}/f${i}`;
    if (s.ratios) {
      ok(s.ratios.length === 25, `${tag}: đúng 25 biến thể`);
      const ev = s.ratios.filter((r) => r < s.thr).length;
      ok(ev === s.emptyVotes, `${tag}: empty_votes recompute`, `${ev} != ${s.emptyVotes}`);
    }
    if (s.emptyVotes != null && s.required != null)
      ok(s.required === 12, `${tag}: required_votes = 25//2 = 12`);
    // verdict consistency: occupied ⇐ NOT (empty>=12 && !rescue && !edge)
    if (s.phase === "done" && s.verdict != null) {
      const computedOcc = !(s.emptyVotes >= 12 && !s.rescueUsed);
      ok((s.verdict === "occupied") === computedOcc, `${tag}: verdict khớp công thức vote+rescue`);
    }
  });
}

const handoff = nodes.find((n) => n.id === "handoff");
for (const sc of handoff.scenarios) {
  sc.build().forEach((fr, i) => {
    const s = fr.scene, tag = `handoff/${sc.id}/f${i}`;
    if (s.cand && s.cand.terms) {
      const sum = s.cand.terms.reduce((a, t) => a + t.c, 0);
      ok(approx(sum, s.cand.total), `${tag}: Σ terms = total`, `${sum} vs ${s.cand.total}`);
      s.cand.terms.forEach((t) => {
        ok(approx(t.c, t.w * t.v, 5e-3), `${tag}: term ${t.k} = w·v`, `${t.c} vs ${(t.w * t.v).toFixed(3)}`);
      });
    }
  });
}
// cost limit phải nhắc đúng 0.92/0.95 trong giải thích
const hoText = handoff.scenarios.flatMap((s) => s.build().map((f) => f.explanation + " " + f.title)).join(" ");
ok(/0\.92/.test(hoText) && /0\.95/.test(hoText), "handoff: nhắc cost_limit 0.92 (handoff) & 0.95 (dormant)");
ok(/histogram|gallery/i.test(hoText) && !/deep embedding|deep learning/i.test(hoText),
  "handoff: appearance = histogram gallery, không deep-ReID");

const binder = nodes.find((n) => n.id === "binder");
const claimFrame = binder.scenarios[0].build().find((f) => f.scene.claim && f.scene.claim.score);
if (claimFrame) {
  const t = claimFrame.scene.terms;
  const sc = t.reduce((a, x) => a + x.w * x.v, 0);
  ok(approx(sc, claimFrame.scene.claim.score, 0.02), "binder: claim score recompute",
    `${sc.toFixed(3)} vs ${claimFrame.scene.claim.score}`);
}
// SPEC §6 fidelity keywords
const allText = nodes.flatMap((n) => [n.answers.why, n.summary, ...n.scenarios.flatMap((s) => s.build().flatMap((f) => [f.title, f.explanation]))]).join(" ");
for (const kw of ["empty_votes", "occupied_seconds", "vision_primary", "homography", "lapjv", "departure", "episode"]) {
  ok(allText.toLowerCase().includes(kw.toLowerCase()), `fidelity: có nhắc '${kw}'`);
}
ok(!/13\s*\/\s*25/.test(allText), "fidelity: KHÔNG có '13/25'");
// occupied_votes chỉ được nhắc trong ngữ cảnh phủ định ("không có ...")
const ovIdx = allText.indexOf("occupied_votes");
ok(ovIdx < 0 || /không|no\s/.test(allText.slice(Math.max(0, ovIdx - 40), ovIdx)),
  "fidelity: 'occupied_votes' chỉ xuất hiện kèm phủ định");
// stationary_drift_ratio=0.10 (svb:220/:1446) — không nhầm với radius_ratio=0.06;
// quét cả source pack (label canvas) lẫn text hiển thị
ok(!/drift[^\n]{0,40}0\.06/.test(code + "\n" + allText), "fidelity: drift không gắn 0.06 (đó là radius)");
ok(/drift[^\n]{0,40}0\.10/.test(code + "\n" + allText), "fidelity: drift dùng 0.10·diag (stationary_drift_ratio)");

console.log(`\n=== identity pack verification (B) ===`);
console.log(`nodes: ${ids.join(", ")} · scenarios: ${nodes.reduce((a, n) => a + n.scenarios.length, 0)} · frames: ${nodes.reduce((a, n) => a + n.scenarios.reduce((b, s) => b + s.build().length, 0), 0)}`);
console.log(`PASS ${pass} / ${pass + fail}`);
if (fail) {
  console.log("\nFAIL:");
  fails.forEach((f) => console.log("  - " + f));
  process.exit(1);
}
console.log("All checks pass.");
