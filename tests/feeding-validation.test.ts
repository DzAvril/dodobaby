import assert from "node:assert/strict";
import test from "node:test";
import { currentMinuteInTimezone, validateFeedingDateTime } from "../lib/feeding-validation";
import { feedingRecordSchema } from "../lib/validation";

const baseRecord = {
  feedingDate: "2026-07-11",
  startedTime: "08:30",
};

test("喂养记录至少包含一项有效时长或奶量", () => {
  assert.equal(feedingRecordSchema.safeParse({ ...baseRecord, leftDurationMinutes: 12 }).success, true);
  assert.equal(feedingRecordSchema.safeParse({ ...baseRecord, expressedMilkMl: 90 }).success, true);
  assert.equal(feedingRecordSchema.safeParse(baseRecord).success, false);
  assert.equal(feedingRecordSchema.safeParse({ ...baseRecord, formulaMl: 0 }).success, false);
});

test("亲喂时长必须是整数且左右合计不超过 240 分钟", () => {
  assert.equal(feedingRecordSchema.safeParse({ ...baseRecord, leftDurationMinutes: 120, rightDurationMinutes: 120 }).success, true);
  assert.equal(feedingRecordSchema.safeParse({ ...baseRecord, leftDurationMinutes: 121, rightDurationMinutes: 120 }).success, false);
  assert.equal(feedingRecordSchema.safeParse({ ...baseRecord, leftDurationMinutes: 1.5 }).success, false);
  assert.equal(feedingRecordSchema.safeParse({ ...baseRecord, rightDurationMinutes: 181 }).success, false);
});

test("瓶喂奶量和备注遵守边界并清理空白", () => {
  const parsed = feedingRecordSchema.safeParse({ ...baseRecord, expressedMilkMl: 1000, formulaMl: 0.5, note: "  夜间  " });
  assert.equal(parsed.success, true);
  if (parsed.success) assert.equal(parsed.data.note, "夜间");
  assert.equal(feedingRecordSchema.safeParse({ ...baseRecord, expressedMilkMl: 1000.1 }).success, false);
  assert.equal(feedingRecordSchema.safeParse({ ...baseRecord, formulaMl: 10, note: "字".repeat(301) }).success, false);
});

test("喂养日期和今天的开始时间不能超出宝宝时间线", () => {
  const current = { date: "2026-07-11", time: "15:45" };
  assert.doesNotThrow(() => validateFeedingDateTime("2026-07-11", "15:45", "2026-01-01", "Asia/Shanghai", current));
  assert.doesNotThrow(() => validateFeedingDateTime("2026-07-10", "23:59", "2026-01-01", "Asia/Shanghai", current));
  assert.throws(() => validateFeedingDateTime("2025-12-31", "08:00", "2026-01-01", "Asia/Shanghai", current), /不能早于出生日期/);
  assert.throws(() => validateFeedingDateTime("2026-07-12", "08:00", "2026-01-01", "Asia\/Shanghai", current), /不能晚于今天/);
  assert.throws(() => validateFeedingDateTime("2026-07-11", "15:46", "2026-01-01", "Asia/Shanghai", current), /不能晚于当前时间/);
  assert.throws(() => validateFeedingDateTime("2026-02-30", "08:00", "2026-01-01", "Asia/Shanghai", current), /日期无效/);
});

test("当前分钟按宝宝时区计算", () => {
  const now = new Date("2026-07-11T07:45:30.000Z");
  assert.deepEqual(currentMinuteInTimezone("Asia/Shanghai", now), { date: "2026-07-11", time: "15:45" });
  assert.deepEqual(currentMinuteInTimezone("America/Los_Angeles", now), { date: "2026-07-11", time: "00:45" });
});
