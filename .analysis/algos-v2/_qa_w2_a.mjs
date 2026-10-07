/* QA W2 cho pages A — file:// + addScriptTag (index.html giữ nguyên, C owns).
 * Chạy: node .analysis/algos-v2/_qa_w2_a.mjs [ids...] [--1440]
 * Shots: algo-web-v2/qa/shots/a/<id>-<step>.png
 */
import { createRequire } from "module";
import { fileURLToPath, pathToFileURL } from "url";
import path from "path";
import fs from "fs";

const require = createRequire("D:/TechGar2/frontend/package.json");
const { chromium } = require("@playwright/test");

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", ".."); // D:/TechGar2
const appDir = path.join(root, "algo-web-v2");
const shotsDir = path.join(appDir, "qa", "shots", "a");
fs.mkdirSync(shotsDir, { recursive: true });

const argv = process.argv.slice(2);
const hi = argv.includes("--1440");
const ids = argv.filter((a) => !a.startsWith("--"));
const ALL = ids.length ? ids : ["roi", "motion", "kalman", "coasting", "assignment"];

const FILES = (id) => [`js/content/${id}.js`, `js/pages/${id}.js`];

const browser = await chromium.launch();
const errors = [];
const page = await browser.newPage({ viewport: hi ? { width: 1440, height: 900 } : { width: 1280, height: 720 } });
page.on("console", (m) => { if (m.type() === "error") errors.push(m.text()); });
page.on("pageerror", (e) => errors.push("PAGEERROR: " + e.message));

await page.goto(pathToFileURL(path.join(appDir, "index.html")).href);
await page.waitForTimeout(400);

/* inject scripts của A (đúng thứ tự content→page), index.html không sửa */
for (const id of ALL) {
  for (const f of FILES(id)) {
    await page.addScriptTag({ path: path.join(appDir, f) });
  }
}
await page.waitForTimeout(200);

for (const id of ALL) {
  await page.evaluate((pid) => { location.hash = "#/algo/" + pid; }, id);
  await page.waitForTimeout(500);
  const mounted = await page.evaluate((pid) => !!document.querySelector(".tg-stage canvas"), id);
  await page.screenshot({ path: path.join(shotsDir, `${id}-s0${hi ? "-1440" : ""}.png`) });

  /* mid-step: ArrowRight → bước 2, rồi bước 4 (player wire keyboard) */
  await page.keyboard.press("ArrowRight"); await page.waitForTimeout(200);
  await page.keyboard.press("ArrowRight"); await page.waitForTimeout(300);
  await page.screenshot({ path: path.join(shotsDir, `${id}-s2${hi ? "-1440" : ""}.png`) });
  await page.keyboard.press("ArrowRight"); await page.waitForTimeout(200);
  await page.keyboard.press("ArrowRight"); await page.waitForTimeout(300);
  await page.screenshot({ path: path.join(shotsDir, `${id}-s4${hi ? "-1440" : ""}.png`) });
  console.log(`${id}: mounted=${mounted}`);
}

console.log("CONSOLE/PAGE ERRORS:", errors.length ? errors : "none");
await browser.close();
