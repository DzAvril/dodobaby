import "server-only";

import { and, asc, eq } from "drizzle-orm";
import { getDb } from "@/db";
import { growthRecords, type GrowthRecord } from "@/db/schema";
import type { GrowthRecordInput } from "@/lib/validation";

function recordValues(babyId: string, input: GrowthRecordInput, now: Date) {
  return {
    babyId,
    measuredDate: input.measuredDate,
    weightKg: input.weightKg ?? null,
    heightCm: input.heightCm ?? null,
    headCircumferenceCm: input.headCircumferenceCm ?? null,
    note: input.note || null,
    updatedAt: now,
  };
}

export async function listGrowthRecords(babyId: string): Promise<GrowthRecord[]> {
  return getDb()
    .select()
    .from(growthRecords)
    .where(eq(growthRecords.babyId, babyId))
    .orderBy(asc(growthRecords.measuredDate), asc(growthRecords.createdAt));
}

export async function getEarliestGrowthRecordDate(babyId: string) {
  const [record] = await getDb()
    .select({ measuredDate: growthRecords.measuredDate })
    .from(growthRecords)
    .where(eq(growthRecords.babyId, babyId))
    .orderBy(asc(growthRecords.measuredDate))
    .limit(1);
  return record?.measuredDate ?? null;
}

export async function getGrowthRecord(id: string, babyId: string): Promise<GrowthRecord | null> {
  const [record] = await getDb()
    .select()
    .from(growthRecords)
    .where(and(eq(growthRecords.id, id), eq(growthRecords.babyId, babyId)))
    .limit(1);
  return record ?? null;
}

export async function createGrowthRecord(babyId: string, input: GrowthRecordInput) {
  const id = crypto.randomUUID();
  const now = new Date();
  await getDb().insert(growthRecords).values({ id, ...recordValues(babyId, input, now), createdAt: now });
  return getGrowthRecord(id, babyId);
}

export async function updateGrowthRecord(id: string, babyId: string, input: GrowthRecordInput) {
  if (!(await getGrowthRecord(id, babyId))) return null;
  await getDb()
    .update(growthRecords)
    .set(recordValues(babyId, input, new Date()))
    .where(and(eq(growthRecords.id, id), eq(growthRecords.babyId, babyId)));
  return getGrowthRecord(id, babyId);
}

export async function deleteGrowthRecord(id: string, babyId: string) {
  const result = await getDb()
    .delete(growthRecords)
    .where(and(eq(growthRecords.id, id), eq(growthRecords.babyId, babyId)))
    .run();
  return result.changes > 0;
}
