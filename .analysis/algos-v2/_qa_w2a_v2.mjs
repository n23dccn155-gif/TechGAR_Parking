/* QA W2 v2 cho pages A — file:// + addScriptTag (index.html giữ nguyên, C owns).
 * Asserts: mount, 0 console/page errors, play/pause, next/prev, reset, scrub,
 * speed, scenario selector (nếu có), determinism (canvas hash step0 sau reset),
 * mid/final screenshot khác initial.
 * Chạy: node .analysis/algos-v2/_qa_w2a_v2.mjs [ids...] [--1440]
 * Shots: algo-web-v2/qa/shots/a/<id>-s{0,2,4}[-1440].png
 */
import { createRequire } from "module";
import { fileURLToPath, pathToFileURL } from "url";
import path from "path";
import fs from "fs";
import crypto from "crypto";

const require = createRequire("D:/TechGar2/frontend/package.json");
const { chromium } = require("@playwright/test");

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const appDir = path.join(root, "algo-web-v2");
const shotsDir = path.join(appDir, "qa", "shots", "a");
fs.mkdirSync(shotsDir, { recursive: true });

const argv = process.argv.slice(2);
const hi = argv.includes("--1440");
const ids = argv.filter((a) => !a.startsWith("--"));
const ALL = ids.length ? ids : [
  "roi", "motion", "kalman", "coasting", "assignment",
  "brightness", "shadow", "echo", "track-lifecycle", "occlusion", "routing",
];
const T1 = ["roi", "motion", "kalman", "coasting", "assignment"];
const suffix = hi ? "-1440" : "";

const FILES = (id) => [`js/content/${id}.js`, `js/pages/${id}.js`];

const browser = await chromium.launch();
const errors = [];
const page = await browser.newPage({ viewport: hi ? { width: 1440, height: 900 } : { width: 1280, height: 720 } });
page.on("console", (m) => { if (m.type() === "error") errors.push(m.text()); });
page.on("pageerror", (e) => errors.push("PAGEERROR: " + e.message));

await page.goto(pathToFileURL(path.join(appDir, "index.html")).href);
await page.waitForTimeout(400);

for (const id of ALL) {
  for (const f of FILES(id)) await page.addScriptTag({ path: path.join(appDir, f) });
}
await page.waitForTimeout(300);

const results = [];
const canvasHash = () => page.evaluate(() => {
  const cv = document.querySelector(".tg-stage canvas");
  return cv ? cv.toDataURL().length + ":" + cv.toDataURL().slice(-64) : "no-canvas";
});
const stepLabel = () => page.evaluate(() =>
  (document.querySelector(".tg-step-label") || {}).textContent || "none");
const blurActive = () => page.evaluate(() => {
  if (document.activeElement && document.activeElement.blur) document.activeElement.blur();
});
/* seek deterministic qua scrub + CHỜ label đúng target trước khi shot */
const seek = async (v) => {
  await blurActive();
  await page.evaluate((val) => {
    const s = document.querySelector("input.tg-scrub");
    s.value = val; s.dispatchEvent(new Event("input", { bubbles: true }));
  }, v);
  await page.waitForFunction(
    (t) => ((document.querySelector(".tg-step-label") || {}).textContent || "").startsWith(t + "/"),
    v, { timeout: 3000 });
  await page.waitForTimeout(220); /* render ổn định */
};
const shot = async (id, tag) =>
  page.screenshot({ path: path.join(shotsDir, `${id}-${tag}${suffix}.png`) });

for (const id of ALL) {
  const a = { id, checks: {}, ok: true };
  const check = (name, cond, extra) => {
    a.checks[name] = cond ? "PASS" : ("FAIL" + (extra ? " " + extra : ""));
    if (!cond) a.ok = false;
  };
  try {
    await page.evaluate((pid) => { location.hash = "#/algo/" + pid; }, id);
    await page.waitForTimeout(600);

    /* 1. mount + step0 */
    const mounted = await page.evaluate(() => !!document.querySelector(".tg-stage canvas"));
    check("mount", mounted);
    check("step0", (await stepLabel()).startsWith("0/"), await stepLabel());
    const h0 = await canvasHash();
    const maxStep = await page.evaluate(() =>
      +(document.querySelector("input.tg-scrub") || { max: 4 }).max);
    const mid = Math.min(2, maxStep), fin = maxStep;
    await shot(id, "s0");

    /* 2. next/prev */
    await page.click('button[title="Bước sau (→)"]'); await page.waitForTimeout(150);
    check("next", (await stepLabel()).startsWith("1/"), await stepLabel());
    await page.click('button[title="Bước trước (←)"]'); await page.waitForTimeout(150);
    check("prev", (await stepLabel()).startsWith("0/"), await stepLabel());

    /* 3. scrub */
    await seek(mid);
    check("scrub", (await stepLabel()).startsWith(mid + "/"), await stepLabel());

    /* 4. reset */
    await page.click('button[title="Reset"]'); await page.waitForTimeout(200);
    check("reset", (await stepLabel()).startsWith("0/"), await stepLabel());

    /* 5. determinism: step0 canvas hash giống hệt sau reset */
    check("determinism", (await canvasHash()) === h0, "hash đổi sau reset");

    /* 6. speed: chọn ×4 rồi play — step tiến nhanh */
    await page.selectOption("select.tg-speed", "4");
    await page.waitForTimeout(100);
    const spd = await page.evaluate(() => document.querySelector("select.tg-speed").value);
    check("speed", spd === "4", spd);

    /* 7. play/pause */
    await page.click('button[title="Play/Pause (Space)"]');
    await page.waitForTimeout(900); /* ~3 step @stepMs/4 */
    const afterPlay = await stepLabel();
    check("play", !afterPlay.startsWith("0/") && !afterPlay.endsWith("none"), afterPlay);
    const pauseIcon = await page.evaluate(() =>
      (document.querySelector('button[title="Play/Pause (Space)"]') || {}).textContent);
    check("pause-icon", pauseIcon === "⏸", pauseIcon);
    await page.click('button[title="Play/Pause (Space)"]'); /* pause */
    await page.waitForTimeout(150);
    const lblA = await stepLabel();
    await page.waitForTimeout(700);
    check("pause-freeze", (await stepLabel()) === lblA, lblA + "→" + (await stepLabel()));

    /* 8. scenario selector (nếu có) */
    const hasSel = await page.evaluate(() =>
      !!document.querySelector(".tg-scenario-sel select"));
    if (hasSel) {
      await seek(fin);
      const hA = await canvasHash();
      await page.evaluate(() => {
        const s = document.querySelector(".tg-scenario-sel select");
        s.selectedIndex = 1; s.dispatchEvent(new Event("change", { bubbles: true }));
      });
      await page.waitForTimeout(250);
      check("scenario", (await canvasHash()) !== hA, "canvas không đổi khi đổi kịch bản");
      await page.evaluate(() => {
        const s = document.querySelector(".tg-scenario-sel select");
        s.selectedIndex = 0; s.dispatchEvent(new Event("change", { bubbles: true }));
      });
      await page.waitForTimeout(150);
    } else check("scenario", "skip", "");
    a.checks["scenario-present"] = hasSel ? "yes" : "no";

    /* 9. mid/final shots — assert label ĐÚNG target trước khi chụp */
    await seek(mid);
    check("mid-at", (await stepLabel()).startsWith(mid + "/"), await stepLabel());
    const hMid = await canvasHash();
    check("mid-diff", hMid !== h0, "mid giống s0");
    await shot(id, "s2");
    await seek(fin);
    check("final-at", (await stepLabel()).startsWith(fin + "/"), await stepLabel());
    check("final-diff", (await canvasHash()) !== hMid, "final giống mid");
    await shot(id, "s4");

    /* 10. destroy/re-nav: đi qua page kế tiếp đã được exercise bởi vòng lặp */
  } catch (e) {
    a.ok = false; a.checks.exception = e.message.slice(0, 200);
  }
  results.push(a);
  console.log(`${a.ok ? "PASS" : "FAIL"} ${id}`, JSON.stringify(a.checks));
}

/* re-nav smoke: quay lại page đầu — destroy path */
await page.evaluate((pid) => { location.hash = "#/algo/" + pid; }, ALL[0]);
await page.waitForTimeout(500);
const remount = await page.evaluate(() => !!document.querySelector(".tg-stage canvas"));
console.log("re-nav remount:", remount ? "PASS" : "FAIL");

console.log("CONSOLE/PAGE ERRORS:", errors.length ? errors : "none");
const fails = results.filter((r) => !r.ok);
console.log(`SUMMARY: ${results.length - fails.length}/${results.length} pages all-checks-pass${fails.length ? " — FAIL: " + fails.map((r) => r.id).join(",") : ""}`);
await browser.close();
process.exit(fails.length || errors.length ? 1 : 0);
