import { createRequire } from "module";
import { fileURLToPath, pathToFileURL } from "url";
import path from "path"; import fs from "fs";
const require = createRequire("D:/TechGar2/frontend/package.json");
const { chromium } = require("@playwright/test");
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const appDir = path.join(root, "algo-web-v2");
const out = path.join(appDir, "qa", "shots", "a"); fs.mkdirSync(out, { recursive: true });
const browser = await chromium.launch();
const errors = [];
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
page.on("console", m => { if (m.type() === "error") errors.push(m.text()); });
page.on("pageerror", e => errors.push("PAGEERROR: " + e.message));
await page.goto(pathToFileURL(path.join(appDir, "index.html")).href);
await page.waitForTimeout(600);
const seek = async (v) => {
  await page.evaluate(() => { if (document.activeElement?.blur) document.activeElement.blur(); });
  await page.evaluate((val) => { const s = document.querySelector("input.tg-scrub"); s.value = val; s.dispatchEvent(new Event("input", { bubbles: true })); }, v);
  await page.waitForFunction(t => ((document.querySelector(".tg-step-label") || {}).textContent || "").startsWith(t + "/"), v, { timeout: 3000 });
  await page.waitForTimeout(220);
};
for (const id of ["binder", "polygon"]) {
  await page.evaluate(pid => { location.hash = "#/algo/" + pid; }, id);
  await page.waitForTimeout(600);
  const max = await page.evaluate(() => +(document.querySelector("input.tg-scrub") || { max: 4 }).max);
  for (const st of [0, Math.min(2, max), max]) {
    await seek(st);
    await page.screenshot({ path: path.join(out, `peer-${id}-s${st}.png`) });
    console.log(`shot peer-${id}-s${st} label=` + await page.evaluate(() => document.querySelector(".tg-step-label")?.textContent));
  }
  const fourBeforeDeep = await page.evaluate(() => {
    const four = document.querySelector(".tg-four"), deep = [...document.querySelectorAll("summary,details")].find(e => /Deep/.test(e.textContent || ""));
    return !!(four && deep && four.compareDocumentPosition(deep) & Node.DOCUMENT_POSITION_FOLLOWING);
  });
  console.log(id, "four-before-Deep:", fourBeforeDeep);
}
console.log("ERRORS:", errors.length ? errors : "none");
await browser.close();
