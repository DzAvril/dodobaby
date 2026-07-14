import test from "node:test";
import assert from "node:assert/strict";
import { calculateAge, getMonthGrid, getWeekDates, monthBounds, parseDate, startOfWeek } from "../lib/dates";

test("生日当天月龄为 0 月 0 天", () => {
  assert.deepEqual(calculateAge("2026-02-18", "2026-02-18"), { months: 0, days: 0 });
});

test("跨月和月底生日使用自然月龄", () => {
  assert.deepEqual(calculateAge("2025-01-31", "2025-02-28"), { months: 1, days: 0 });
  assert.deepEqual(calculateAge("2025-01-31", "2025-03-03"), { months: 1, days: 3 });
});

test("闰日生日跨到非闰年", () => {
  assert.deepEqual(calculateAge("2024-02-29", "2025-02-28"), { months: 12, days: 0 });
});

test("出生日前的日期不显示月龄", () => {
  assert.equal(calculateAge("2026-03-01", "2026-02-28"), null);
});

test("月历固定为 42 天且从周一开始", () => {
  const grid = getMonthGrid("2026-07");
  assert.equal(grid.length, 42);
  assert.equal(grid[0], "2026-06-29");
  assert.equal(grid.at(-1), "2026-08-09");
});

test("周视图固定从周一开始并覆盖七天", () => {
  assert.equal(startOfWeek("2026-07-14"), "2026-07-13");
  assert.deepEqual(getWeekDates("2026-08-01"), [
    "2026-07-27",
    "2026-07-28",
    "2026-07-29",
    "2026-07-30",
    "2026-07-31",
    "2026-08-01",
    "2026-08-02",
  ]);
});

test("日期和月份输入会拒绝无效值", () => {
  assert.throws(() => parseDate("2026-02-30"));
  assert.throws(() => monthBounds("2026-13"));
});
