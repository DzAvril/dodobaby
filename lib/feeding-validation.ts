import { parseDate } from "@/lib/dates";

export type ZonedMinute = { date: string; time: string };

export function currentMinuteInTimezone(timezone: string, now = new Date()): ZonedMinute {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: timezone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(now);
  const values = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return {
    date: `${values.year}-${values.month}-${values.day}`,
    time: `${values.hour}:${values.minute}`,
  };
}

export function validateFeedingDate(
  feedingDate: string,
  birthDate: string,
  timezone: string,
  current = currentMinuteInTimezone(timezone),
) {
  parseDate(feedingDate);
  if (feedingDate < birthDate) throw new Error("喂养日期不能早于出生日期");
  if (feedingDate > current.date) throw new Error("喂养日期不能晚于今天");
}

export function validateFeedingDateTime(
  feedingDate: string,
  startedTime: string,
  birthDate: string,
  timezone: string,
  current = currentMinuteInTimezone(timezone),
) {
  validateFeedingDate(feedingDate, birthDate, timezone, current);
  if (!/^([01]\d|2[0-3]):[0-5]\d$/.test(startedTime)) throw new Error("开始时间无效");
  if (feedingDate === current.date && startedTime > current.time) throw new Error("开始时间不能晚于当前时间");
}
