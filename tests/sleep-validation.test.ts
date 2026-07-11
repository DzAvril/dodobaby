import assert from "node:assert/strict";
import test from "node:test";
import { zonedDateTimeToDate } from "../lib/dates";
import { MAX_SLEEP_DURATION_MS, validateSleepEndInstant, validateSleepInterval } from "../lib/sleep-validation";
import { sleepRecordSchema, type SleepRecordInput } from "../lib/validation";

const SHANGHAI = "Asia/Shanghai";
const BIRTH_DATE = "2026-01-04";
const NOW = new Date("2026-07-12T04:00:00.000Z"); // 2026-07-12 12:00 in Shanghai

function input(value: unknown): SleepRecordInput {
  return sleepRecordSchema.parse(value);
}

test("宝宝时区下的跨午夜睡眠会转换为正确 UTC 区间", () => {
  const interval = validateSleepInterval(input({
    startedDate: "2026-07-11",
    startedTime: "23:30",
    endedDate: "2026-07-12",
    endedTime: "01:15",
    note: " 夜间睡眠 ",
  }), BIRTH_DATE, SHANGHAI, NOW);

  assert.equal(interval.startedAt.toISOString(), "2026-07-11T15:30:00.000Z");
  assert.equal(interval.endedAt?.toISOString(), "2026-07-11T17:15:00.000Z");
  assert.equal(interval.endedAt!.getTime() - interval.startedAt.getTime(), 105 * 60_000);
  assert.equal(interval.recordTimezone, SHANGHAI);
});

test("进行中睡眠允许结束日期和时间同时为空", () => {
  const parsed = input({ startedDate: "2026-07-12", startedTime: "10:00", endedDate: "", endedTime: "" });
  const interval = validateSleepInterval(parsed, BIRTH_DATE, SHANGHAI, NOW);
  assert.equal(interval.endedAt, null);
});

test("结束日期和结束时间必须成对填写", () => {
  assert.equal(sleepRecordSchema.safeParse({
    startedDate: "2026-07-12",
    startedTime: "10:00",
    endedDate: "2026-07-12",
  }).success, false);
  assert.equal(sleepRecordSchema.safeParse({
    startedDate: "2026-07-12",
    startedTime: "10:00",
    endedTime: "11:00",
  }).success, false);
});

test("睡眠不能早于出生日期，也不能从未来开始或在未来结束", () => {
  assert.throws(() => validateSleepInterval(input({
    startedDate: "2026-01-03",
    startedTime: "23:00",
  }), BIRTH_DATE, SHANGHAI, NOW), /不能早于出生日期/);

  assert.throws(() => validateSleepInterval(input({
    startedDate: "2026-07-12",
    startedTime: "12:01",
  }), BIRTH_DATE, SHANGHAI, NOW), /开始时间不能晚于当前时间/);

  assert.throws(() => validateSleepInterval(input({
    startedDate: "2026-07-12",
    startedTime: "10:00",
    endedDate: "2026-07-12",
    endedTime: "12:01",
  }), BIRTH_DATE, SHANGHAI, NOW), /结束时间不能晚于当前时间/);

  assert.throws(() => validateSleepInterval(input({
    startedDate: "2026-07-13",
    startedTime: "00:00",
  }), BIRTH_DATE, SHANGHAI, NOW), /睡眠日期不能晚于今天/);
});

test("零时长和反向区间都会被拒绝", () => {
  const startedAt = new Date("2026-07-11T12:00:00.000Z");
  assert.throws(() => validateSleepEndInstant(startedAt, new Date(startedAt)), /结束时间必须晚于开始时间/);
  assert.throws(() => validateSleepEndInstant(startedAt, new Date(startedAt.getTime() - 60_000)), /结束时间必须晚于开始时间/);
});

test("手工区间限制 24 小时，但自动结束允许清理超时的进行中记录", () => {
  const startedAt = new Date("2026-07-10T00:00:00.000Z");
  assert.doesNotThrow(() => validateSleepEndInstant(startedAt, new Date(startedAt.getTime() + MAX_SLEEP_DURATION_MS)));
  assert.doesNotThrow(() => validateSleepEndInstant(startedAt, new Date(startedAt.getTime() + MAX_SLEEP_DURATION_MS + 60_000)));
  assert.doesNotThrow(() => validateSleepInterval(input({
    startedDate: "2026-07-10",
    startedTime: "12:00",
    endedDate: "2026-07-11",
    endedTime: "12:00",
  }), BIRTH_DATE, SHANGHAI, NOW));
  assert.throws(
    () => validateSleepInterval(input({
      startedDate: "2026-07-10",
      startedTime: "12:00",
      endedDate: "2026-07-11",
      endedTime: "12:01",
    }), BIRTH_DATE, SHANGHAI, NOW),
    /不能超过 24 小时/,
  );
  assert.throws(() => validateSleepInterval(input({
    startedDate: "2026-07-11",
    startedTime: "11:59",
    endedDate: null,
    endedTime: null,
  }), BIRTH_DATE, SHANGHAI, NOW), /新的进行中睡眠不能从 24 小时前开始/);
});

test("DST 跳时中不存在的宝宝本地时间会被拒绝", () => {
  assert.throws(
    () => zonedDateTimeToDate("2026-03-08", "02:30", "America/New_York"),
    /不存在/,
  );
});

test("DST 回拨中有歧义的宝宝本地时间会被拒绝", () => {
  assert.throws(
    () => zonedDateTimeToDate("2026-11-01", "01:30", "America/New_York"),
    /歧义/,
  );
});
