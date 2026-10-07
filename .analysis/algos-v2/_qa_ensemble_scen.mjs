/* Shots ensemble theo TỪNG kịch bản (white/core/leaving) — proof cho LEAD.
 * Chạy: node .analysis/algos-v2/_qa_ensemble_scen.mjs [--1440]
 * Shots: qa/shots/a/ensemble-{white,core,leaving}-s{2,5}[-1440].png
 */
import { createRequire } from "module";
import { fileURLToPath, pathToFileURL } from "url";
import path from "path";
import fs from "fs";

const require = createRequire("D:/TechGar2/frontend/package.json");
const { chromium } = require("@playwright/test");

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const appDir = path.join(root, "algo-web-v2");
const shotsDir = path.join(appDir, "qa", "shots", "a");
fs.mkdirSync(shotsDir, { recursive: true });

const hi = process.argv.includes("--1440");
const suffix = hi ? "-1440" : "";
const SCENS = ["white", "core", "leaving"];

const browser = await chromium.launch();
const errors = [];
const page = await browser.newPage({ viewport: hi ? { width: 1440, height: 900 } : { width: 1280, height: 720 } });
page.on("console", (m) => { if (m.type() === "error") errors.push(m.text()); });
page.on("pageerror", (e) => errors.push("PAGEERROR: " + e.message));

await page.goto(pathToFileURL(path.join(appDir, "index.html")).href);
await page.waitForTimeout(400);
await page.addScriptTag({ path: path.join(appDir, "js/content/ensemble.js") });
await page.addScriptTag({ path: path.join(appDir, "js/pages/ensemble.js") });
await page.evaluate(() => { location.hash = "#/algo/ensemble"; });
await page.waitForTimeout(600);

const stepLabel = () => page.evaluate(() =>
  (document.querySelector(".tg-step-label") || {}).textContent || "none");
const seek = async (v) => {
  await page.evaluate(() => { if (document.activeElement?.blur) document.activeElement.blur(); });
  await page.evaluate((val) => {
    const s = document.querySelector("input.tg-scrub");
    s.value = val; s.dispatchEvent(new Event("input", { bubbles: true }));
  }, v);
  await page.waitForFunction(
    (t) => ((document.querySelector(".tg-step-label") || {}).textContent || "").startsWith(t + "/"),
    v, { timeout: 3000 });
  await page.waitForTimeout(220);
};

for (const sc of SCENS) {
  await page.evaluate((v) => {
    const s = document.querySelector(".tg-scenario-sel select");
    s.value = v; s.dispatchEvent(new Event("change", { bubbles: true }));
  }, sc);
  await page.waitForTimeout(200);
  for (const st of [2, 5]) {
    await seek(st);
    const lbl = await stepLabel();
    if (!lbl.startsWith(st + "/")) { console.log("FAIL seek", sc, st, lbl); continue; }
    await page.screenshot({ path: path.join(shotsDir, `ensemble-${sc}-s${st}${suffix}.png`) });
    console.log("shot", `ensemble-${sc}-s${st}${suffix}.png`, "label=" + lbl);
  }
}
console.log("CONSOLE/PAGE ERRORS:", errors.length ? errors : "none");
await browser.close();
process.exit(errors.length ? 1 : 0);
