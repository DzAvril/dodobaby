import "server-only";

import { and, asc, desc, eq } from "drizzle-orm";
import { getDb } from "@/db";
import { diaperRecords, type DiaperRecord } from "@/db/schema";
import type { DiaperRecordInput } from "@/lib/validation";

function recordValues(babyId: string, input: DiaperRecordInput, now: Date) {
  return {
    babyId,
    diaperDate: input.diaperDate,
    changedTime: input.changedTime,
    diaperType: input.diaperType,
    urineAmount: input.urineAmount,
    stoolAmount: input.stoolAmount,
    stoolColor: input.stoolColor,
    stoolConsistency: input.stoolConsistency,
    skinObservation: input.skinObservation,
    note: input.note,
    updatedAt: now,
  };
}

export async function listDiaperRecordsByDate(babyId: string, diaperDate: string): Promise<DiaperRecord[]> {
  return getDb()
    .select()
    .from(diaperRecords)
    .where(and(eq(diaperRecords.babyId, babyId), eq(diaperRecords.diaperDate, diaperDate)))
    .orderBy(desc(diaperRecords.changedTime), desc(diaperRecords.createdAt));
}

export async function getLatestDiaperRecord(babyId: string): Promise<DiaperRecord | null> {
  const [record] = await getDb()
    .select()
    .from(diaperRecords)
    .where(eq(diaperRecords.babyId, babyId))
    .orderBy(desc(diaperRecords.diaperDate), desc(diaperRecords.changedTime), desc(diaperRecords.createdAt))
    .limit(1);
  return record ?? null;
}

export async function getEarliestDiaperRecordDate(babyId: string) {
  const [record] = await getDb()
    .select({ diaperDate: diaperRecords.diaperDate })
    .from(diaperRecords)
    .where(eq(diaperRecords.babyId, babyId))
    .orderBy(asc(diaperRecords.diaperDate))
    .limit(1);
  return record?.diaperDate ?? null;
}

export async function getDiaperRecord(id: string, babyId: string): Promise<DiaperRecord | null> {
  const [record] = await getDb()
    .select()
    .from(diaperRecords)
    .where(and(eq(diaperRecords.id, id), eq(diaperRecords.babyId, babyId)))
    .limit(1);
  return record ?? null;
}

export async function createDiaperRecord(babyId: string, input: DiaperRecordInput) {
  const id = crypto.randomUUID();
  const now = new Date();
  await getDb().insert(diaperRecords).values({ id, ...recordValues(babyId, input, now), createdAt: now });
  return getDiaperRecord(id, babyId);
}

export async function updateDiaperRecord(id: string, babyId: string, input: DiaperRecordInput) {
  if (!(await getDiaperRecord(id, babyId))) return null;
  await getDb()
    .update(diaperRecords)
    .set(recordValues(babyId, input, new Date()))
    .where(and(eq(diaperRecords.id, id), eq(diaperRecords.babyId, babyId)));
  return getDiaperRecord(id, babyId);
}

export async function deleteDiaperRecord(id: string, babyId: string) {
  const result = await getDb()
    .delete(diaperRecords)
    .where(and(eq(diaperRecords.id, id), eq(diaperRecords.babyId, babyId)))
    .run();
  return result.changes > 0;
}
