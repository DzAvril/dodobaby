import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { MedicationPlanForm, MedicationRecordForm, MedicationTracker } from "../components/MedicationTracker";

const baby = { id: "baby-1", name: "DoDo", birthDate: "2026-01-01", timezone: "Asia/Shanghai" };

test("用药模块独立呈现按日安排、实际记录和计划管理", () => {
  const html = renderToStaticMarkup(createElement(MedicationTracker, { baby }));
  const source = readFileSync(new URL("../components/MedicationTracker.tsx", import.meta.url), "utf8");
  assert.match(html, /DoDo的用药记录/);
  assert.match(html, /正在整理今日用药/);
  assert.match(source, /\{dayWord\}安排/);
  assert.match(source, /实际记录/);
  assert.match(source, /用药计划/);
  assert.match(source, /补录用药/);
  assert.match(source, /\/api\/medications/);
});

test("计划表单包含品种、剂量、间隔天数、多个时间和日期范围", () => {
  const html = renderToStaticMarkup(createElement(MedicationPlanForm, {
    baby,
    date: "2026-07-13",
    plan: null,
    onSaved: () => undefined,
    onCancel: () => undefined,
  }));
  assert.match(html, /药品名称/);
  assert.match(html, /用药量/);
  assert.match(html, /间隔天数/);
  assert.match(html, /开始日期/);
  assert.match(html, /结束日期/);
  assert.match(html, /每轮用药时间/);
  assert.match(html, /每天 08:00/);
  assert.match(html, /<button[^>]*disabled=""[^>]*>创建计划<\/button>/);
});

test("手工补录要求药品和用药量，计划登记使用计划快照", () => {
  const manual = renderToStaticMarkup(createElement(MedicationRecordForm, {
    baby,
    date: "2026-07-13",
    editor: { plan: null, scheduledTime: null },
    onSaved: () => undefined,
    onCancel: () => undefined,
  }));
  assert.match(manual, /实际用药量/);
  assert.match(manual, /<button[^>]*disabled=""[^>]*>登记已服<\/button>/);

  const planned = renderToStaticMarkup(createElement(MedicationRecordForm, {
    baby,
    date: "2026-07-13",
    editor: { plan: {
      id: "plan-1", babyId: "baby-1", medicationName: "维生素 D3", doseAmount: 1, doseUnit: "滴",
      intervalDays: 2, scheduledTimes: ["08:00"], startDate: "2026-07-13", endDate: null, note: null,
      createdAt: "2026-07-13T00:00:00.000Z", updatedAt: "2026-07-13T00:00:00.000Z",
    }, scheduledTime: "08:00" },
    onSaved: () => undefined,
    onCancel: () => undefined,
  }));
  assert.match(planned, /维生素 D3/);
  assert.match(planned, /1 滴 · 计划 08:00/);
  assert.doesNotMatch(planned, /实际用药量/);
});
