import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { SleepRecordForm, SleepTracker, type SleepRecord } from "../components/SleepTracker";

const baby = { id: "baby-1", name: "DoDo", birthDate: "2026-01-01", timezone: "Asia/Shanghai" };

const completedRecord: SleepRecord = {
  id: "sleep-1",
  babyId: baby.id,
  startedAt: "2026-07-10T02:00:00.000Z",
  endedAt: "2026-07-10T03:30:00.000Z",
  startedDate: "2026-07-10",
  startedTime: "10:00",
  endedDate: "2026-07-10",
  endedTime: "11:30",
  recordTimezone: baby.timezone,
  note: "上午小睡",
  createdAt: "2026-07-10T02:00:00.000Z",
  updatedAt: "2026-07-10T03:30:00.000Z",
  durationMinutes: 90,
  dayMinutes: 90,
};

test("睡眠模块首次渲染只显示加载状态并保留独立入口", () => {
  const html = renderToStaticMarkup(createElement(SleepTracker, { baby }));
  const source = readFileSync(new URL("../components/SleepTracker.tsx", import.meta.url), "utf8");

  assert.match(html, /DoDo的睡眠记录/);
  assert.match(html, /正在整理今日睡眠/);
  assert.match(html, /开始睡眠/);
  assert.match(html, /补录睡眠/);
  assert.match(html, /aria-label="前一天"/);
  assert.match(html, /aria-label="后一天"/);
  assert.match(html, /aria-labelledby="sleep-dialog-title"/);
  assert.doesNotMatch(html, /sleep-summary-grid/);
  assert.doesNotMatch(html, /今天还没有睡眠记录/);
  assert.match(source, /sleepMinutesWithinDay/);
  assert.match(source, /\/api\/sleeps\/\$\{record\.id\}\/end/);
  assert.match(source, /这里只记录睡眠事实，不评价是否充足、规律或异常/);
  assert.match(source, /这段记录已超过 24 小时。仍可先结束/);
  assert.match(source, /window\.confirm/);
});

test("开始睡眠表单只要求开始时间且保留事实记录边界", () => {
  const html = renderToStaticMarkup(createElement(SleepRecordForm, {
    baby,
    date: "2026-07-10",
    mode: "start",
    record: null,
    onSaved: () => undefined,
    onCancel: () => undefined,
  }));

  assert.match(html, /开始日期/);
  assert.match(html, /开始时间/);
  assert.doesNotMatch(html, /结束日期/);
  assert.match(html, /确认后会显示为“睡眠中”/);
  assert.match(html, /只记录家庭观察到的事实/);
  assert.match(html, /maxLength="300"/);
  assert.match(html, />确认开始<\/button>/);
});

test("补录必须填写完整区间，编辑完成记录会预览持续时长", () => {
  const manualHtml = renderToStaticMarkup(createElement(SleepRecordForm, {
    baby,
    date: "2026-07-10",
    mode: "manual",
    record: null,
    onSaved: () => undefined,
    onCancel: () => undefined,
  }));
  const editHtml = renderToStaticMarkup(createElement(SleepRecordForm, {
    baby,
    date: "2026-07-10",
    mode: "edit",
    record: completedRecord,
    onSaved: () => undefined,
    onCancel: () => undefined,
  }));

  assert.match(manualHtml, /结束日期/);
  assert.match(manualHtml, /结束时间/);
  assert.match(manualHtml, /<button[^>]*disabled=""[^>]*>保存补录<\/button>/);
  assert.match(editHtml, /这段睡眠共 1 小时 30 分钟/);
  assert.match(editHtml, /<textarea[^>]*>上午小睡<\/textarea>/);
  assert.doesNotMatch(editHtml, /<button[^>]*disabled=""[^>]*>保存修改<\/button>/);
});
