import assert from "node:assert/strict";
import { createHmac } from "node:crypto";
import { chromium } from "playwright-core";

const baseUrl = process.argv[2] ?? "http://127.0.0.1:13000";
const sessionSecret = process.env.SMOKE_SESSION_SECRET;
const executablePath = process.env.CHROMIUM_PATH;
if (!sessionSecret || sessionSecret.length < 32) throw new Error("SMOKE_SESSION_SECRET must contain at least 32 characters");
if (!executablePath) throw new Error("CHROMIUM_PATH is required");

function sessionToken() {
  const payload = Buffer.from(JSON.stringify({ exp: Math.floor(Date.now() / 1000) + 300, nonce: "browser-smoke" }))
    .toString("base64url");
  const signature = createHmac("sha256", sessionSecret).update(payload).digest("base64url");
  return `${payload}.${signature}`;
}

async function authenticatedContext(browser, viewport) {
  const context = await browser.newContext({ viewport });
  await context.addCookies([{
    name: "dodobaby_session",
    value: sessionToken(),
    url: baseUrl,
    sameSite: "Lax",
  }]);
  return context;
}

const browser = await chromium.launch({ executablePath, headless: true, args: ["--no-sandbox", "--disable-dev-shm-usage"] });
try {
  const desktop = await authenticatedContext(browser, { width: 1440, height: 900 });
  const page = await desktop.newPage();
  await page.goto(`${baseUrl}/feeding`, { waitUntil: "networkidle" });
  await page.getByRole("heading", { name: /喂养记录/ }).waitFor();
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth), false);

  const dateInput = page.locator('input[aria-label="查看日期"]');
  const today = await dateInput.inputValue();
  await page.getByRole("button", { name: "前一天" }).click();
  await page.waitForFunction((value) => document.querySelector('input[aria-label="查看日期"]')?.value !== value, today);
  await page.getByRole("button", { name: "回到今天" }).click();
  await page.waitForFunction((value) => document.querySelector('input[aria-label="查看日期"]')?.value === value, today);

  const trigger = page.getByRole("button", { name: "添加喂养" });
  await trigger.click();
  const dialog = page.getByRole("dialog", { name: "添加喂养" });
  await dialog.waitFor();
  assert.match(await dialog.locator('input[type="time"]').inputValue(), /^\d{2}:\d{2}$/);
  const note = `browser-smoke-${Date.now()}`;
  await dialog.locator(".feeding-form-section.bottle input").nth(1).fill("61");
  await dialog.locator("textarea").fill(note);
  await dialog.getByRole("button", { name: "添加记录" }).click();
  await dialog.waitFor({ state: "hidden" });
  await page.waitForFunction(() => document.activeElement?.textContent?.includes("添加喂养"));

  const recordCard = page.locator(".feeding-record-card").filter({ hasText: note });
  await recordCard.waitFor();
  assert.match(await recordCard.textContent(), /配方奶 61 ml/);
  await recordCard.getByRole("button", { name: "编辑" }).click();
  const editDialog = page.getByRole("dialog", { name: "编辑喂养" });
  await editDialog.locator(".feeding-form-section.bottle input").nth(1).fill("62");
  await editDialog.getByRole("button", { name: "保存修改" }).click();
  await editDialog.waitFor({ state: "hidden" });
  await page.waitForFunction((value) => [...document.querySelectorAll(".feeding-record-card")].some((card) => card.textContent?.includes(value) && card.textContent?.includes("配方奶 62 ml")), note);

  page.once("dialog", (confirmation) => confirmation.accept());
  await recordCard.getByRole("button", { name: "删除" }).click();
  await recordCard.waitFor({ state: "detached" });

  await page.route("**/api/feedings?*", (route) => route.fulfill({
    status: 500,
    contentType: "application/json; charset=utf-8",
    body: JSON.stringify({ error: "模拟加载失败" }),
  }));
  await page.reload({ waitUntil: "networkidle" });
  await page.getByRole("alert").waitFor();
  assert.match(await page.getByRole("alert").textContent(), /模拟加载失败/);
  await desktop.close();

  const mobile = await authenticatedContext(browser, { width: 390, height: 844 });
  const mobilePage = await mobile.newPage();
  await mobilePage.goto(`${baseUrl}/feeding`, { waitUntil: "networkidle" });
  assert.equal(await mobilePage.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth), false);
  assert.deepEqual(await mobilePage.locator(".care-bottom-nav a").allTextContents(), ["首页", "辅食", "喂养", "生长"]);
  const undersizedTargets = await mobilePage.locator("button, input, select, a").evaluateAll((elements) => elements
    .filter((element) => element instanceof HTMLElement && element.offsetParent !== null)
    .map((element) => ({ label: element.getAttribute("aria-label") || element.textContent?.trim(), height: element.getBoundingClientRect().height }))
    .filter((target) => target.height < 44));
  assert.deepEqual(undersizedTargets, []);

  const mobileTrigger = mobilePage.getByRole("button", { name: "添加喂养" });
  await mobileTrigger.click();
  const mobileDialog = mobilePage.getByRole("dialog", { name: "添加喂养" });
  const bounds = await mobileDialog.boundingBox();
  assert.ok(bounds && Math.abs(bounds.y + bounds.height - 844) <= 1, `mobile dialog is not bottom aligned: ${JSON.stringify(bounds)}`);
  await mobileDialog.getByRole("button", { name: "关闭" }).click();
  await mobileDialog.waitFor({ state: "hidden" });
  await mobilePage.waitForFunction(() => document.activeElement?.textContent?.includes("添加喂养"));
  await mobile.close();
} finally {
  await browser.close();
}

console.log("Browser smoke passed: desktop CRUD, date switching, failure state, mobile layout, touch targets, and focus");
