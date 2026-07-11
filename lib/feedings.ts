import "server-only";

import { and, asc, desc, eq } from "drizzle-orm";
import { getDb } from "@/db";
import { feedingRecords, type FeedingRecord } from "@/db/schema";
import type { FeedingRecordInput } from "@/lib/validation";

function recordValues(babyId: string, input: FeedingRecordInput, now: Date) {
  return {
    babyId,
    feedingDate: input.feedingDate,
    startedTime: input.startedTime,
    leftDurationMinutes: input.leftDurationMinutes ?? null,
    rightDurationMinutes: input.rightDurationMinutes ?? null,
    expressedMilkMl: input.expressedMilkMl ?? null,
    formulaMl: input.formulaMl ?? null,
    note: input.note || null,
    updatedAt: now,
  };
}

export async function listFeedingRecordsByDate(babyId: string, feedingDate: string): Promise<FeedingRecord[]> {
  return getDb()
    .select()
    .from(feedingRecords)
    .where(and(eq(feedingRecords.babyId, babyId), eq(feedingRecords.feedingDate, feedingDate)))
    .orderBy(desc(feedingRecords.startedTime), desc(feedingRecords.createdAt));
}

export async function getLatestFeedingRecord(babyId: string): Promise<FeedingRecord | null> {
  const [record] = await getDb()
    .select()
    .from(feedingRecords)
    .where(eq(feedingRecords.babyId, babyId))
    .orderBy(desc(feedingRecords.feedingDate), desc(feedingRecords.startedTime), desc(feedingRecords.createdAt))
    .limit(1);
  return record ?? null;
}

export async function getEarliestFeedingRecordDate(babyId: string) {
  const [record] = await getDb()
    .select({ feedingDate: feedingRecords.feedingDate })
    .from(feedingRecords)
    .where(eq(feedingRecords.babyId, babyId))
    .orderBy(asc(feedingRecords.feedingDate))
    .limit(1);
  return record?.feedingDate ?? null;
}

export async function getFeedingRecord(id: string, babyId: string): Promise<FeedingRecord | null> {
  const [record] = await getDb()
    .select()
    .from(feedingRecords)
    .where(and(eq(feedingRecords.id, id), eq(feedingRecords.babyId, babyId)))
    .limit(1);
  return record ?? null;
}

export async function createFeedingRecord(babyId: string, input: FeedingRecordInput) {
  const id = crypto.randomUUID();
  const now = new Date();
  await getDb().insert(feedingRecords).values({ id, ...recordValues(babyId, input, now), createdAt: now });
  return getFeedingRecord(id, babyId);
}

export async function updateFeedingRecord(id: string, babyId: string, input: FeedingRecordInput) {
  if (!(await getFeedingRecord(id, babyId))) return null;
  await getDb()
    .update(feedingRecords)
    .set(recordValues(babyId, input, new Date()))
    .where(and(eq(feedingRecords.id, id), eq(feedingRecords.babyId, babyId)));
  return getFeedingRecord(id, babyId);
}

export async function deleteFeedingRecord(id: string, babyId: string) {
  const result = await getDb()
    .delete(feedingRecords)
    .where(and(eq(feedingRecords.id, id), eq(feedingRecords.babyId, babyId)))
    .run();
  return result.changes > 0;
}
