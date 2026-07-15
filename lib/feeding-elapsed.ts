import { zonedDateTimeToDate } from "@/lib/dates";

export type FeedingTimestamp = { feedingDate: string; startedTime: string };

export function minutesSinceFeeding(record: FeedingTimestamp, timezone: string, now = new Date()) {
  const startedAt = zonedDateTimeToDate(record.feedingDate, record.startedTime, timezone);
  return Math.max(0, Math.floor((now.getTime() - startedAt.getTime()) / 60_000));
}

export function elapsedFeedingText(minutes: number) {
  if (minutes < 1) return "刚刚";
  const days = Math.floor(minutes / 1_440);
  const hours = Math.floor((minutes % 1_440) / 60);
  const remainder = minutes % 60;
  if (days) return `${days}天${hours ? `${hours}小时` : ""}`;
  if (hours) return `${hours}小时${remainder ? `${remainder}分` : ""}`;
  return `${remainder}分钟`;
}
