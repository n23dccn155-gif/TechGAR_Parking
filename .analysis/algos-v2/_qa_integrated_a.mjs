/* Integrated QA — A-owned 12 pages TRÊN index.html thật (KHÔNG addScriptTag).
 * Chạy: node .analysis/algos-v2/_qa_integrated_a.mjs [--1440]
 * Assert: mount + step0 + controls + determinism + scenario + shots đúng bước.
 */
import { createRequire } from "module";
import { fileURLToPath, pathToFileURL } from "url";
import path from "path";
import fs from "fs";

const require = createRequire("D:/TechGar2/frontend/package.json");
const { chromium } = require("@playwright/test");

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const appDir = path.join(root, "algo-web-v2");
const shotsDir = path.join(appDir, "qa", "shots", "a", "integrated");
fs.mkdirSync(shotsDir, { recursive: true });

const argv = process.argv.slice(2);
const hi = argv.includes("--1440");
const ids = argv.filter((a) => !a.startsWith("--"));
const suffix = hi ? "-1440" : "";
const ALL = ids.length ? ids : [
  "roi", "motion", "kalman", "coasting", "assignment",
  "brightness", "shadow", "echo", "track-lifecycle", "occlusion", "routing", "ensemble",
];

const browser = await chromium.launch();
const errors = [];
const page = await browser.newPage({ viewport: hi ? { width: 1440, height: 900 } : { width: 1280, height: 720 } });
page.on("console", (m) => { if (m.type() === "error") errors.push(m.text()); });
page.on("pageerror", (e) => errors.push("PAGEERROR: " + e.message));
page.on("requestfailed", (r) => errors.push("REQFAIL: " + r.url()));

await page.goto(pathToFileURL(path.join(appDir, "index.html")).href);
await page.waitForTimeout(600);

const canvasHash = () => page.evaluate(() => {
  const cv = document.querySelector(".tg-stage canvas");
  return cv ? cv.toDataURL().length + ":" + cv.toDataURL().slice(-64) : "no-canvas";
});
const stepLabel = () => page.evaluate(() =>
  (document.querySelector(".tg-step-label") || {}).textContent || "none");
const blurActive = () => page.evaluate(() => {
  if (document.activeElement && document.activeElement.blur) document.activeElement.blur();
});
const seek = async (v) => {
  await blurActive();
  await page.evaluate((val) => {
    const s = document.querySelector("input.tg-scrub");
    s.value = val; s.dispatchEvent(new Event("input", { bubbles: true }));
  }, v);
  await page.waitForFunction(
    (t) => ((document.querySelector(".tg-step-label") || {}).textContent || "").startsWith(t + "/"),
    v, { timeout: 3000 });
  await page.waitForTimeout(220);
};
const shot = async (id, tag) =>
  page.screenshot({ path: path.join(shotsDir, `${id}-${tag}${suffix}.png`) });

const results = [];
for (const id of ALL) {
  const a = { id, checks: {}, ok: true };
  const check = (name, cond, extra) => {
    a.checks[name] = cond ? "PASS" : ("FAIL" + (extra ? " " + extra : ""));
    if (!cond) a.ok = false;
  };
  try {
    await page.evaluate((pid) => { location.hash = "#/algo/" + pid; }, id);
    await page.waitForTimeout(600);

    const mounted = await page.evaluate(() => !!document.querySelector(".tg-stage canvas"));
    check("mount", mounted);
    check("step0", (await stepLabel()).startsWith("0/"), await stepLabel());
    const h0 = await canvasHash();
    const maxStep = await page.evaluate(() =>
      +(document.querySelector("input.tg-scrub") || { max: 4 }).max);
    const mid = Math.min(2, maxStep), fin = maxStep;
    await shot(id, "s0");

    /* fourBlocks trước Deep (DOM order) */
    check("four-before-deep", await page.evaluate(() => {
      const four = document.querySelector(".tg-four");
      const deep = [...document.querySelectorAll("summary,details")]
        .find((e) => /Deep/.test(e.textContent || ""));
      return !!(four && deep && (four.compareDocumentPosition(deep) & Node.DOCUMENT_POSITION_FOLLOWING));
    }));

    await page.click('button[title="Bước sau (→)"]'); await page.waitForTimeout(150);
    check("next", (await stepLabel()).startsWith("1/"), await stepLabel());
    await page.click('button[title="Bước trước (←)"]'); await page.waitForTimeout(150);
    check("prev", (await stepLabel()).startsWith("0/"), await stepLabel());

    await seek(mid);
    check("scrub", (await stepLabel()).startsWith(mid + "/"), await stepLabel());

    await page.click('button[title="Reset"]'); await page.waitForTimeout(200);
    check("reset", (await stepLabel()).startsWith("0/"), await stepLabel());
    check("determinism", (await canvasHash()) === h0, "hash đổi sau reset");

    await page.selectOption("select.tg-speed", "4");
    const spd = await page.evaluate(() => document.querySelector("select.tg-speed").value);
    check("speed", spd === "4", spd);

    await page.click('button[title="Play/Pause (Space)"]');
    await page.waitForTimeout(900);
    const afterPlay = await stepLabel();
    check("play", !afterPlay.startsWith("0/"), afterPlay);
    check("pause-icon", (await page.evaluate(() =>
      (document.querySelector('button[title="Play/Pause (Space)"]') || {}).textContent)) === "⏸");
    await page.click('button[title="Play/Pause (Space)"]');
    await page.waitForTimeout(150);
    const lblA = await stepLabel();
    await page.waitForTimeout(700);
    check("pause-freeze", (await stepLabel()) === lblA);

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
      check("scenario", (await canvasHash()) !== hA, "canvas không đổi");
      await page.evaluate(() => {
        const s = document.querySelector(".tg-scenario-sel select");
        s.selectedIndex = 0; s.dispatchEvent(new Event("change", { bubbles: true }));
      });
      await page.waitForTimeout(150);
    } else a.checks["scenario"] = "no-selector";

    await seek(mid);
    check("mid-at", (await stepLabel()).startsWith(mid + "/"), await stepLabel());
    const hMid = await canvasHash();
    check("mid-diff", hMid !== h0);
    await shot(id, "s2");
    await seek(fin);
    check("final-at", (await stepLabel()).startsWith(fin + "/"), await stepLabel());
    check("final-diff", (await canvasHash()) !== hMid);
    await shot(id, "s4");
  } catch (e) {
    a.ok = false; a.checks.exception = e.message.slice(0, 200);
  }
  results.push(a);
  console.log(`${a.ok ? "PASS" : "FAIL"} ${id}`, JSON.stringify(a.checks));
}

/* re-nav remount */
await page.evaluate((pid) => { location.hash = "#/algo/" + pid; }, ALL[0]);
await page.waitForTimeout(500);
console.log("re-nav remount:", await page.evaluate(() => !!document.querySelector(".tg-stage canvas")) ? "PASS" : "FAIL");

console.log("CONSOLE/PAGE/REQ ERRORS:", errors.length ? errors : "none");
const fails = results.filter((r) => !r.ok);
console.log(`SUMMARY: ${results.length - fails.length}/${results.length} integrated${fails.length ? " — FAIL: " + fails.map((r) => r.id).join(",") : ""}`);
await browser.close();
process.exit(fails.length || errors.length ? 1 : 0);
