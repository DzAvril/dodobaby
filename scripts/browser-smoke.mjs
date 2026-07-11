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

function shiftDate(date, days) {
  const shifted = new Date(`${date}T00:00:00Z`);
  shifted.setUTCDate(shifted.getUTCDate() + days);
  return shifted.toISOString().slice(0, 10);
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

async function undersizedTouchTargets(page) {
  return page.locator("button, input, select, a").evaluateAll((elements) => elements
    .filter((element) => element instanceof HTMLElement && element.offsetParent !== null)
    .map((element) => ({ label: element.getAttribute("aria-label") || element.textContent?.trim(), height: element.getBoundingClientRect().height }))
    .filter((target) => target.height < 44));
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
  const errorAlert = page.locator('.module-error[role="alert"]');
  await errorAlert.waitFor();
  assert.match(await errorAlert.textContent(), /模拟加载失败/);
  assert.equal(await page.locator(".feeding-summary-grid, .feeding-timeline-card, .feeding-state-card").count(), 0);
  await page.unroute("**/api/feedings?*");
  await page.getByRole("button", { name: "重新加载" }).click();
  await page.locator(".feeding-summary-grid").waitFor();
  assert.equal(await errorAlert.count(), 0);

  await page.route("**/api/feedings?*", (route) => route.fulfill({
    status: 500,
    contentType: "application/json; charset=utf-8",
    body: JSON.stringify({ error: "模拟日期加载失败" }),
  }));
  const previousDate = shiftDate(today, -1);
  await page.getByRole("button", { name: "前一天" }).click();
  await page.waitForFunction((value) => document.querySelector('input[aria-label="查看日期"]')?.value === value, previousDate);
  await errorAlert.waitFor();
  assert.match(await errorAlert.textContent(), /模拟日期加载失败/);
  assert.equal(await page.locator(".feeding-summary-grid, .feeding-timeline-card, .feeding-state-card").count(), 0);
  await page.unroute("**/api/feedings?*");
  await page.getByRole("button", { name: "重新加载" }).click();
  await page.locator(".feeding-record-card").filter({ hasText: "配方奶 30 ml" }).waitFor();
  assert.equal(await dateInput.inputValue(), previousDate);

  await page.getByRole("button", { name: "回到今天" }).click();
  await page.waitForFunction((value) => document.querySelector('input[aria-label="查看日期"]')?.value === value, today);
  await page.locator(".feeding-record-card").filter({ hasText: "混合瓶喂" }).waitFor();

  let releasePreviousRequest;
  let markPreviousRequestStarted;
  let markPreviousRequestFinished;
  const previousRequestGate = new Promise((resolve) => { releasePreviousRequest = resolve; });
  const previousRequestStarted = new Promise((resolve) => { markPreviousRequestStarted = resolve; });
  const previousRequestFinished = new Promise((resolve) => { markPreviousRequestFinished = resolve; });
  await page.route("**/api/feedings?*", async (route) => {
    const requestDate = new URL(route.request().url()).searchParams.get("date");
    if (requestDate !== previousDate) {
      await route.continue();
      return;
    }
    markPreviousRequestStarted();
    await previousRequestGate;
    const response = await route.fetch();
    await route.fulfill({ response });
    markPreviousRequestFinished();
  });
  await page.getByRole("button", { name: "前一天" }).click();
  await previousRequestStarted;
  await page.getByRole("button", { name: "回到今天" }).click();
  await page.waitForFunction((value) => document.querySelector('input[aria-label="查看日期"]')?.value === value, today);
  await page.locator(".feeding-record-card").filter({ hasText: "混合瓶喂" }).waitFor();
  releasePreviousRequest();
  await previousRequestFinished;
  await page.evaluate(() => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve))));
  assert.equal(await dateInput.inputValue(), today);
  assert.equal(await page.locator(".feeding-record-card").filter({ hasText: "混合瓶喂" }).count(), 1);
  await page.unroute("**/api/feedings?*");

  await page.goto(`${baseUrl}/growth`, { waitUntil: "networkidle" });
  await page.getByRole("heading", { name: /生长记录/ }).waitFor();
  await page.route("**/api/growth", (route) => route.fulfill({
    status: 500,
    contentType: "application/json; charset=utf-8",
    body: JSON.stringify({ error: "模拟生长加载失败" }),
  }));
  await page.reload({ waitUntil: "networkidle" });
  const growthError = page.locator('.module-error[role="alert"]');
  await growthError.waitFor();
  assert.match(await growthError.textContent(), /模拟生长加载失败/);
  assert.equal(await page.locator(".growth-summary-grid, .growth-chart-card, .growth-history-card, .growth-state-card").count(), 0);
  await page.unroute("**/api/growth");
  await page.getByRole("button", { name: "重新加载" }).click();
  await page.locator(".growth-state-card.empty").waitFor();
  assert.match(await page.locator(".growth-state-card.empty").textContent(), /记录第一次测量/);
  assert.equal(await growthError.count(), 0);

  await page.getByRole("button", { name: "添加测量" }).click();
  const growthDialog = page.getByRole("dialog", { name: "添加测量" });
  await growthDialog.locator('input[type="number"]').first().fill("7.3");
  await growthDialog.getByRole("button", { name: "添加记录" }).click();
  await growthDialog.waitFor({ state: "hidden" });
  const growthRecord = page.locator(".growth-history-list article").filter({ hasText: "7.3 kg" });
  await growthRecord.waitFor();

  await page.route("**/api/growth/*", (route) => {
    if (route.request().method() !== "DELETE") return route.continue();
    return route.fulfill({
      status: 500,
      contentType: "application/json; charset=utf-8",
      body: JSON.stringify({ error: "模拟生长删除失败" }),
    });
  });
  page.once("dialog", (confirmation) => confirmation.accept());
  await growthRecord.getByRole("button", { name: "删除" }).click();
  await growthError.waitFor();
  assert.match(await growthError.textContent(), /模拟生长删除失败/);
  assert.equal(await growthRecord.count(), 1);
  assert.equal(await growthRecord.getByRole("button", { name: "删除" }).isEnabled(), true);

  await page.unroute("**/api/growth/*");
  page.once("dialog", (confirmation) => confirmation.accept());
  await growthRecord.getByRole("button", { name: "删除" }).click();
  await page.locator(".growth-state-card.empty").waitFor();
  await desktop.close();

  const vaccinationDesktop = await authenticatedContext(browser, { width: 1440, height: 900 });
  const vaccinationPage = await vaccinationDesktop.newPage();
  await vaccinationPage.goto(`${baseUrl}/vaccines`, { waitUntil: "networkidle" });
  await vaccinationPage.getByRole("heading", { name: /疫苗记录/ }).waitFor();
  assert.equal(await vaccinationPage.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth), false);

  const vaccinationTrigger = vaccinationPage.getByRole("button", { name: "添加疫苗记录" });
  await vaccinationTrigger.click();
  const vaccinationDialog = vaccinationPage.getByRole("dialog", { name: "添加疫苗记录" });
  await vaccinationDialog.waitFor();
  await vaccinationPage.keyboard.press("Escape");
  await vaccinationDialog.waitFor({ state: "hidden" });
  await vaccinationPage.waitForFunction(() => document.activeElement?.textContent?.includes("添加疫苗记录"));

  await vaccinationTrigger.click();
  await vaccinationDialog.waitFor();
  const vaccineName = `浏览器测试疫苗-${Date.now()}`;
  const plannedDate = vaccinationDialog.locator('input[type="date"]').first();
  const todayForVaccination = await plannedDate.inputValue();
  await vaccinationDialog.getByLabel("疫苗名称").fill(vaccineName);
  await vaccinationDialog.getByLabel("剂次").fill("2");
  await vaccinationDialog.getByLabel("分类").selectOption("immunization_program");
  await plannedDate.fill(shiftDate(todayForVaccination, 1));
  await vaccinationDialog.getByLabel(/计划时间/).fill("09:15");
  await vaccinationDialog.getByLabel(/计划接种单位/).fill("浏览器测试门诊");
  await vaccinationDialog.locator("textarea").fill("端到端计划记录");
  await vaccinationDialog.getByRole("button", { name: "添加记录" }).click();
  await vaccinationDialog.waitFor({ state: "hidden" });
  await vaccinationPage.waitForFunction(() => document.activeElement?.textContent?.includes("添加疫苗记录"));

  const plannedCard = vaccinationPage.locator(".vaccination-list > article").filter({ hasText: vaccineName });
  await plannedCard.waitFor();
  assert.match(await plannedCard.textContent(), /第 2 剂/);
  await plannedCard.getByRole("button", { name: "登记已接种" }).click();
  const completionDialog = vaccinationPage.getByRole("dialog", { name: "登记已接种" });
  await completionDialog.waitFor();
  assert.equal(await completionDialog.getByLabel("实际接种日期").inputValue(), todayForVaccination);
  await completionDialog.getByLabel(/生产厂家/).fill("浏览器测试企业");
  await completionDialog.getByLabel(/批号/).fill("BROWSER-1");
  await completionDialog.getByLabel(/接种部位/).fill("左上臂");
  await completionDialog.getByRole("button", { name: "确认已接种" }).click();
  await completionDialog.waitFor({ state: "hidden" });

  const historyCard = vaccinationPage.locator(".vaccination-list-card.history article").filter({ hasText: vaccineName });
  await historyCard.waitFor();
  assert.match(await historyCard.textContent(), /浏览器测试企业/);
  await historyCard.getByRole("button", { name: "编辑" }).click();
  const vaccinationEditDialog = vaccinationPage.getByRole("dialog", { name: "编辑疫苗记录" });
  await vaccinationEditDialog.getByRole("button", { name: "计划接种" }).click();
  await vaccinationEditDialog.getByRole("button", { name: "保存修改" }).click();
  await vaccinationEditDialog.waitFor({ state: "hidden" });
  await plannedCard.waitFor();
  await plannedCard.getByRole("button", { name: "登记已接种" }).click();
  const secondCompletionDialog = vaccinationPage.getByRole("dialog", { name: "登记已接种" });
  assert.equal(await secondCompletionDialog.getByLabel(/生产厂家/).inputValue(), "");
  assert.equal(await secondCompletionDialog.getByLabel(/批号/).inputValue(), "");
  assert.equal(await secondCompletionDialog.getByLabel(/接种部位/).inputValue(), "");
  assert.equal(await secondCompletionDialog.getByLabel(/接种单位/).inputValue(), "浏览器测试门诊");
  assert.equal(await secondCompletionDialog.locator("textarea").inputValue(), "端到端计划记录");
  await secondCompletionDialog.getByLabel(/生产厂家/).fill("更新后的浏览器测试企业");
  await secondCompletionDialog.getByRole("button", { name: "确认已接种" }).click();
  await secondCompletionDialog.waitFor({ state: "hidden" });
  await vaccinationPage.waitForFunction((name) => [...document.querySelectorAll(".vaccination-list-card.history article")]
    .some((card) => card.textContent?.includes(name) && card.textContent?.includes("更新后的浏览器测试企业")), vaccineName);

  vaccinationPage.once("dialog", (confirmation) => confirmation.accept());
  await historyCard.getByRole("button", { name: "删除" }).click();
  await historyCard.waitFor({ state: "detached" });

  await vaccinationPage.route("**/api/vaccines", (route) => route.fulfill({
    status: 500,
    contentType: "application/json; charset=utf-8",
    body: JSON.stringify({ error: "模拟疫苗加载失败" }),
  }));
  await vaccinationPage.reload({ waitUntil: "networkidle" });
  const vaccinationError = vaccinationPage.locator('.module-error[role="alert"]');
  await vaccinationError.waitFor();
  assert.match(await vaccinationError.textContent(), /模拟疫苗加载失败/);
  await vaccinationPage.getByRole("button", { name: "重新加载" }).waitFor();
  assert.equal(await vaccinationPage.locator(".vaccination-summary-grid, .vaccination-record-sections").count(), 0);
  await vaccinationDesktop.close();

  const mobile = await authenticatedContext(browser, { width: 390, height: 844 });
  const mobilePage = await mobile.newPage();
  await mobilePage.goto(`${baseUrl}/feeding`, { waitUntil: "networkidle" });
  assert.equal(await mobilePage.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth), false);
  assert.deepEqual(await mobilePage.locator(".care-bottom-nav a").allTextContents(), ["首页", "辅食", "喂养", "生长", "疫苗"]);
  assert.deepEqual(await undersizedTouchTargets(mobilePage), []);

  const mobileFeedingTrigger = mobilePage.getByRole("button", { name: "添加喂养" });
  await mobileFeedingTrigger.click();
  const mobileFeedingDialog = mobilePage.getByRole("dialog", { name: "添加喂养" });
  const feedingBounds = await mobileFeedingDialog.boundingBox();
  assert.ok(feedingBounds && Math.abs(feedingBounds.y + feedingBounds.height - 844) <= 1, `mobile feeding dialog is not bottom aligned: ${JSON.stringify(feedingBounds)}`);
  assert.ok(feedingBounds && Math.abs(feedingBounds.width - 390) <= 1, `mobile feeding dialog is not full width: ${JSON.stringify(feedingBounds)}`);
  await mobileFeedingDialog.getByRole("button", { name: "关闭" }).click();
  await mobileFeedingDialog.waitFor({ state: "hidden" });
  await mobilePage.waitForFunction(() => document.activeElement?.textContent?.includes("添加喂养"));

  await mobilePage.goto(`${baseUrl}/growth`, { waitUntil: "networkidle" });
  const mobileGrowthTrigger = mobilePage.getByRole("button", { name: "添加测量" });
  await mobileGrowthTrigger.click();
  const mobileGrowthDialog = mobilePage.getByRole("dialog", { name: "添加测量" });
  const growthBounds = await mobileGrowthDialog.boundingBox();
  assert.ok(growthBounds && Math.abs(growthBounds.y + growthBounds.height - 844) <= 1, `mobile growth dialog is not bottom aligned: ${JSON.stringify(growthBounds)}`);
  assert.ok(growthBounds && Math.abs(growthBounds.width - 390) <= 1, `mobile growth dialog is not full width: ${JSON.stringify(growthBounds)}`);
  await mobileGrowthDialog.getByRole("button", { name: "关闭" }).click();
  await mobileGrowthDialog.waitFor({ state: "hidden" });
  await mobilePage.waitForFunction(() => document.activeElement?.textContent?.includes("添加测量"));

  await mobilePage.goto(`${baseUrl}/vaccines`, { waitUntil: "networkidle" });
  assert.equal(await mobilePage.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth), false);
  assert.deepEqual(await undersizedTouchTargets(mobilePage), []);

  const mobileTrigger = mobilePage.getByRole("button", { name: "添加疫苗记录" });
  await mobileTrigger.click();
  const mobileDialog = mobilePage.getByRole("dialog", { name: "添加疫苗记录" });
  const bounds = await mobileDialog.boundingBox();
  assert.ok(bounds && Math.abs(bounds.y + bounds.height - 844) <= 1, `mobile dialog is not bottom aligned: ${JSON.stringify(bounds)}`);
  assert.ok(bounds && Math.abs(bounds.width - 390) <= 1, `mobile dialog is not full width: ${JSON.stringify(bounds)}`);
  const vaccinationSaveBounds = await mobileDialog.getByRole("button", { name: "添加记录" }).boundingBox();
  assert.ok(vaccinationSaveBounds && vaccinationSaveBounds.y + vaccinationSaveBounds.height <= 844, `mobile vaccination action is not visible: ${JSON.stringify(vaccinationSaveBounds)}`);
  await mobileDialog.getByRole("button", { name: "关闭" }).click();
  await mobileDialog.waitFor({ state: "hidden" });
  await mobilePage.waitForFunction(() => document.activeElement?.textContent?.includes("添加疫苗记录"));

  await mobilePage.goto(`${baseUrl}/settings`, { waitUntil: "networkidle" });
  await mobilePage.getByRole("button", { name: "退出登录" }).waitFor();
  await mobile.close();
} finally {
  await browser.close();
}

console.log("Browser smoke passed: feeding and vaccination CRUD, tracker retries and request races, responsive layout, touch targets, and focus");
