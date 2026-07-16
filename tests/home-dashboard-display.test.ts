import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

test("首页使用紧凑日期页眉并只显示有效喂养值", () => {
  const source = readFileSync(new URL("../components/HomeDashboard.tsx", import.meta.url), "utf8");
  assert.match(source, /home-date-header/);
  assert.doesNotMatch(source, /今天也一起/);
  assert.match(source, /directMinutes > 0/);
  assert.match(source, /bottleMl > 0/);
});

test("首页直接区分尿布类型和具体用药状态", () => {
  const source = readFileSync(new URL("../components/HomeDashboard.tsx", import.meta.url), "utf8");
  assert.match(source, /小便 \$\{diapers\.summary\.wetCount\}/);
  assert.match(source, /大便 \$\{diapers\.summary\.dirtyCount\}/);
  assert.match(source, /已服 \$\{completedMedicationItems\.join/);
  assert.match(source, /待服 \$\{pendingMedicationItems\.join/);
});

test("首页按卡片业务提供一键动作和原地快捷录入", () => {
  const source = readFileSync(new URL("../components/HomeDashboard.tsx", import.meta.url), "utf8");
  const dialog = readFileSync(new URL("../components/HomeQuickActionDialog.tsx", import.meta.url), "utf8");
  assert.match(source, /markMeal/);
  assert.match(source, /toggleSleep/);
  assert.match(source, /recordDiaper/);
  assert.match(source, /recordMedication/);
  assert.match(source, /记录一次喂养/);
  assert.match(source, /记录测量/);
  assert.match(source, /登记已接种/);
  assert.match(source, /home-card-detail-link/);
  assert.match(source, /className="icon-only"/);
  assert.match(dialog, /MealEditor/);
  assert.match(dialog, /FeedingRecordForm/);
  assert.match(dialog, /DiaperRecordForm/);
  assert.match(dialog, /MedicationRecordForm/);
  assert.match(dialog, /GrowthRecordForm/);
  assert.match(dialog, /VaccinationRecordForm/);
  assert.match(dialog, /getBoundingClientRect/);
  assert.match(dialog, /outsideDialog/);
});
