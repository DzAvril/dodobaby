import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import {
  VaccinationRecordForm,
  VaccinationNote,
  VaccinationTracker,
  vaccinationGroups,
  type VaccinationRecord,
} from "../components/VaccinationTracker";

const baby = { id: "baby-1", name: "DoDo", birthDate: "2026-01-01", timezone: "Asia/Shanghai" };

function record(overrides: Partial<VaccinationRecord>): VaccinationRecord {
  return {
    id: overrides.id ?? crypto.randomUUID(),
    babyId: "baby-1",
    vaccineName: "测试疫苗",
    doseNumber: 1,
    category: "unknown",
    status: "planned",
    plannedDate: "2026-07-11",
    plannedTime: null,
    administeredDate: null,
    manufacturer: null,
    batchNumber: null,
    administrationSite: null,
    vaccinationUnit: null,
    note: null,
    createdAt: "2026-07-01T00:00:00.000Z",
    updatedAt: "2026-07-01T00:00:00.000Z",
    ...overrides,
  };
}

test("疫苗模块独立呈现摘要、三类记录和固定免责声明", () => {
  const html = renderToStaticMarkup(createElement(VaccinationTracker, { baby }));
  const source = readFileSync(new URL("../components/VaccinationTracker.tsx", import.meta.url), "utf8");

  assert.match(html, /DoDo的疫苗记录/);
  assert.match(html, /正在整理疫苗记录/);
  assert.match(source, /下一次计划/);
  assert.match(source, /待接种/);
  assert.match(source, /待确认/);
  assert.match(source, /接种历史/);
  assert.match(source, /从家庭已有记录开始/);
  assert.match(html, /仅保存家庭自行录入的接种计划与接种事实，不提供接种建议；请以接种单位和官方接种记录为准/);
  assert.match(html, /aria-labelledby="vaccination-dialog-title"/);
  assert.match(source, /不会自动生成接种日程/);
});

test("疫苗记录按宝宝时区当日边界分为待接种、待确认和历史", () => {
  const todayPlan = record({ id: "today", plannedDate: "2026-07-11" });
  const futurePlan = record({ id: "future", plannedDate: "2026-07-20" });
  const pastPlan = record({ id: "past", plannedDate: "2026-07-10" });
  const completed = record({ id: "done", status: "completed", administeredDate: "2026-07-09" });

  const groups = vaccinationGroups([completed, futurePlan, pastPlan, todayPlan], "2026-07-11");

  assert.deepEqual(groups.upcoming.map((item) => item.id), ["today", "future"]);
  assert.deepEqual(groups.awaitingConfirmation.map((item) => item.id), ["past"]);
  assert.deepEqual(groups.completed.map((item) => item.id), ["done"]);
});

test("疫苗表单包含计划与接种事实字段且空名称不能保存", () => {
  const html = renderToStaticMarkup(createElement(VaccinationRecordForm, {
    baby,
    record: null,
    markCompleted: true,
    onSaved: () => undefined,
    onCancel: () => undefined,
  }));

  assert.match(html, /计划接种/);
  assert.match(html, /已接种/);
  assert.match(html, /疫苗名称/);
  assert.match(html, /剂次/);
  assert.match(html, /免疫规划疫苗/);
  assert.match(html, /非免疫规划疫苗/);
  assert.match(html, /实际接种日期/);
  assert.match(html, /生产厂家/);
  assert.match(html, /批号/);
  assert.match(html, /接种部位/);
  assert.match(html, /接种单位/);
  assert.match(html, /<button[^>]*disabled=""[^>]*>确认已接种<\/button>/);
  const dateInputs = [...html.matchAll(/<input type="date"([^>]*)>/g)].map((match) => match[1]);
  assert.equal(dateInputs.length, 2);
  assert.match(dateInputs[0], /value=""/);
  assert.doesNotMatch(dateInputs[1], /value=""/);
});

test("长疫苗备注默认折叠且仍可展开查看完整内容", () => {
  const shortNote = renderToStaticMarkup(createElement(VaccinationNote, { note: "短备注" }));
  const longText = "需要完整保留的接种备注".repeat(12);
  const longNote = renderToStaticMarkup(createElement(VaccinationNote, { note: longText }));
  assert.match(shortNote, /<p>短备注<\/p>/);
  assert.doesNotMatch(shortNote, /<details/);
  assert.match(longNote, /<details/);
  assert.match(longNote, /查看完整备注/);
  assert.match(longNote, new RegExp(longText));
});

test("桌面六个模块与手机五项可扩展导航保持隔离", () => {
  const shellSource = readFileSync(new URL("../components/AppShell.tsx", import.meta.url), "utf8");
  const homeSource = readFileSync(new URL("../components/HomeDashboard.tsx", import.meta.url), "utf8");
  const styles = readFileSync(new URL("../app/globals.css", import.meta.url), "utf8");
  const coreNavSource = shellSource.match(/const NAV_ITEMS = \[([\s\S]*?)\] as const;/)?.[1] ?? "";

  assert.equal((coreNavSource.match(/href:/g) ?? []).length, 6);
  assert.match(coreNavSource, /href: "\/diapers"/);
  assert.match(coreNavSource, /href: "\/vaccines"/);
  assert.doesNotMatch(coreNavSource, /href: "\/settings"/);
  assert.match(homeSource, /Promise\.allSettled/);
  assert.match(homeSource, /jsonRequest<\{ records: VaccinationRecord\[\] \}>\("\/api\/vaccines"\)/);
  assert.match(homeSource, /vaccineFailed/);
  assert.match(homeSource, /jsonRequest<DiaperDayResponse>\(`\/api\/diapers\?date=\$\{today\}`\)/);
  assert.match(homeSource, /diaperFailed/);
  assert.equal((homeSource.match(/className="home-focus-card /g) ?? []).length, 5);
  assert.doesNotMatch(homeSource, /className="module-card"/);
  assert.match(shellSource, /const MOBILE_NAV_ITEMS = \[NAV_ITEMS\[0\], NAV_ITEMS\[1\], NAV_ITEMS\[2\], NAV_ITEMS\[3\], MORE_ITEM\]/);
  assert.match(shellSource, /isMoreActive/);
  assert.match(styles, /grid-template-columns: repeat\(5, 1fr\)/);
  assert.match(styles, /padding-bottom: calc\(24px \+ env\(safe-area-inset-bottom\)\)/);
});
