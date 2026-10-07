/* Journey QA — trang __journey TRÊN index.html thật (KHÔNG addScriptTag).
 * Chạy: node .analysis/algos-v2/_qa_journey_a.mjs [--1440]
 * Assert: mount + step0 + controls + determinism + shots s0/s5/s9 đúng bước
 * + HUD đổi theo step + node-strip highlight đổi theo step.
 */
import { createRequire } from "module";
import { fileURLToPath, pathToFileURL } from "url";
import path from "path";
import fs from "fs";

const require = createRequire("D:/TechGar2/frontend/package.json");
const { chromium } = require("@playwright/test");

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const appDir = path.join(root, "algo-web-v2");
const shotsDir = path.join(appDir, "qa", "shots", "a", "journey");
fs.mkdirSync(shotsDir, { recursive: true });

const hi = process.argv.includes("--1440");
const suffix = hi ? "-1440" : "";

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
const hudText = () => page.evaluate(() =>
  [...document.querySelectorAll(".tg-hud-cell")].map((c) => c.textContent).join("|"));
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
const shot = async (tag) =>
  page.screenshot({ path: path.join(shotsDir, `journey-${tag}${suffix}.png`) });

const a = { id: "journey", checks: {}, ok: true };
const check = (name, cond, extra) => {
  a.checks[name] = cond ? "PASS" : ("FAIL" + (extra ? " " + extra : ""));
  if (!cond) a.ok = false;
};

try {
  await page.evaluate(() => { location.hash = "#/journey"; });
  await page.waitForTimeout(600);

  check("mount", await page.evaluate(() => !!document.querySelector(".tg-stage canvas")));
  check("step0", (await stepLabel()) === "0/9", await stepLabel());
  check("title", await page.evaluate(() =>
    /Hành trình/.test(document.querySelector(".tg-page-title")?.textContent || "")));

  const h0 = await canvasHash();
  const hud0 = await hudText();
  check("hud-init", /T12/.test(hud0) && hud0.includes("—"), hud0);
  await shot("s0");

  check("four-before-deep", await page.evaluate(() => {
    const four = document.querySelector(".tg-four");
    const deep = [...document.querySelectorAll("details")].find((e) => /Deep/.test(e.textContent || ""));
    return !!(four && deep && (four.compareDocumentPosition(deep) & Node.DOCUMENT_POSITION_FOLLOWING));
  }));

  /* controls */
  await page.click('button[title="Bước sau (→)"]'); await page.waitForTimeout(150);
  check("next", (await stepLabel()).startsWith("1/"), await stepLabel());
  await page.click('button[title="Bước trước (←)"]'); await page.waitForTimeout(150);
  check("prev", (await stepLabel()).startsWith("0/"), await stepLabel());

  await seek(5);
  check("scrub", (await stepLabel()).startsWith("5/"), await stepLabel());
  const hud5 = await hudText();
  check("hud-mid", /G7/.test(hud5) && /NAVIGATING/.test(hud5), hud5);
  await shot("s5");

  await page.click('button[title="Reset"]'); await page.waitForTimeout(200);
  check("reset", (await stepLabel()).startsWith("0/"), await stepLabel());
  check("determinism", (await canvasHash()) === h0, "hash đổi sau reset");
  check("hud-reset", (await hudText()) === hud0, "HUD khác init");

  await page.selectOption("select.tg-speed", "4");
  check("speed", await page.evaluate(() => document.querySelector("select.tg-speed").value === "4"));

  await page.click('button[title="Play/Pause (Space)"]');
  await page.waitForTimeout(900);
  check("play", !(await stepLabel()).startsWith("0/"), await stepLabel());
  await page.click('button[title="Play/Pause (Space)"]');
  await page.waitForTimeout(150);
  const lblA = await stepLabel();
  await page.waitForTimeout(700);
  check("pause-freeze", (await stepLabel()) === lblA);

  /* chặng cuối: exit → session xoá */
  await seek(9);
  const hud9 = await hudText();
  check("hud-final", /xoá|EXIT/.test(hud9), hud9);
  await shot("s9");

  /* canvas khác nhau giữa các chặng (node highlight + xe đổi) */
  const h9 = await canvasHash();
  check("scene-change", h9 !== h0, "canvas trùng s0");

  /* click node chip → điều hướng trang thuật toán qua TG.router.go */
  const chipInfo = await page.evaluate(() => {
    const cv = document.querySelector(".tg-stage canvas");
    const r = cv.getBoundingClientRect();
    const h = (cv._hit || []).find((x) => x.page === "kalman");
    return h ? { x: r.left + h.x + h.w / 2, y: r.top + h.y + h.h / 2, n: cv._hit.length } : null;
  });
  check("chips", !!chipInfo && chipInfo.n >= 14, JSON.stringify(chipInfo && chipInfo.n));
  if (chipInfo) {
    await page.mouse.click(chipInfo.x, chipInfo.y);
    await page.waitForTimeout(700);
    check("click-node", await page.evaluate(() => location.hash === "#/algo/kalman"),
      await page.evaluate(() => location.hash));
    await shot("nav-kalman"); /* ảnh sau điều hướng */
  }

  /* re-nav: đi #/map rồi quay lại — destroy/mount lại không lỗi */
  await page.evaluate(() => { location.hash = "#/map"; });
  await page.waitForTimeout(400);
  await page.evaluate(() => { location.hash = "#/journey"; });
  await page.waitForTimeout(600);
  check("re-nav", (await stepLabel()) === "0/9" &&
    (await canvasHash()) === h0, await stepLabel());
} catch (e) {
  a.ok = false; a.checks["exception"] = "FAIL " + e.message;
}

check("errors", errors.length === 0, errors.slice(0, 3).join(" ; "));
await browser.close();

console.log(JSON.stringify({ viewport: hi ? "1440x900" : "1280x720", results: [a], errors }, null, 1));
process.exit(a.ok && !errors.length ? 0 : 1);
