import "server-only";

import { and, asc, desc, eq, gt, isNotNull, isNull, lt, ne, or } from "drizzle-orm";
import { getDb } from "@/db";
import { sleepRecords, type SleepRecord } from "@/db/schema";
import { minuteInTimezone } from "@/lib/dates";
import { validateSleepEndInstant } from "@/lib/sleep-validation";

const MAX_INSTANT = new Date("9999-12-31T23:59:59.999Z");

export class SleepOverlapError extends Error {
  constructor(public conflictingId?: string) {
    super("这段时间与已有睡眠记录重叠");
    this.name = "SleepOverlapError";
  }
}

export class ActiveSleepConflictError extends Error {
  constructor() {
    super("宝宝已有进行中的睡眠");
    this.name = "ActiveSleepConflictError";
  }
}

export class SleepStateConflictError extends Error {
  constructor() {
    super("睡眠状态已变化，请刷新后重试");
    this.name = "SleepStateConflictError";
  }
}

function isActiveSleepConstraint(error: unknown) {
  return error instanceof Error
    && "code" in error
    && error.code === "SQLITE_CONSTRAINT_UNIQUE"
    && error.message.includes("sleep_records.baby_id");
}

function overlapWhere(babyId: string, startedAt: Date, endedAt: Date | null, excludeId?: string) {
  return and(
    eq(sleepRecords.babyId, babyId),
    lt(sleepRecords.startedAt, endedAt ?? MAX_INSTANT),
    or(isNull(sleepRecords.endedAt), gt(sleepRecords.endedAt, startedAt)),
    excludeId ? ne(sleepRecords.id, excludeId) : undefined,
  );
}

export function listSleepRecordsForDay(babyId: string, dayStart: Date, dayEnd: Date): SleepRecord[] {
  return getDb()
    .select()
    .from(sleepRecords)
    .where(and(
      eq(sleepRecords.babyId, babyId),
      lt(sleepRecords.startedAt, dayEnd),
      or(isNull(sleepRecords.endedAt), gt(sleepRecords.endedAt, dayStart)),
    ))
    .orderBy(desc(sleepRecords.startedAt), desc(sleepRecords.createdAt))
    .all();
}

export function getActiveSleepRecord(babyId: string): SleepRecord | null {
  return getDb()
    .select()
    .from(sleepRecords)
    .where(and(eq(sleepRecords.babyId, babyId), isNull(sleepRecords.endedAt)))
    .limit(1)
    .get() ?? null;
}

export function getLatestSleepRecord(babyId: string): SleepRecord | null {
  return getDb()
    .select()
    .from(sleepRecords)
    .where(eq(sleepRecords.babyId, babyId))
    .orderBy(desc(sleepRecords.startedAt), desc(sleepRecords.createdAt))
    .limit(1)
    .get() ?? null;
}

export function getEarliestSleepRecordDate(babyId: string) {
  const record = getDb()
    .select({ startedAt: sleepRecords.startedAt, recordTimezone: sleepRecords.recordTimezone })
    .from(sleepRecords)
    .where(eq(sleepRecords.babyId, babyId))
    .orderBy(asc(sleepRecords.startedAt))
    .limit(1)
    .get();
  return record ? minuteInTimezone(record.startedAt, record.recordTimezone).date : null;
}

export function getSleepRecord(id: string, babyId: string): SleepRecord | null {
  return getDb()
    .select()
    .from(sleepRecords)
    .where(and(eq(sleepRecords.id, id), eq(sleepRecords.babyId, babyId)))
    .limit(1)
    .get() ?? null;
}

export function createSleepRecord(babyId: string, input: {
  startedAt: Date;
  endedAt: Date | null;
  recordTimezone: string;
  note: string | null;
}) {
  try {
    return getDb().transaction((tx) => {
      const overlap = tx
        .select({ id: sleepRecords.id })
        .from(sleepRecords)
        .where(overlapWhere(babyId, input.startedAt, input.endedAt))
        .limit(1)
        .get();
      if (overlap) throw new SleepOverlapError(overlap.id);

      const id = crypto.randomUUID();
      const now = new Date();
      tx.insert(sleepRecords).values({ id, babyId, ...input, createdAt: now, updatedAt: now }).run();
      return tx.select().from(sleepRecords).where(eq(sleepRecords.id, id)).get()!;
    });
  } catch (error) {
    if (isActiveSleepConstraint(error)) throw new ActiveSleepConflictError();
    throw error;
  }
}

export function updateSleepRecord(id: string, babyId: string, input: {
  startedAt: Date;
  endedAt: Date | null;
  recordTimezone: string;
  note: string | null;
}) {
  try {
    return getDb().transaction((tx) => {
      const existing = tx
        .select({ id: sleepRecords.id, endedAt: sleepRecords.endedAt })
        .from(sleepRecords)
        .where(and(eq(sleepRecords.id, id), eq(sleepRecords.babyId, babyId)))
        .limit(1)
        .get();
      if (!existing) return null;
      if (Boolean(existing.endedAt) !== Boolean(input.endedAt)) throw new SleepStateConflictError();

      const overlap = tx
        .select({ id: sleepRecords.id })
        .from(sleepRecords)
        .where(overlapWhere(babyId, input.startedAt, input.endedAt, id))
        .limit(1)
        .get();
      if (overlap) throw new SleepOverlapError(overlap.id);

      const updated = tx.update(sleepRecords)
        .set({ ...input, updatedAt: new Date() })
        .where(and(
          eq(sleepRecords.id, id),
          eq(sleepRecords.babyId, babyId),
          input.endedAt ? isNotNull(sleepRecords.endedAt) : isNull(sleepRecords.endedAt),
        ))
        .run();
      if (updated.changes === 0) throw new SleepStateConflictError();
      return tx.select().from(sleepRecords).where(eq(sleepRecords.id, id)).get()!;
    });
  } catch (error) {
    if (isActiveSleepConstraint(error)) throw new ActiveSleepConflictError();
    throw error;
  }
}

export function endSleepRecord(id: string, babyId: string, endedAt: Date) {
  return getDb().transaction((tx) => {
    const existing = tx
      .select()
      .from(sleepRecords)
      .where(and(eq(sleepRecords.id, id), eq(sleepRecords.babyId, babyId)))
      .limit(1)
      .get();
    if (!existing) return { status: "missing" as const, record: null };
    if (existing.endedAt) return { status: "already-ended" as const, record: null };

    validateSleepEndInstant(existing.startedAt, endedAt);
    const result = tx
      .update(sleepRecords)
      .set({ endedAt, updatedAt: new Date() })
      .where(and(
        eq(sleepRecords.id, id),
        eq(sleepRecords.babyId, babyId),
        eq(sleepRecords.startedAt, existing.startedAt),
        isNull(sleepRecords.endedAt),
      ))
      .run();
    if (result.changes === 0) throw new SleepStateConflictError();
    return {
      status: "ended" as const,
      record: tx.select().from(sleepRecords).where(eq(sleepRecords.id, id)).get()!,
    };
  });
}

export function deleteSleepRecord(id: string, babyId: string) {
  return getDb()
    .delete(sleepRecords)
    .where(and(eq(sleepRecords.id, id), eq(sleepRecords.babyId, babyId)))
    .run().changes > 0;
}
