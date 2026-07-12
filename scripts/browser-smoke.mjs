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

function shiftLocalMinute(date, time, minutes) {
  const shifted = new Date(`${date}T${time}:00Z`);
  shifted.setUTCMinutes(shifted.getUTCMinutes() + minutes);
  return { date: shifted.toISOString().slice(0, 10), time: shifted.toISOString().slice(11, 16) };
}

function currentMinuteInShanghai() {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Shanghai",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(new Date());
  const values = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return { date: `${values.year}-${values.month}-${values.day}`, time: `${values.hour}:${values.minute}` };
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
  await page.locator(".growth-chart-card").waitFor();
  assert.match(await page.locator(".growth-standard-status").textContent(), /WHO 女童标准/);
  assert.equal(await page.locator(".growth-chart path[data-percentile]").count(), 5);
  assert.equal(await page.locator(".growth-chart-legend span").count(), 6);
  assert.match(await page.locator(".growth-standard-disclaimer").textContent(), /不表示正常或异常/);
  assert.equal(await page.getByRole("link", { name: "查看 WHO 官方数据来源" }).isVisible(), true);

  await page.getByRole("button", { name: "添加测量" }).click();
  const growthDialog = page.getByRole("dialog", { name: "添加测量" });
  const firstGrowthDate = shiftDate(today, -30);
  const growthSave = growthDialog.getByRole("button", { name: "添加记录" });
  assert.equal(await growthSave.isDisabled(), true);
  await growthDialog.locator('input[type="date"]').fill(firstGrowthDate);
  await growthDialog.locator('input[type="number"]').nth(0).fill("7.34");
  await growthDialog.locator('input[type="number"]').nth(1).fill("68.2");
  await growthDialog.locator('input[type="number"]').nth(2).fill("42.3");
  assert.equal(await growthSave.isEnabled(), true);
  await growthSave.click();
  await growthDialog.waitFor({ state: "hidden" });
  const firstGrowthRecord = page.locator(".growth-history-list article").filter({ hasText: "7.34 kg" });
  await firstGrowthRecord.waitFor();

  const longGrowthNote = "https://example.test/very-long-growth-note-".repeat(6);
  await page.getByRole("button", { name: "添加测量" }).click();
  await growthDialog.locator('input[type="number"]').nth(0).fill("7.35");
  await growthDialog.locator('input[type="number"]').nth(1).fill("68.5");
  await growthDialog.locator('input[type="number"]').nth(2).fill("42.5");
  await growthDialog.locator("textarea").fill(longGrowthNote);
  await growthDialog.getByRole("button", { name: "添加记录" }).click();
  await growthDialog.waitFor({ state: "hidden" });
  let currentGrowthRecord = page.locator(".growth-history-list article").filter({ hasText: "7.35 kg" });
  await currentGrowthRecord.waitFor();
  assert.equal(await page.locator('.growth-chart g[role="button"]').count(), 2);
  assert.match(await page.locator(".growth-summary-grid article").filter({ hasText: "体重" }).textContent(), /7\.35 kg[\s\S]*较上次 \+0\.01 kg/);
  assert.match(await page.locator(".growth-chart-inspector").textContent(), /7\.35 kg[\s\S]*第 2\/2/);
  assert.equal(await currentGrowthRecord.evaluate((element) => element.scrollWidth <= element.clientWidth + 1), true);
  assert.equal(await currentGrowthRecord.getByRole("button", { name: "编辑" }).isVisible(), true);
  assert.equal(await currentGrowthRecord.getByRole("button", { name: "删除" }).isVisible(), true);

  await page.getByRole("button", { name: "身长/身高", exact: true }).click();
  assert.match(await page.locator(".growth-chart-inspector").textContent(), /68\.5 cm/);
  assert.equal((await page.locator('.growth-chart path[data-percentile="P50"]').getAttribute("d")).match(/M/g)?.length, 2);
  await page.getByRole("button", { name: "头围", exact: true }).click();
  assert.match(await page.locator(".growth-chart-inspector").textContent(), /42\.5 cm/);
  await page.getByRole("button", { name: "体重", exact: true }).click();

  await currentGrowthRecord.getByRole("button", { name: "编辑" }).click();
  const growthEditDialog = page.getByRole("dialog", { name: "编辑测量" });
  assert.equal(await growthEditDialog.locator('input[type="number"]').nth(0).inputValue(), "7.35");
  await growthEditDialog.locator('input[type="number"]').nth(0).fill("7.36");
  await growthEditDialog.getByRole("button", { name: "保存修改" }).click();
  await growthEditDialog.waitFor({ state: "hidden" });
  currentGrowthRecord = page.locator(".growth-history-list article").filter({ hasText: "7.36 kg" });
  await currentGrowthRecord.waitFor();
  assert.match(await page.locator(".growth-summary-grid article").filter({ hasText: "体重" }).textContent(), /7\.36 kg[\s\S]*较上次 \+0\.02 kg/);

  const babyResponse = await page.request.get(`${baseUrl}/api/baby`);
  const babyText = await babyResponse.text();
  assert.equal(babyResponse.status(), 200, babyText);
  const babyProfile = JSON.parse(babyText).baby;
  const updateBabySex = async (sex) => {
    const response = await page.request.patch(`${baseUrl}/api/baby`, {
      headers: { origin: new URL(baseUrl).origin },
      data: { name: babyProfile.name, birthDate: babyProfile.birthDate, timezone: babyProfile.timezone, sex },
    });
    assert.equal(response.status(), 200, await response.text());
  };
  await updateBabySex("unknown");
  await page.reload({ waitUntil: "networkidle" });
  assert.equal(await page.locator(".growth-chart path[data-percentile]").count(), 0);
  assert.equal(await page.locator('.growth-chart g[role="button"]').count(), 2);
  assert.match(await page.locator(".growth-standard-gate").textContent(), /设置性别后显示 WHO 标准曲线/);
  await updateBabySex("female");
  await page.reload({ waitUntil: "networkidle" });
  assert.equal(await page.locator(".growth-chart path[data-percentile]").count(), 5);
  assert.equal(await page.locator('.growth-chart g[role="button"]').count(), 2);

  await page.getByRole("button", { name: "添加测量" }).click();
  await growthDialog.locator('input[type="number"]').nth(0).fill("8.1");
  await growthDialog.getByRole("button", { name: "添加记录" }).click();
  const duplicateGrowthError = growthDialog.locator('.form-error[role="alert"]');
  await duplicateGrowthError.waitFor();
  assert.match(await duplicateGrowthError.textContent(), /这一天已经有一条生长记录/);
  assert.equal(await growthDialog.isVisible(), true);
  await growthDialog.getByRole("button", { name: "关闭" }).click();
  await growthDialog.waitFor({ state: "hidden" });

  await page.route("**/api/growth/*", (route) => {
    if (route.request().method() !== "DELETE") return route.continue();
    return route.fulfill({
      status: 500,
      contentType: "application/json; charset=utf-8",
      body: JSON.stringify({ error: "模拟生长删除失败" }),
    });
  });
  page.once("dialog", (confirmation) => confirmation.accept());
  await currentGrowthRecord.getByRole("button", { name: "删除" }).click();
  const inlineGrowthError = currentGrowthRecord.locator('.growth-record-error[role="alert"]');
  await inlineGrowthError.waitFor();
  assert.match(await inlineGrowthError.textContent(), /模拟生长删除失败/);
  assert.equal(await growthError.count(), 0);
  assert.equal(await currentGrowthRecord.count(), 1);
  assert.equal(await currentGrowthRecord.getByRole("button", { name: "删除" }).isEnabled(), true);

  await page.unroute("**/api/growth/*");

  await page.goto(`${baseUrl}/`, { waitUntil: "networkidle" });
  await page.getByRole("heading", { name: "日常记录" }).waitFor();
  await page.getByRole("heading", { name: "成长与健康" }).waitFor();
  assert.equal(await page.locator(".home-focus-card").count(), 6);
  assert.equal(await page.locator(".home-focus-grid.daily").evaluate((element) => getComputedStyle(element).gridTemplateColumns.split(" ").length), 2);
  await page.getByRole("link", { name: /查看睡眠记录/ }).waitFor();
  await page.getByRole("link", { name: /查看尿布记录/ }).waitFor();

  await page.goto(`${baseUrl}/diapers`, { waitUntil: "networkidle" });
  await page.getByRole("heading", { name: /尿布记录/ }).waitFor();
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth), false);
  await page.locator(".diaper-summary-grid").waitFor();
  const diaperDateInput = page.locator('input[aria-label="查看尿布日期"]');
  const diaperError = page.locator('.module-error[role="alert"]');

  const quickDirty = page.locator(".diaper-quick-actions button.dirty");
  await quickDirty.click();
  const diaperDialog = page.getByRole("dialog", { name: "记录大便" });
  await diaperDialog.waitFor();
  assert.equal(await diaperDialog.getByRole("button", { name: "大便", exact: true }).getAttribute("aria-pressed"), "true");
  await diaperDialog.locator(".diaper-form-section.dirty select").nth(0).selectOption("large");
  await diaperDialog.locator(".diaper-form-section.dirty select").nth(1).selectOption("other");
  await diaperDialog.locator(".diaper-form-section.dirty select").nth(2).selectOption("other");
  await diaperDialog.getByLabel("观察到发红").check();
  const diaperNote = `diaper-browser-${Date.now()}`;
  await diaperDialog.locator("textarea").fill(diaperNote);
  await diaperDialog.getByRole("button", { name: "保存记录" }).click();
  await diaperDialog.waitFor({ state: "hidden" });
  await page.waitForFunction(() => document.activeElement?.textContent?.includes("大便"));

  const diaperCard = page.locator(".diaper-record-card").filter({ hasText: diaperNote });
  await diaperCard.waitFor();
  assert.match(await diaperCard.textContent(), /大便 多/);
  assert.deepEqual(await diaperCard.locator(".diaper-record-values span").allTextContents(), ["大便 多", "其他", "其他"]);
  assert.match(await diaperCard.textContent(), /观察到发红/);

  await diaperCard.getByRole("button", { name: "编辑" }).click();
  const diaperEditDialog = page.getByRole("dialog", { name: "编辑尿布记录" });
  await diaperEditDialog.getByRole("button", { name: "小便", exact: true }).click();
  await diaperEditDialog.locator(".diaper-form-section.wet select").selectOption("small");
  assert.equal(await diaperEditDialog.locator(".diaper-form-section.dirty").count(), 0);
  await diaperEditDialog.getByRole("button", { name: "保存修改" }).click();
  await diaperEditDialog.waitFor({ state: "hidden" });
  await page.waitForFunction((noteText) => [...document.querySelectorAll(".diaper-record-card")].some((card) => card.textContent?.includes(noteText) && card.textContent?.includes("小便 少") && !card.textContent?.includes("其他")), diaperNote);

  await page.route("**/api/diapers/*", (route) => {
    if (route.request().method() !== "DELETE") return route.continue();
    return route.fulfill({
      status: 500,
      contentType: "application/json; charset=utf-8",
      body: JSON.stringify({ error: "模拟尿布删除失败" }),
    });
  });
  page.once("dialog", (confirmation) => confirmation.accept());
  await diaperCard.getByRole("button", { name: "删除" }).click();
  await diaperError.waitFor();
  assert.match(await diaperError.textContent(), /模拟尿布删除失败/);
  assert.equal(await diaperCard.count(), 1);
  assert.equal(await diaperCard.getByRole("button", { name: "删除" }).isEnabled(), true);
  await page.unroute("**/api/diapers/*");

  let releaseDiaperDelete;
  let markDiaperDeleteStarted;
  let markDiaperDeleteFinished;
  const diaperDeleteGate = new Promise((resolve) => { releaseDiaperDelete = resolve; });
  const diaperDeleteStarted = new Promise((resolve) => { markDiaperDeleteStarted = resolve; });
  const diaperDeleteFinished = new Promise((resolve) => { markDiaperDeleteFinished = resolve; });
  await page.route("**/api/diapers/*", async (route) => {
    if (route.request().method() !== "DELETE") return route.continue();
    markDiaperDeleteStarted();
    await diaperDeleteGate;
    await route.fulfill({
      status: 500,
      contentType: "application/json; charset=utf-8",
      body: JSON.stringify({ error: "不应污染新日期的删除错误" }),
    });
    markDiaperDeleteFinished();
  });
  page.once("dialog", (confirmation) => confirmation.accept());
  await diaperCard.getByRole("button", { name: "删除" }).click();
  await diaperDeleteStarted;
  await page.getByRole("button", { name: "前一天" }).click();
  await page.waitForFunction((value) => document.querySelector('input[aria-label="查看尿布日期"]')?.value === value, previousDate);
  releaseDiaperDelete();
  await diaperDeleteFinished;
  await page.evaluate(() => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve))));
  assert.equal(await diaperError.count(), 0);
  await page.unroute("**/api/diapers/*");
  await page.getByRole("button", { name: "回到今天" }).click();
  await page.waitForFunction((value) => document.querySelector('input[aria-label="查看尿布日期"]')?.value === value, today);
  await diaperCard.waitFor();
  assert.equal(await diaperDateInput.inputValue(), today);
  assert.equal(await diaperCard.getByRole("button", { name: "删除" }).isEnabled(), true);

  page.once("dialog", (confirmation) => confirmation.accept());
  await diaperCard.getByRole("button", { name: "删除" }).click();
  await diaperCard.waitFor({ state: "detached" });

  await page.route("**/api/diapers?*", (route) => route.fulfill({
    status: 500,
    contentType: "application/json; charset=utf-8",
    body: JSON.stringify({ error: "模拟尿布加载失败" }),
  }));
  await page.reload({ waitUntil: "networkidle" });
  await diaperError.waitFor();
  assert.match(await diaperError.textContent(), /模拟尿布加载失败/);
  assert.equal(await page.locator(".diaper-summary-grid, .diaper-timeline-card, .diaper-state-card").count(), 0);
  await page.unroute("**/api/diapers?*");
  await page.getByRole("button", { name: "重新加载" }).click();
  await page.locator(".diaper-record-card").filter({ hasText: "留给浏览器测试" }).waitFor();
  assert.equal(await diaperError.count(), 0);

  await page.goto(`${baseUrl}/sleep`, { waitUntil: "networkidle" });
  await page.getByRole("heading", { name: /睡眠记录/ }).waitFor();
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth), false);
  await page.locator(".sleep-state-card.empty").waitFor();
  const sleepDateInput = page.locator('input[aria-label="查看睡眠日期"]');
  const sleepToday = await sleepDateInput.inputValue();
  const sleepPreviousDate = shiftDate(sleepToday, -1);
  const sleepTwoDaysAgo = shiftDate(sleepToday, -2);
  const sleepError = page.locator('.module-error[role="alert"]');

  const manualSleepTrigger = page.getByRole("button", { name: "补录睡眠" }).first();
  await manualSleepTrigger.click();
  let manualSleepDialog = page.getByRole("dialog", { name: "补录睡眠" });
  await manualSleepDialog.waitFor();
  await page.keyboard.press("Escape");
  await manualSleepDialog.waitFor({ state: "hidden" });
  await page.waitForFunction(() => document.activeElement?.textContent?.includes("补录睡眠"));

  await page.getByRole("button", { name: "前一天" }).click();
  await page.waitForFunction((value) => document.querySelector('input[aria-label="查看睡眠日期"]')?.value === value, sleepPreviousDate);
  await page.locator(".sleep-state-card.empty").waitFor();
  await page.getByRole("button", { name: "补录睡眠" }).first().click();
  manualSleepDialog = page.getByRole("dialog", { name: "补录睡眠" });
  await manualSleepDialog.locator('input[type="date"]').nth(0).fill(sleepTwoDaysAgo);
  await manualSleepDialog.locator('input[type="time"]').nth(0).fill("23:30");
  await manualSleepDialog.locator('input[type="date"]').nth(1).fill(sleepPreviousDate);
  await manualSleepDialog.locator('input[type="time"]').nth(1).fill("01:15");
  const crossMidnightNote = `跨午夜浏览器测试-${Date.now()}`;
  await manualSleepDialog.locator("textarea").fill(crossMidnightNote);
  const manualSave = manualSleepDialog.getByRole("button", { name: "保存补录" });
  assert.equal(await manualSave.isEnabled(), true);
  await manualSave.click();
  await manualSleepDialog.waitFor({ state: "hidden" });

  let crossMidnightCard = page.locator(".sleep-record-card").filter({ hasText: crossMidnightNote });
  await crossMidnightCard.waitFor();
  assert.match(await crossMidnightCard.textContent(), /前一日开始/);
  assert.match(await crossMidnightCard.textContent(), /本日计入 1 小时 15 分钟/);
  await crossMidnightCard.getByRole("button", { name: /编辑/ }).click();
  const sleepEditDialog = page.getByRole("dialog", { name: "编辑睡眠" });
  const updatedSleepNote = `${crossMidnightNote}-已编辑`;
  await sleepEditDialog.locator("textarea").fill(updatedSleepNote);
  await sleepEditDialog.getByRole("button", { name: "保存修改" }).click();
  await sleepEditDialog.waitFor({ state: "hidden" });
  crossMidnightCard = page.locator(".sleep-record-card").filter({ hasText: updatedSleepNote });
  await crossMidnightCard.waitFor();

  await page.route("**/api/sleeps/*", (route) => {
    if (route.request().method() !== "DELETE") return route.continue();
    return route.fulfill({
      status: 500,
      contentType: "application/json; charset=utf-8",
      body: JSON.stringify({ error: "模拟睡眠删除失败" }),
    });
  });
  page.once("dialog", (confirmation) => confirmation.accept());
  await crossMidnightCard.getByRole("button", { name: /删除/ }).click();
  await sleepError.waitFor();
  assert.match(await sleepError.textContent(), /模拟睡眠删除失败/);
  assert.equal(await crossMidnightCard.count(), 1);
  assert.equal(await crossMidnightCard.getByRole("button", { name: /删除/ }).isEnabled(), true);
  await page.unroute("**/api/sleeps/*");

  await page.getByRole("button", { name: "回到今天" }).click();
  await page.waitForFunction((value) => document.querySelector('input[aria-label="查看睡眠日期"]')?.value === value, sleepToday);
  await page.getByRole("button", { name: "开始睡眠" }).first().click();
  const startSleepDialog = page.getByRole("dialog", { name: "开始睡眠" });
  const startDateInput = startSleepDialog.locator('input[type="date"]');
  const startTimeInput = startSleepDialog.locator('input[type="time"]');
  const safeStart = shiftLocalMinute(await startDateInput.inputValue(), await startTimeInput.inputValue(), -1);
  await startDateInput.fill(safeStart.date);
  await startTimeInput.fill(safeStart.time);
  const activeSleepNote = `进行中浏览器测试-${Date.now()}`;
  await startSleepDialog.locator("textarea").fill(activeSleepNote);
  await startSleepDialog.getByRole("button", { name: "确认开始" }).click();
  await startSleepDialog.waitFor({ state: "hidden" });
  const activeSleepCard = page.locator(".sleep-active-card");
  await activeSleepCard.waitFor();
  await page.locator(".sleep-record-card.active").filter({ hasText: activeSleepNote }).waitFor();

  await page.getByRole("button", { name: "前一天" }).click();
  await page.waitForFunction((value) => document.querySelector('input[aria-label="查看睡眠日期"]')?.value === value, sleepPreviousDate);
  await crossMidnightCard.waitFor();
  await activeSleepCard.waitFor();
  const historicalRecent = await page.locator(".sleep-summary-grid article.recent").textContent();
  assert.match(historicalRecent, /23:30/);
  assert.match(historicalRecent, /01:15 结束/);
  assert.doesNotMatch(historicalRecent, /睡眠中/);
  await page.getByRole("button", { name: "回到今天" }).click();
  await page.waitForFunction((value) => document.querySelector('input[aria-label="查看睡眠日期"]')?.value === value, sleepToday);
  await activeSleepCard.waitFor();

  await activeSleepCard.getByRole("button", { name: "结束睡眠" }).click();
  const endSleepDialog = page.getByRole("dialog", { name: "结束睡眠" });
  assert.match(await endSleepDialog.textContent(), /结束时间以服务器当前时刻为准/);
  await endSleepDialog.getByRole("button", { name: "确认结束" }).click();
  await endSleepDialog.waitFor({ state: "hidden" });
  await activeSleepCard.waitFor({ state: "detached" });
  const endedSleepCard = page.locator(".sleep-record-card.completed").filter({ hasText: activeSleepNote });
  await endedSleepCard.waitFor();
  page.once("dialog", (confirmation) => confirmation.accept());
  await endedSleepCard.getByRole("button", { name: /删除/ }).click();
  await page.locator(".sleep-state-card.empty").waitFor();

  await page.getByRole("button", { name: "前一天" }).click();
  await page.waitForFunction((value) => document.querySelector('input[aria-label="查看睡眠日期"]')?.value === value, sleepPreviousDate);
  crossMidnightCard = page.locator(".sleep-record-card").filter({ hasText: updatedSleepNote });
  await crossMidnightCard.waitFor();
  page.once("dialog", (confirmation) => confirmation.accept());
  await crossMidnightCard.getByRole("button", { name: /删除/ }).click();
  await page.locator(".sleep-state-card.empty").waitFor();
  await page.getByRole("button", { name: "回到今天" }).click();
  await page.waitForFunction((value) => document.querySelector('input[aria-label="查看睡眠日期"]')?.value === value, sleepToday);

  await page.route("**/api/sleeps?*", (route) => route.fulfill({
    status: 500,
    contentType: "application/json; charset=utf-8",
    body: JSON.stringify({ error: "模拟睡眠加载失败" }),
  }));
  await page.reload({ waitUntil: "networkidle" });
  await sleepError.waitFor();
  assert.match(await sleepError.textContent(), /模拟睡眠加载失败/);
  assert.equal(await page.locator(".sleep-summary-grid, .sleep-timeline-card, .sleep-state-card").count(), 0);
  await page.unroute("**/api/sleeps?*");
  await page.getByRole("button", { name: "重新加载" }).click();
  await page.locator(".sleep-state-card.empty").waitFor();
  assert.equal(await sleepError.count(), 0);
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
  assert.deepEqual(await mobilePage.locator(".care-bottom-nav a").allTextContents(), ["首页", "喂养", "睡眠", "尿布", "更多"]);
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

  const mobileSleepEnd = currentMinuteInShanghai();
  const mobileSleepStart = shiftLocalMinute(mobileSleepEnd.date, mobileSleepEnd.time, -175);
  const mobileSleepResponse = await mobile.request.post(`${baseUrl}/api/sleeps`, {
    headers: { origin: new URL(baseUrl).origin },
    data: {
      startedDate: mobileSleepStart.date,
      startedTime: mobileSleepStart.time,
      endedDate: mobileSleepEnd.date,
      endedTime: mobileSleepEnd.time,
      note: "移动端长时长显示测试",
    },
  });
  const mobileSleepResponseText = await mobileSleepResponse.text();
  assert.equal(mobileSleepResponse.status(), 201, mobileSleepResponseText);
  const mobileSleepRecord = JSON.parse(mobileSleepResponseText).record;

  await mobilePage.goto(`${baseUrl}/sleep`, { waitUntil: "networkidle" });
  assert.equal(await mobilePage.locator(".care-bottom-nav a.active").textContent(), "睡眠");
  assert.equal(await mobilePage.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth), false);
  assert.deepEqual(await undersizedTouchTargets(mobilePage), []);
  const mobileSleepTotal = mobilePage.locator(".sleep-summary-grid article.total strong");
  assert.equal(await mobileSleepTotal.textContent(), "2 小时 55 分钟");
  const mobileSleepTotalSize = await mobileSleepTotal.evaluate((element) => ({
    clientWidth: element.clientWidth,
    scrollWidth: element.scrollWidth,
    text: element.textContent,
  }));
  assert.ok(mobileSleepTotalSize.scrollWidth <= mobileSleepTotalSize.clientWidth + 1, `mobile sleep duration is clipped: ${JSON.stringify(mobileSleepTotalSize)}`);
  await mobilePage.getByRole("button", { name: "补录睡眠" }).first().click();
  const mobileSleepDialog = mobilePage.getByRole("dialog", { name: "补录睡眠" });
  const sleepBounds = await mobileSleepDialog.boundingBox();
  assert.ok(sleepBounds && Math.abs(sleepBounds.y + sleepBounds.height - 844) <= 1, `mobile sleep dialog is not bottom aligned: ${JSON.stringify(sleepBounds)}`);
  assert.ok(sleepBounds && Math.abs(sleepBounds.width - 390) <= 1, `mobile sleep dialog is not full width: ${JSON.stringify(sleepBounds)}`);
  const sleepSaveBounds = await mobileSleepDialog.getByRole("button", { name: "保存补录" }).boundingBox();
  assert.ok(sleepSaveBounds && sleepSaveBounds.y + sleepSaveBounds.height <= 844, `mobile sleep action is not visible: ${JSON.stringify(sleepSaveBounds)}`);
  await mobileSleepDialog.getByRole("button", { name: "关闭" }).click();
  await mobileSleepDialog.waitFor({ state: "hidden" });
  await mobilePage.waitForFunction(() => document.activeElement?.textContent?.includes("补录睡眠"));
  const mobileSleepDelete = await mobile.request.delete(`${baseUrl}/api/sleeps/${mobileSleepRecord.id}`, {
    headers: { origin: new URL(baseUrl).origin },
  });
  assert.equal(mobileSleepDelete.status(), 200, await mobileSleepDelete.text());

  await mobilePage.goto(`${baseUrl}/diapers`, { waitUntil: "networkidle" });
  assert.equal(await mobilePage.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth), false);
  assert.deepEqual(await undersizedTouchTargets(mobilePage), []);
  const mobileDiaperTrigger = mobilePage.locator(".diaper-quick-actions button.wet");
  await mobileDiaperTrigger.click();
  const mobileDiaperDialog = mobilePage.getByRole("dialog", { name: "记录小便" });
  const diaperBounds = await mobileDiaperDialog.boundingBox();
  assert.ok(diaperBounds && Math.abs(diaperBounds.y + diaperBounds.height - 844) <= 1, `mobile diaper dialog is not bottom aligned: ${JSON.stringify(diaperBounds)}`);
  assert.ok(diaperBounds && Math.abs(diaperBounds.width - 390) <= 1, `mobile diaper dialog is not full width: ${JSON.stringify(diaperBounds)}`);
  const diaperSaveBounds = await mobileDiaperDialog.getByRole("button", { name: "保存记录" }).boundingBox();
  assert.ok(diaperSaveBounds && diaperSaveBounds.y + diaperSaveBounds.height <= 844, `mobile diaper action is not visible: ${JSON.stringify(diaperSaveBounds)}`);
  await mobileDiaperDialog.getByRole("button", { name: "关闭" }).click();
  await mobileDiaperDialog.waitFor({ state: "hidden" });
  await mobilePage.waitForFunction(() => document.activeElement?.textContent?.includes("小便"));

  await mobilePage.goto(`${baseUrl}/more`, { waitUntil: "networkidle" });
  await mobilePage.getByRole("heading", { name: "更多功能" }).waitFor();
  assert.deepEqual(await mobilePage.locator(".more-module-card").allTextContents(), ["辅食日记辅食计划、食材与实际反馈", "生长记录体重、身高与头围趋势", "疫苗记录接种计划与接种事实", "家庭设置宝宝资料、密码与辅食库"]);
  assert.deepEqual(await mobilePage.locator(".more-section-heading h2").allTextContents(), ["日常记录", "成长与健康", "家庭空间"]);
  assert.equal(await mobilePage.locator(".care-bottom-nav a.active").textContent(), "更多");
  assert.deepEqual(await undersizedTouchTargets(mobilePage), []);

  await mobilePage.goto(`${baseUrl}/growth`, { waitUntil: "networkidle" });
  assert.equal(await mobilePage.locator(".care-bottom-nav a.active").textContent(), "更多");
  assert.equal(await mobilePage.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth), false);
  assert.deepEqual(await undersizedTouchTargets(mobilePage), []);
  await mobilePage.locator(".growth-chart-inspector").waitFor();
  assert.match(await mobilePage.locator(".growth-chart-inspector").textContent(), /7\.36 kg[\s\S]*第 2\/2/);
  const mobileGrowthChartSize = await mobilePage.locator(".growth-chart-scroll").evaluate((element) => ({ clientWidth: element.clientWidth, scrollWidth: element.scrollWidth }));
  assert.ok(mobileGrowthChartSize.scrollWidth <= mobileGrowthChartSize.clientWidth + 1, `mobile growth chart is clipped: ${JSON.stringify(mobileGrowthChartSize)}`);
  const mobileGrowthChartBounds = await mobilePage.locator(".growth-chart").boundingBox();
  const latestGrowthPointBounds = await mobilePage.locator(".growth-chart .growth-point-dot").last().boundingBox();
  assert.ok(mobileGrowthChartBounds && latestGrowthPointBounds && latestGrowthPointBounds.x + latestGrowthPointBounds.width <= mobileGrowthChartBounds.x + mobileGrowthChartBounds.width + 1, `latest growth point is outside the chart: ${JSON.stringify({ mobileGrowthChartBounds, latestGrowthPointBounds })}`);
  const mobileLongGrowthRecord = mobilePage.locator(".growth-history-list article").filter({ hasText: longGrowthNote });
  await mobileLongGrowthRecord.waitFor();
  assert.equal(await mobileLongGrowthRecord.evaluate((element) => element.scrollWidth <= element.clientWidth + 1), true);
  assert.equal(await mobileLongGrowthRecord.getByRole("button", { name: "编辑" }).isVisible(), true);
  assert.equal(await mobileLongGrowthRecord.getByRole("button", { name: "删除" }).isVisible(), true);
  assert.match(await mobileLongGrowthRecord.locator("time").textContent(), /月\d+天/);
  assert.equal(await mobilePage.locator(".growth-chart path[data-percentile]").count(), 5);
  assert.equal(await mobilePage.getByLabel("选择生长曲线年龄范围").isVisible(), true);
  await mobilePage.getByRole("button", { name: "身长/身高", exact: true }).click();
  assert.match(await mobilePage.locator(".growth-chart-inspector").textContent(), /68\.5 cm/);
  await mobilePage.getByRole("button", { name: "体重", exact: true }).click();
  const mobileGrowthTrigger = mobilePage.getByRole("button", { name: "添加测量" });
  await mobileGrowthTrigger.click();
  const mobileGrowthDialog = mobilePage.getByRole("dialog", { name: "添加测量" });
  const growthBounds = await mobileGrowthDialog.boundingBox();
  assert.ok(growthBounds && Math.abs(growthBounds.y + growthBounds.height - 844) <= 1, `mobile growth dialog is not bottom aligned: ${JSON.stringify(growthBounds)}`);
  assert.ok(growthBounds && Math.abs(growthBounds.width - 390) <= 1, `mobile growth dialog is not full width: ${JSON.stringify(growthBounds)}`);
  assert.equal(await mobileGrowthDialog.getByRole("button", { name: "添加记录" }).isDisabled(), true);
  await mobileGrowthDialog.getByRole("button", { name: "关闭" }).click();
  await mobileGrowthDialog.waitFor({ state: "hidden" });
  await mobilePage.waitForFunction(() => document.activeElement?.textContent?.includes("添加测量"));
  const growthCleanupResponse = await mobile.request.get(`${baseUrl}/api/growth`);
  const growthCleanupText = await growthCleanupResponse.text();
  assert.equal(growthCleanupResponse.status(), 200, growthCleanupText);
  const growthCleanupRecords = JSON.parse(growthCleanupText).records;
  for (const record of growthCleanupRecords) {
    const deletedGrowth = await mobile.request.delete(`${baseUrl}/api/growth/${record.id}`, { headers: { origin: new URL(baseUrl).origin } });
    assert.equal(deletedGrowth.status(), 200, await deletedGrowth.text());
  }

  await mobilePage.goto(`${baseUrl}/vaccines`, { waitUntil: "networkidle" });
  assert.equal(await mobilePage.locator(".care-bottom-nav a.active").textContent(), "更多");
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
  assert.equal(await mobilePage.locator(".care-bottom-nav a.active").textContent(), "更多");
  await mobilePage.getByRole("button", { name: "退出登录" }).waitFor();
  await mobile.close();
} finally {
  await browser.close();
}

console.log("Browser smoke passed: growth, sleep, diaper, feeding and vaccination CRUD, scalable navigation, tracker retries, responsive layout, touch targets, and focus");
