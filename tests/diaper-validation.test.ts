import assert from "node:assert/strict";
import test from "node:test";
import { validateDiaperDateTime } from "../lib/diaper-validation";
import { diaperRecordSchema } from "../lib/validation";

const baseRecord = { diaperDate: "2026-07-11", changedTime: "08:30", diaperType: "both" as const };

test("尿布类型和可选观察字段遵守固定边界", () => {
  assert.equal(diaperRecordSchema.safeParse(baseRecord).success, true);
  assert.equal(diaperRecordSchema.safeParse({ ...baseRecord, diaperType: "unknown" }).success, false);
  assert.equal(diaperRecordSchema.safeParse({ ...baseRecord, urineAmount: "huge" }).success, false);
  assert.equal(diaperRecordSchema.safeParse({ ...baseRecord, stoolColor: "purple" }).success, false);
  assert.equal(diaperRecordSchema.safeParse({ ...baseRecord, note: "字".repeat(301) }).success, false);
});

test("类型切换会在服务端清除不适用的隐藏观察", () => {
  const wet = diaperRecordSchema.parse({
    ...baseRecord,
    diaperType: "wet",
    urineAmount: "large",
    stoolAmount: "small",
    stoolColor: "yellow",
    stoolConsistency: "soft",
    note: "  夜间更换  ",
  });
  assert.equal(wet.urineAmount, "large");
  assert.equal(wet.stoolAmount, null);
  assert.equal(wet.stoolColor, null);
  assert.equal(wet.stoolConsistency, null);
  assert.equal(wet.skinObservation, null);
  assert.equal(wet.note, "夜间更换");

  const dirty = diaperRecordSchema.parse({ ...baseRecord, diaperType: "dirty", urineAmount: "medium", stoolAmount: "large" });
  assert.equal(dirty.urineAmount, null);
  assert.equal(dirty.stoolAmount, "large");
});

test("尿布日期和当前分钟不能超出宝宝时间线", () => {
  const current = { date: "2026-07-11", time: "15:45" };
  assert.doesNotThrow(() => validateDiaperDateTime("2026-07-11", "15:45", "2026-01-01", "Asia/Shanghai", current));
  assert.doesNotThrow(() => validateDiaperDateTime("2026-07-10", "23:59", "2026-01-01", "Asia/Shanghai", current));
  assert.throws(() => validateDiaperDateTime("2025-12-31", "08:00", "2026-01-01", "Asia/Shanghai", current), /不能早于出生日期/);
  assert.throws(() => validateDiaperDateTime("2026-07-12", "08:00", "2026-01-01", "Asia/Shanghai", current), /不能晚于今天/);
  assert.throws(() => validateDiaperDateTime("2026-07-11", "15:46", "2026-01-01", "Asia/Shanghai", current), /不能晚于当前时间/);
  assert.throws(() => validateDiaperDateTime("2026-02-30", "08:00", "2026-01-01", "Asia/Shanghai", current), /日期无效/);
});
