import { minuteInTimezone, parseDate, truncateToMinute, zonedDateTimeToDate } from "@/lib/dates";
import type { SleepRecordInput } from "@/lib/validation";

export const MAX_SLEEP_DURATION_MS = 24 * 60 * 60 * 1_000;

export function validateSleepDate(date: string, birthDate: string, timezone: string, now = new Date()) {
  parseDate(date);
  if (date < birthDate) throw new Error("睡眠日期不能早于出生日期");
  if (date > minuteInTimezone(now, timezone).date) throw new Error("睡眠日期不能晚于今天");
}

export function validateSleepEndInstant(startedAt: Date, endedAt: Date) {
  const duration = endedAt.getTime() - startedAt.getTime();
  if (duration <= 0) throw new Error("结束时间必须晚于开始时间");
}

export function validateSleepInterval(
  input: SleepRecordInput,
  birthDate: string,
  timezone: string,
  now = new Date(),
) {
  validateSleepDate(input.startedDate, birthDate, timezone, now);
  const currentMinute = truncateToMinute(now);
  const startedAt = zonedDateTimeToDate(input.startedDate, input.startedTime, timezone);
  if (startedAt > currentMinute) throw new Error("开始时间不能晚于当前时间");
  if (!input.endedDate && currentMinute.getTime() - startedAt.getTime() > MAX_SLEEP_DURATION_MS) {
    throw new Error("新的进行中睡眠不能从 24 小时前开始，请补录完整区间");
  }

  let endedAt: Date | null = null;
  if (input.endedDate && input.endedTime) {
    endedAt = zonedDateTimeToDate(input.endedDate, input.endedTime, timezone);
    if (endedAt > currentMinute) throw new Error("结束时间不能晚于当前时间");
    validateSleepEndInstant(startedAt, endedAt);
    if (endedAt.getTime() - startedAt.getTime() > MAX_SLEEP_DURATION_MS) {
      throw new Error("单次睡眠不能超过 24 小时，请检查开始和结束日期");
    }
  }

  return { startedAt, endedAt, recordTimezone: timezone };
}
