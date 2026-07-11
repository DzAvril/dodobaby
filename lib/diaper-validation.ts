import { currentMinuteInTimezone, parseDate, type ZonedMinute } from "@/lib/dates";

export function validateDiaperDate(
  diaperDate: string,
  birthDate: string,
  timezone: string,
  current = currentMinuteInTimezone(timezone),
) {
  parseDate(diaperDate);
  if (diaperDate < birthDate) throw new Error("尿布日期不能早于出生日期");
  if (diaperDate > current.date) throw new Error("尿布日期不能晚于今天");
}

export function validateDiaperDateTime(
  diaperDate: string,
  changedTime: string,
  birthDate: string,
  timezone: string,
  current: ZonedMinute = currentMinuteInTimezone(timezone),
) {
  validateDiaperDate(diaperDate, birthDate, timezone, current);
  if (!/^([01]\d|2[0-3]):[0-5]\d$/.test(changedTime)) throw new Error("更换时间无效");
  if (diaperDate === current.date && changedTime > current.time) throw new Error("更换时间不能晚于当前时间");
}
