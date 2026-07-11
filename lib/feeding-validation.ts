import { currentMinuteInTimezone, parseDate } from "@/lib/dates";

export { currentMinuteInTimezone };

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
