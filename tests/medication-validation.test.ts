import assert from "node:assert/strict";
import test from "node:test";
import { isMedicationPlanDue, medicationFrequencyText } from "../lib/medication-schedule";
import { normalizeQuickModules } from "../lib/navigation-preferences";
import { validateMedicationOccurrence, validateMedicationPlanDates, validateMedicationRecordDate } from "../lib/medication-validation";
import { medicationPlanSchema, medicationRecordSchema, quickModulesSchema } from "../lib/validation";

const d3 = { id: "d3", startDate: "2026-07-13", endDate: null, intervalDays: 2, scheduledTimes: ["08:00"] };
const ad = { id: "ad", startDate: "2026-07-14", endDate: null, intervalDays: 2, scheduledTimes: ["08:00"] };

test("错开一天的两个每两天计划会形成 D3 与 AD 交替安排", () => {
  assert.equal(isMedicationPlanDue(d3, "2026-07-13"), true);
  assert.equal(isMedicationPlanDue(ad, "2026-07-13"), false);
  assert.equal(isMedicationPlanDue(d3, "2026-07-14"), false);
  assert.equal(isMedicationPlanDue(ad, "2026-07-14"), true);
  assert.equal(isMedicationPlanDue(d3, "2026-07-15"), true);
  assert.equal(isMedicationPlanDue(ad, "2026-07-15"), false);
  assert.equal(medicationFrequencyText(2, ["08:00"]), "每 2 天 08:00");
});

test("计划支持一天多个时间且拒绝重复时间和无效日期范围", () => {
  const valid = medicationPlanSchema.safeParse({
    medicationName: "头孢克洛",
    doseAmount: 2.5,
    doseUnit: "ml",
    intervalDays: 1,
    scheduledTimes: ["20:00", "08:00"],
    startDate: "2026-07-13",
    endDate: "2026-07-20",
  });
  assert.equal(valid.success, true);
  if (valid.success) assert.deepEqual(valid.data.scheduledTimes, ["08:00", "20:00"]);
  assert.equal(medicationPlanSchema.safeParse({ ...valid.success && valid.data, scheduledTimes: ["08:00", "08:00"] }).success, false);
  assert.throws(() => validateMedicationPlanDates("2026-07-13", "2026-07-12", "2026-01-01"), /结束日期/);
  assert.throws(() => validateMedicationPlanDates("2025-12-31", null, "2026-01-01"), /出生日期/);
});

test("实际用药不能来自未来，计划记录必须匹配当天和计划时间", () => {
  assert.doesNotThrow(() => validateMedicationRecordDate("2026-07-13", "2026-01-01", "Asia/Shanghai", "2026-07-13"));
  assert.throws(() => validateMedicationRecordDate("2026-07-14", "2026-01-01", "Asia/Shanghai", "2026-07-13"), /晚于今天/);
  assert.doesNotThrow(() => validateMedicationOccurrence(d3, "2026-07-13", "08:00"));
  assert.throws(() => validateMedicationOccurrence(d3, "2026-07-14", "08:00"), /不在此用药计划/);
  assert.throws(() => validateMedicationOccurrence(d3, "2026-07-13", "20:00"), /时间不在/);
});

test("计划用药和手工补录分别遵守必填字段", () => {
  assert.equal(medicationRecordSchema.safeParse({
    planId: "c5e844fc-1f89-4e85-9430-a4de91a8b3e8",
    scheduledTime: "08:00",
    takenDate: "2026-07-13",
    takenTime: "08:05",
  }).success, true);
  assert.equal(medicationRecordSchema.safeParse({
    medicationName: "维生素 D3",
    doseAmount: 1,
    doseUnit: "滴",
    takenDate: "2026-07-13",
    takenTime: "08:05",
  }).success, true);
  assert.equal(medicationRecordSchema.safeParse({ takenDate: "2026-07-13", takenTime: "08:05" }).success, false);
});

test("高频模块固定为三个唯一位置并能修复旧配置", () => {
  assert.equal(quickModulesSchema.safeParse(["feeding", "medications", "diapers"]).success, true);
  assert.equal(quickModulesSchema.safeParse(["feeding", "feeding", "diapers"]).success, false);
  assert.deepEqual(normalizeQuickModules(["medications", "feeding", "medications", "unknown"]), ["medications", "feeding", "sleep"]);
});
