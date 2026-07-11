import { minuteInTimezone } from "@/lib/dates";

export type SleepRecordValue = {
  id: string;
  babyId: string;
  startedAt: Date;
  endedAt: Date | null;
  recordTimezone: string;
  note: string | null;
  createdAt: Date;
  updatedAt: Date;
};

export function sleepDurationMinutes(record: Pick<SleepRecordValue, "startedAt" | "endedAt">, now = new Date()) {
  const end = record.endedAt ?? now;
  return Math.max(0, Math.floor((end.getTime() - record.startedAt.getTime()) / 60_000));
}

export function sleepMinutesWithinDay(
  record: Pick<SleepRecordValue, "startedAt" | "endedAt">,
  dayStart: Date,
  dayEnd: Date,
  now = new Date(),
) {
  return Math.floor(sleepMillisecondsWithinDay(record, dayStart, dayEnd, now) / 60_000);
}

function sleepMillisecondsWithinDay(
  record: Pick<SleepRecordValue, "startedAt" | "endedAt">,
  dayStart: Date,
  dayEnd: Date,
  now = new Date(),
) {
  const start = Math.max(record.startedAt.getTime(), dayStart.getTime());
  const end = Math.min(record.endedAt?.getTime() ?? now.getTime(), dayEnd.getTime());
  return Math.max(0, end - start);
}

export function summarizeSleeps(
  records: Array<Pick<SleepRecordValue, "startedAt" | "endedAt">>,
  dayStart: Date,
  dayEnd: Date,
  now = new Date(),
) {
  const contributions = records.map((record) => sleepMinutesWithinDay(record, dayStart, dayEnd, now));
  return {
    sessionCount: records.filter((record) => sleepMillisecondsWithinDay(record, dayStart, dayEnd, now) > 0).length,
    totalMinutes: contributions.reduce((total, minutes) => total + minutes, 0),
    longestMinutes: contributions.reduce((longest, minutes) => Math.max(longest, minutes), 0),
    ongoingCount: records.filter((record) => record.endedAt == null && sleepMillisecondsWithinDay(record, dayStart, dayEnd, now) > 0).length,
  };
}

export function serializeSleepRecord(
  record: SleepRecordValue,
  dayStart?: Date,
  dayEnd?: Date,
  now = new Date(),
) {
  const started = minuteInTimezone(record.startedAt, record.recordTimezone);
  const ended = record.endedAt ? minuteInTimezone(record.endedAt, record.recordTimezone) : null;
  return {
    id: record.id,
    babyId: record.babyId,
    startedAt: record.startedAt.toISOString(),
    endedAt: record.endedAt?.toISOString() ?? null,
    startedDate: started.date,
    startedTime: started.time,
    endedDate: ended?.date ?? null,
    endedTime: ended?.time ?? null,
    recordTimezone: record.recordTimezone,
    note: record.note,
    createdAt: record.createdAt.toISOString(),
    updatedAt: record.updatedAt.toISOString(),
    durationMinutes: sleepDurationMinutes(record, now),
    dayMinutes: dayStart && dayEnd ? sleepMinutesWithinDay(record, dayStart, dayEnd, now) : null,
  };
}
