import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { FeedingRecordForm, FeedingTracker } from "../components/FeedingTracker";

const baby = { id: "baby-1", name: "DoDo", birthDate: "2026-01-01", timezone: "Asia/Shanghai" };

test("喂养模块提供独立摘要、日期切换、时间线和编辑面板", () => {
  const html = renderToStaticMarkup(createElement(FeedingTracker, { baby }));

  assert.match(html, /DoDo的喂养记录/);
  assert.match(html, /最近一次/);
  assert.match(html, /今日亲喂/);
  assert.match(html, /今日瓶喂/);
  assert.match(html, /时间线/);
  assert.match(html, /aria-label="前一天"/);
  assert.match(html, /aria-label="后一天"/);
  assert.match(html, /aria-labelledby="feeding-dialog-title"/);
});

test("喂养表单允许同一会话记录亲喂和两类瓶喂且空表单不可保存", () => {
  const html = renderToStaticMarkup(createElement(FeedingRecordForm, {
    baby,
    date: "2026-07-11",
    record: null,
    onSaved: () => undefined,
    onCancel: () => undefined,
  }));

  assert.match(html, /亲喂时长/);
  assert.match(html, /左侧/);
  assert.match(html, /右侧/);
  assert.match(html, /母乳/);
  assert.match(html, /配方奶/);
  assert.match(html, /同一会话里混合喂养/);
  assert.match(html, /maxLength="300"/);
  assert.match(html, /type="time"[^>]*value="\d{2}:\d{2}"/);
  assert.match(html, /<button[^>]*disabled=""[^>]*>添加记录<\/button>/);
});

test("核心导航隔离喂养模块且首页接口故障互不清空", () => {
  const shellSource = readFileSync(new URL("../components/AppShell.tsx", import.meta.url), "utf8");
  const homeSource = readFileSync(new URL("../components/HomeDashboard.tsx", import.meta.url), "utf8");
  const coreNavSource = shellSource.match(/const NAV_ITEMS = \[([\s\S]*?)\] as const;/)?.[1] ?? "";

  assert.match(coreNavSource, /href: "\/feeding"/);
  assert.doesNotMatch(coreNavSource, /href: "\/settings"/);
  assert.match(homeSource, /Promise\.allSettled/);
  assert.match(homeSource, /href="\/feeding"/);
});
