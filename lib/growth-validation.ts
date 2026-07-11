import { parseDate, todayInTimezone } from "@/lib/dates";

export function validateMeasurementDate(value: string, birthDate: string, timezone: string, today = todayInTimezone(timezone)) {
  parseDate(value);
  if (value < birthDate) throw new Error("测量日期不能早于出生日期");
  if (value > today) throw new Error("测量日期不能晚于今天");
}
