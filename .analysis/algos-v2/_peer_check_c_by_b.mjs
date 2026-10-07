// Peer-check C pack (builder B) — excerpt byte-match + structure + determinism.
// Chạy: node .analysis/algos-v2/_peer_check_c_by_b.mjs  (cwd-độc lập)
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, "../..");
const PACK = path.join(ROOT, "algo-web/packs/pipeline-system.js");
let pass = 0, fail = 0;
const ok = (c, m) => { if (c) { pass++; } else { fail++; console.log("FAIL:", m); } };

// ---- load pack with stub window/engine ----
const code = fs.readFileSync(PACK, "utf8");
const packFns = ["box","txt","mono","car","arrow","pill","glow","pulseDot","easeOut","ease","lerp"];
const stubH = Object.fromEntries(packFns.map((n) => [n, (...a) => n === "pulseDot" ? { x: 0, y: 0 } : undefined]));
const win = { TechGarPipelineEngine: { h: stubH }, TechGarPipelinePacks: {} };
new Function("window", code)(win);
const nodes = win.TechGarPipelinePacks.system;
ok(Array.isArray(nodes) && nodes.length === 4, "pack system = 4 node");
const ids = nodes.map((n) => n.id);
ok(JSON.stringify(ids) === JSON.stringify(["capture", "snapshot", "gate-session", "navigation"]),
  "node ids đúng: " + ids.join(","));

// ---- structure: answers/refs/pseudocode/scenarios/frames ----
for (const n of nodes) {
  for (const k of ["does", "role", "where", "why"]) ok(n.answers && n.answers[k], `${n.id}: answers.${k}`);
  ok(n.refs.length >= 3, `${n.id}: ≥3 refs (${n.refs.length})`);
  ok(n.pseudocode.length >= 5 && n.pseudocode.length <= 10, `${n.id}: pseudocode ${n.pseudocode.length} lines`);
  ok(n.scenarios.length >= 2, `${n.id}: ≥2 scenarios`);
  for (const s of n.scenarios) {
    const frames = s.build();
    ok(frames.length >= 3, `${n.id}/${s.id}: ${frames.length} frames`);
    frames.forEach((f, i) => {
      ok(f.title && f.explanation, `${n.id}/${s.id} f${i}: title+explanation`);
      ok(f.durationMs > 0, `${n.id}/${s.id} f${i}: durationMs>0`);
      ok(f.state && Object.keys(f.state).length > 0, `${n.id}/${s.id} f${i}: state non-empty`);
      ok(f.scene && typeof f.scene === "object", `${n.id}/${s.id} f${i}: scene object`);
      const mx = Math.max(...f.activeLines);
      ok(mx < n.pseudocode.length && Math.min(...f.activeLines) >= 0,
        `${n.id}/${s.id} f${i}: activeLines trong bounds`);
    });
    // determinism: build() twice → identical frames
    ok(JSON.stringify(s.build()) === JSON.stringify(s.build()), `${n.id}/${s.id}: deterministic`);
  }
}

// ---- excerpt byte-match vs source ----
const norm = (t) => t.replace(/\r\n/g, "\n");
for (const n of nodes) {
  for (const r of n.refs) {
    const fp = path.join(ROOT, r.path);
    ok(fs.existsSync(fp), `${n.id}: file tồn tại ${r.path}`);
    if (!fs.existsSync(fp)) continue;
    const lines = norm(fs.readFileSync(fp, "utf8")).split("\n");
    const window_ = lines.slice(r.excerptStart - 1, r.excerptStart - 1 + r.excerpt.split("\n").length + 8).join("\n");
    ok(window_.includes(r.excerpt.trimEnd()), `${n.id} excerpt khớp ${r.path}:${r.excerptStart}`);
  }
}

// ---- draw() no-throw qua ctx stub ----
const ctxStub = new Proxy({}, { get: (t, p) => (p === "canvas" ? {} : () => {}), set: () => true });
for (const n of nodes) {
  for (const s of n.scenarios) {
    for (const [i, f] of s.build().entries()) {
      try { n.draw(ctxStub, f, { width: 960, height: 540, progress: 0.5, time: 1.2 }); pass++; }
      catch (e) { fail++; console.log(`FAIL draw ${n.id}/${s.id} f${i}:`, e.message); }
    }
  }
}

// ================= consistency checks (strengthened, closing) =================

// ---- capture: skew derive ↔ state/verdict/pill nhất quán (recompute, không hardcode) ----
const cap = nodes.find((n) => n.id === "capture");
const SKEW_LIMIT = 120; // --max-camera-skew-ms default 120.0 (two_camera.py:1997)
for (const sc of cap.scenarios) {
  sc.build().forEach((f, i) => {
    const tag = `capture/${sc.id}/f${i}`;
    const s = f.scene;
    if (!s || s.tA == null || s.tB == null) return;
    const skew = Math.round(Math.abs(s.tA - s.tB) * 1000);
    if (f.state && f.state.skew_ms != null) {
      ok(f.state.skew_ms === skew, `${tag}: state.skew_ms=${f.state.skew_ms} khớp |tA−tB|=${skew}ms`);
    }
    const within = skew <= SKEW_LIMIT;
    if (s.verdict) {
      ok(s.verdictOk === within, `${tag}: pill '${s.verdict}' ok=${s.verdictOk} vs skew ${skew}ms ${within ? "≤" : ">"}120`);
    }
    if (s.pair === true) ok(within, `${tag}: pair=true đòi skew ≤120 (có ${skew})`);
    for (const v of Object.values(f.state || {})) {
      const m = String(v).match(/t=(\d+\.\d+)/);
      if (m) {
        const tv = parseFloat(m[1]);
        const matchClock = [s.tA, s.tB, s.catchupFrom].filter((x) => x != null).some((x) => Math.abs(tv - x) < 0.0005);
        ok(matchClock, `${tag}: state clock '${v}' khớp scene tA/tB/catchupFrom`);
      }
    }
    if (s.catchupFrom != null) {
      ok(s.catchupFrom < s.tB && s.catchup === true, `${tag}: catchupFrom ${s.catchupFrom} < tB ${s.tB} & flag`);
    }
    if (/skew/i.test(f.title + " " + f.explanation)) {
      const nums = [...(f.title + " " + f.explanation).matchAll(/(\d+)\s*ms/g)].map((m) => +m[1]);
      for (const c of nums) {
        ok(c === skew || c === SKEW_LIMIT, `${tag}: '${c}ms' trong text là skew thật ${skew} hoặc ngưỡng 120`);
      }
    }
  });
}
ok(cap.scenarios.every((sc) => sc.build().some((f) => /120/.test(f.explanation + JSON.stringify(f.state || {})))),
  "capture: mọi scenario nhắc ngưỡng 120ms");

// ---- snapshot: freshness (_fresh_live ≤5s) + mailbox latest-only ----
const snap = nodes.find((n) => n.id === "snapshot");
let sawFresh = false;
for (const sc of snap.scenarios) {
  sc.build().forEach((f, i) => {
    const tag = `snapshot/${sc.id}/f${i}`;
    const s = f.scene || {};
    if (s.stale) {
      sawFresh = true;
      ok(f.state && f.state.age_ms > 5000, `${tag}: stale → state.age_ms ${f.state && f.state.age_ms} > 5000`);
      ok(/_fresh_live|5000|5s/.test(f.explanation), `${tag}: stale explanation nhắc _fresh_live/5s`);
    }
    if (s.dropped != null) ok(Number.isInteger(s.dropped) && s.dropped >= 0, `${tag}: dropped int ≥0 (${s.dropped})`);
  });
}
ok(sawFresh, "snapshot: coverage _fresh_live/stale hiện diện");

// ---- gate-session: state whitelist + QR/quirk + journey order ----
const gate = nodes.find((n) => n.id === "gate-session");
const SESS_STATES = new Set(["WAITING_FOR_SCAN", "SELECTING_SPOT", "NAVIGATING_TO_SPOT", "RELOCATING", "PARKED", "EXIT_NAVIGATION", "EXITED"]);
for (const sc of gate.scenarios) {
  sc.build().forEach((f, i) => {
    const tag = `gate/${sc.id}/f${i}`;
    const se = f.scene.session;
    if (se && se.state) ok(SESS_STATES.has(se.state), `${tag}: session.state '${se.state}' ∈ states thật`);
    ok(!/CLAIMED/.test(f.title + f.explanation + JSON.stringify(f.state || {}) + (se && se.state || "")),
      `${tag}: không có CLAIMED`);
    if (se && se.qrPct != null) ok(se.qrPct >= 0 && se.qrPct <= 1, `${tag}: qrPct ∈[0,1] (${se.qrPct})`);
  });
}
const qrSc = gate.scenarios.find((s) => s.id === "qr-expiry");
ok(qrSc && qrSc.build().some((f) => f.scene.session && f.scene.session.state === "SELECTING_SPOT" && f.scene.session.qr === false),
  "gate/qr-expiry: claim sau ẩn QR → SELECTING_SPOT thật (không CLAIMED)");
const life = gate.scenarios.find((s) => s.id === "lifecycle").build();
const epIdx = life.findIndex((f) => /episode/i.test(f.title + " " + f.explanation));
const parkedIdx = life.findIndex((f) => f.scene.session && f.scene.session.state === "PARKED");
ok(epIdx >= 0 && epIdx === parkedIdx, "gate/lifecycle: PARKED đến đúng frame episode (authoritative)");
const lastF = life[life.length - 1];
ok(lastF.scene.deleted === true && /exit|xoá/i.test(lastF.title + " " + lastF.explanation),
  "gate/lifecycle: kết thúc = exit crossing → session deleted");

// ---- navigation: thresholds 75/80 + graph + two-way ----
const nav = nodes.find((n) => n.id === "navigation");
const navTxt = nav.scenarios.flatMap((s) => s.build().flatMap((f) => [f.title, f.explanation, JSON.stringify(f.state || {})])).join(" ");
ok(/80/.test(navTxt) && /75/.test(navTxt), "nav: nhắc cả callsite 80px lẫn engine default 75px");
ok(/two-?way|hai (?:chiều|đầu)/i.test(navTxt + " " + nav.answers.why), "nav: two-way edge được giải thích");
for (const sc of nav.scenarios) {
  sc.build().forEach((f, i) => {
    if (f.scene.route) ok(f.scene.route.every((r) => /^N\d$/.test(r)), `nav/${sc.id}/f${i}: route nodes hợp lệ (graph minh họa)`);
    if (f.scene.offroute) ok(/80|lệch/.test(f.explanation + JSON.stringify(f.state || {})), `nav/${sc.id}/f${i}: offroute frame nhắc ngưỡng`);
  });
}

// ---- toàn pack: không state rác ----
for (const n of nodes) {
  for (const sc of n.scenarios) {
    sc.build().forEach((f, i) => {
      const blob = JSON.stringify(f.state || {});
      ok(!/undefined|NaN|\"null\"/.test(blob), `${n.id}/${sc.id}/f${i}: state không chứa undefined/NaN/null`);
    });
  }
}

console.log(`\n=== peer-check C (by B) ===`);
console.log(`nodes: ${ids.join(", ")} · scenarios: ${nodes.reduce((a, n) => a + n.scenarios.length, 0)} · frames: ${nodes.reduce((a, n) => a + n.scenarios.reduce((b, s) => b + s.build().length, 0), 0)}`);
console.log(`PASS ${pass} / ${pass + fail}`);
process.exit(fail ? 1 : 0);
