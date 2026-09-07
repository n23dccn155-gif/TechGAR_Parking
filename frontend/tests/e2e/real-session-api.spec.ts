import { test, expect } from "@playwright/test";
import { spawn, type ChildProcess } from "node:child_process";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

let server: ChildProcess;
let base: string;
test.beforeAll(async () => {
  const directory = mkdtempSync(path.join(tmpdir(), "techgar-browser-session-"));
  const python = process.env.TECHGAR_TEST_PYTHON ?? path.resolve("../backend/main_detect/.venv/Scripts/python.exe");
  server = spawn(python, ["-u", path.resolve("../backend/tests/browser_session_server.py"),
    "--store", path.join(directory,"sessions.json")], {windowsHide:true, stdio:["ignore","pipe","pipe"]});
  base = await new Promise<string>((resolve,reject) => {
    const timer = setTimeout(() => reject(new Error("Session fixture did not start")), 15000);
    server.once("error", error => {clearTimeout(timer); reject(error);});
    server.once("exit", code => {clearTimeout(timer); reject(new Error(`Session fixture exit ${code}`));});
    server.stdout?.on("data", chunk => {
      const ready = /READY:(\d+)/.exec(String(chunk));
      if (ready) {clearTimeout(timer); resolve(`http://127.0.0.1:${ready[1]}`);}
    });
  });
});
test.afterAll(() => {server?.kill();});

test("real Python API: identity pending, park elsewhere, relocate, exit while stationary", async ({page, request}) => {
  page.on("pageerror", error => console.error("Browser error:", error.message));
  page.on("console", message => {if (message.type() === "error") console.error(message.text());});
  await page.route("**/api/**", async route => {
    const url = new URL(route.request().url());
    if (!url.pathname.startsWith("/api/")) return route.continue();
    const response = await route.fetch({url: `${base}${url.pathname}${url.search}`});
    await route.fulfill({response});
  });
  await page.goto("/?session=browser-session");
  // Use the real API to choose the destination, then let the normal UI polling observe it.
  await request.get(`${base}/api/runtime/snapshot`);
  const choose = await request.post(`${base}/api/session/select`, {data:{sessionId:"browser-session",spotId:"A01"}});
  expect(choose.ok()).toBeTruthy();
  await request.post(`${base}/__test/advance`, {data:{slot_id:"A01",state:"red_unknown"}});
  await expect(page.getByTestId("parking-identity-pending")).toBeVisible();
  await expect(page.getByRole("alertdialog")).toHaveCount(0);
  await request.post(`${base}/__test/advance`, {data:{slot_id:"A02",state:"parked",episode_id:"first"}});
  await expect(page.getByTestId("parked-success")).toContainText("A02");
  await expect(page.getByTestId("parked-success")).toHaveCount(0, {timeout:6500});
  await request.post(`${base}/__test/advance`, {data:{slot_id:"A01",state:"released",episode_id:"unused"}});
  await page.getByRole("button",{name:"Chọn / đổi ô đỗ"}).click();
  await page.getByTestId("spot-A01").click();
  await page.getByTestId("spot-navigate").click();
  await expect.poll(async () => (await (await request.get(`${base}/api/session/browser-session`)).json()).state).toBe("RELOCATING");
  const relocating = await (await request.get(`${base}/api/session/browser-session`)).json();
  expect(relocating.actualParkedSpotId).toBe("A02");
  await request.post(`${base}/__test/advance`, {data:{slot_id:"A02",state:"released",episode_id:"first"}});
  await request.post(`${base}/__test/advance`, {data:{slot_id:"A01",state:"parked",episode_id:"second"}});
  await expect(page.getByTestId("parked-success")).toContainText("A01");
  await page.getByRole("button",{name:/Chỉ lối ra/}).click();
  await expect.poll(async () => (await (await request.get(`${base}/api/session/browser-session`)).json()).state).toBe("EXIT_NAVIGATION");
  await expect(page.getByTestId("parked-success")).toHaveCount(0);
  expect((await (await request.get(`${base}/api/session/browser-session`)).json()).globalVehicleId).toBe(42);
});
