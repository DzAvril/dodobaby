import assert from "node:assert/strict";
import test from "node:test";
import { dayBoundsInTimezone, zonedDateTimeToDate } from "../lib/dates";
import {
  serializeSleepRecord,
  sleepDurationMinutes,
  sleepMinutesWithinDay,
  summarizeSleeps,
  type SleepRecordValue,
} from "../lib/sleep-summary";

const SHANGHAI = "Asia/Shanghai";

function instant(date: string, time: string) {
  return zonedDateTimeToDate(date, time, SHANGHAI);
}

function record(startedAt: Date, endedAt: Date | null, id = crypto.randomUUID()): SleepRecordValue {
  const createdAt = new Date("2026-07-01T00:00:00.000Z");
  return {
    id,
    babyId: "baby-1",
    startedAt,
    endedAt,
    recordTimezone: SHANGHAI,
    note: null,
    createdAt,
    updatedAt: createdAt,
  };
}

test("跨午夜睡眠会分别裁剪到宝宝时区的两个自然日", () => {
  const sleep = record(instant("2026-07-11", "23:30"), instant("2026-07-12", "01:15"));
  const firstDay = dayBoundsInTimezone("2026-07-11", SHANGHAI);
  const secondDay = dayBoundsInTimezone("2026-07-12", SHANGHAI);

  assert.equal(sleepMinutesWithinDay(sleep, firstDay.start, firstDay.end), 30);
  assert.equal(sleepMinutesWithinDay(sleep, secondDay.start, secondDay.end), 75);
  assert.deepEqual(summarizeSleeps([sleep], firstDay.start, firstDay.end), {
    sessionCount: 1,
    totalMinutes: 30,
    longestMinutes: 30,
    ongoingCount: 0,
  });
  assert.deepEqual(summarizeSleeps([sleep], secondDay.start, secondDay.end), {
    sessionCount: 1,
    totalMinutes: 75,
    longestMinutes: 75,
    ongoingCount: 0,
  });
});

test("当日汇总只计算与所选日期实际重叠的部分", () => {
  const bounds = dayBoundsInTimezone("2026-07-12", SHANGHAI);
  const previousToMorning = record(instant("2026-07-11", "22:00"), instant("2026-07-12", "02:00"), "cross-midnight");
  const afternoon = record(instant("2026-07-12", "14:00"), instant("2026-07-12", "14:45"), "afternoon");
  const outside = record(instant("2026-07-13", "00:00"), instant("2026-07-13", "01:00"), "outside");

  assert.deepEqual(summarizeSleeps([previousToMorning, afternoon, outside], bounds.start, bounds.end), {
    sessionCount: 2,
    totalMinutes: 165,
    longestMinutes: 120,
    ongoingCount: 0,
  });
});

test("不足一分钟的重叠会计为一次会话，但分钟数向下取整为零", () => {
  const bounds = dayBoundsInTimezone("2026-07-12", SHANGHAI);
  const shortSleep = record(
    new Date(instant("2026-07-12", "10:00").getTime() + 10_000),
    new Date(instant("2026-07-12", "10:01").getTime() - 1_000),
  );

  assert.equal(sleepDurationMinutes(shortSleep), 0);
  assert.equal(sleepMinutesWithinDay(shortSleep, bounds.start, bounds.end), 0);
  assert.deepEqual(summarizeSleeps([shortSleep], bounds.start, bounds.end), {
    sessionCount: 1,
    totalMinutes: 0,
    longestMinutes: 0,
    ongoingCount: 0,
  });
});

test("进行中睡眠按当前时刻裁剪并计入 ongoingCount", () => {
  const bounds = dayBoundsInTimezone("2026-07-12", SHANGHAI);
  const ongoing = record(instant("2026-07-12", "10:00"), null, "ongoing");
  const now = instant("2026-07-12", "10:42");

  assert.equal(sleepDurationMinutes(ongoing, now), 42);
  assert.deepEqual(summarizeSleeps([ongoing], bounds.start, bounds.end, now), {
    sessionCount: 1,
    totalMinutes: 42,
    longestMinutes: 42,
    ongoingCount: 1,
  });
});

test("恰好在日界结束或开始的记录不会污染相邻日期", () => {
  const bounds = dayBoundsInTimezone("2026-07-12", SHANGHAI);
  const endsAtStart = record(instant("2026-07-11", "23:00"), bounds.start, "ends-at-start");
  const startsAtEnd = record(bounds.end, instant("2026-07-13", "01:00"), "starts-at-end");

  assert.deepEqual(summarizeSleeps([endsAtStart, startsAtEnd], bounds.start, bounds.end), {
    sessionCount: 0,
    totalMinutes: 0,
    longestMinutes: 0,
    ongoingCount: 0,
  });
});

test("序列化记录保留录入时区的本地日期时间和当日分钟数", () => {
  const bounds = dayBoundsInTimezone("2026-07-12", SHANGHAI);
  const sleep = record(instant("2026-07-11", "23:30"), instant("2026-07-12", "01:15"), "sleep-1");
  const serialized = serializeSleepRecord(sleep, bounds.start, bounds.end);

  assert.equal(serialized.startedDate, "2026-07-11");
  assert.equal(serialized.startedTime, "23:30");
  assert.equal(serialized.endedDate, "2026-07-12");
  assert.equal(serialized.endedTime, "01:15");
  assert.equal(serialized.durationMinutes, 105);
  assert.equal(serialized.dayMinutes, 75);
});
