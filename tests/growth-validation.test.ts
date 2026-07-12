import assert from "node:assert/strict";
import test from "node:test";
import { validateMeasurementDate } from "../lib/growth-validation";
import { growthRecordSchema } from "../lib/validation";

test("测量日期必须在出生日期和今天之间", () => {
  assert.doesNotThrow(() => validateMeasurementDate("2026-01-01", "2026-01-01", "Asia/Shanghai", "2026-07-11"));
  assert.doesNotThrow(() => validateMeasurementDate("2026-07-01", "2026-01-01", "Asia/Shanghai", "2026-07-11"));
  assert.doesNotThrow(() => validateMeasurementDate("2026-07-11", "2026-01-01", "Asia/Shanghai", "2026-07-11"));
  assert.throws(() => validateMeasurementDate("2025-12-31", "2026-01-01", "Asia/Shanghai", "2026-07-11"), /不能早于出生日期/);
  assert.throws(() => validateMeasurementDate("2026-07-12", "2026-01-01", "Asia/Shanghai", "2026-07-11"), /不能晚于今天/);
  assert.throws(() => validateMeasurementDate("2026-02-30", "2026-01-01", "Asia/Shanghai", "2026-07-11"), /日期无效/);
});

test("体重、身高和头围的上下边界都包含端点", () => {
  for (const record of [
    { measuredDate: "2026-07-11", weightKg: 0.5 },
    { measuredDate: "2026-07-11", weightKg: 50 },
    { measuredDate: "2026-07-11", heightCm: 20 },
    { measuredDate: "2026-07-11", heightCm: 150 },
    { measuredDate: "2026-07-11", headCircumferenceCm: 15 },
    { measuredDate: "2026-07-11", headCircumferenceCm: 80 },
  ]) {
    assert.equal(growthRecordSchema.safeParse(record).success, true, JSON.stringify(record));
  }

  for (const record of [
    { measuredDate: "2026-07-11", weightKg: 0.49 },
    { measuredDate: "2026-07-11", weightKg: 50.01 },
    { measuredDate: "2026-07-11", heightCm: 19.99 },
    { measuredDate: "2026-07-11", heightCm: 150.01 },
    { measuredDate: "2026-07-11", headCircumferenceCm: 14.99 },
    { measuredDate: "2026-07-11", headCircumferenceCm: 80.01 },
  ]) {
    assert.equal(growthRecordSchema.safeParse(record).success, false, JSON.stringify(record));
  }
});

test("非有限数值和没有任何指标的记录会被拒绝", () => {
  for (const invalid of [Number.NaN, Number.POSITIVE_INFINITY, Number.NEGATIVE_INFINITY]) {
    assert.equal(growthRecordSchema.safeParse({ measuredDate: "2026-07-11", weightKg: invalid }).success, false);
    assert.equal(growthRecordSchema.safeParse({ measuredDate: "2026-07-11", heightCm: invalid }).success, false);
    assert.equal(growthRecordSchema.safeParse({ measuredDate: "2026-07-11", headCircumferenceCm: invalid }).success, false);
  }
  assert.equal(growthRecordSchema.safeParse({ measuredDate: "2026-07-11" }).success, false);
  assert.equal(growthRecordSchema.safeParse({
    measuredDate: "2026-07-11",
    weightKg: null,
    heightCm: null,
    headCircumferenceCm: null,
  }).success, false);
});

test("备注会清理首尾空白并遵守 300 字边界", () => {
  const accepted = growthRecordSchema.safeParse({ measuredDate: "2026-07-11", weightKg: 7.2, note: `  ${"字".repeat(300)}  ` });
  assert.equal(accepted.success, true);
  if (accepted.success) assert.equal(accepted.data.note, "字".repeat(300));
  assert.equal(growthRecordSchema.safeParse({ measuredDate: "2026-07-11", weightKg: 7.2, note: "字".repeat(301) }).success, false);
});
