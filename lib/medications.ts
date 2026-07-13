import "server-only";

import { and, asc, desc, eq } from "drizzle-orm";
import { getDb } from "@/db";
import {
  medicationPlans,
  medicationRecords,
  type MedicationPlanRow,
  type MedicationRecord,
} from "@/db/schema";
import { isMedicationPlanDue } from "@/lib/medication-schedule";
import { validateMedicationOccurrence } from "@/lib/medication-validation";
import type { MedicationPlanInput, MedicationRecordInput } from "@/lib/validation";

export type MedicationPlan = Omit<MedicationPlanRow, "scheduledTimes"> & { scheduledTimes: string[] };

export class MedicationOccurrenceConflictError extends Error {}

function serializePlan(row: MedicationPlanRow): MedicationPlan {
  let scheduledTimes: string[] = [];
  try {
    const parsed: unknown = JSON.parse(row.scheduledTimes);
    if (Array.isArray(parsed)) scheduledTimes = parsed.filter((value): value is string => typeof value === "string").sort();
  } catch {
    scheduledTimes = [];
  }
  return { ...row, scheduledTimes };
}

function planValues(babyId: string, input: MedicationPlanInput, now: Date) {
  return {
    babyId,
    medicationName: input.medicationName,
    doseAmount: input.doseAmount,
    doseUnit: input.doseUnit,
    intervalDays: input.intervalDays,
    scheduledTimes: JSON.stringify(input.scheduledTimes),
    startDate: input.startDate,
    endDate: input.endDate,
    note: input.note,
    updatedAt: now,
  };
}

export async function listMedicationPlans(babyId: string): Promise<MedicationPlan[]> {
  const rows = await getDb()
    .select()
    .from(medicationPlans)
    .where(eq(medicationPlans.babyId, babyId))
    .orderBy(asc(medicationPlans.startDate), asc(medicationPlans.medicationName));
  return rows.map(serializePlan);
}

export async function getMedicationPlan(id: string, babyId: string): Promise<MedicationPlan | null> {
  const [row] = await getDb()
    .select()
    .from(medicationPlans)
    .where(and(eq(medicationPlans.id, id), eq(medicationPlans.babyId, babyId)))
    .limit(1);
  return row ? serializePlan(row) : null;
}

export async function createMedicationPlan(babyId: string, input: MedicationPlanInput) {
  const id = crypto.randomUUID();
  const now = new Date();
  await getDb().insert(medicationPlans).values({ id, ...planValues(babyId, input, now), createdAt: now });
  return getMedicationPlan(id, babyId);
}

export async function updateMedicationPlan(id: string, babyId: string, input: MedicationPlanInput) {
  if (!(await getMedicationPlan(id, babyId))) return null;
  await getDb()
    .update(medicationPlans)
    .set(planValues(babyId, input, new Date()))
    .where(and(eq(medicationPlans.id, id), eq(medicationPlans.babyId, babyId)));
  return getMedicationPlan(id, babyId);
}

export async function deleteMedicationPlan(id: string, babyId: string) {
  const result = await getDb()
    .delete(medicationPlans)
    .where(and(eq(medicationPlans.id, id), eq(medicationPlans.babyId, babyId)))
    .run();
  return result.changes > 0;
}

export async function listMedicationRecordsByDate(babyId: string, date: string): Promise<MedicationRecord[]> {
  return getDb()
    .select()
    .from(medicationRecords)
    .where(and(eq(medicationRecords.babyId, babyId), eq(medicationRecords.takenDate, date)))
    .orderBy(asc(medicationRecords.takenTime), asc(medicationRecords.createdAt));
}

export async function getMedicationRecord(id: string, babyId: string): Promise<MedicationRecord | null> {
  const [record] = await getDb()
    .select()
    .from(medicationRecords)
    .where(and(eq(medicationRecords.id, id), eq(medicationRecords.babyId, babyId)))
    .limit(1);
  return record ?? null;
}

export async function createMedicationRecord(babyId: string, input: MedicationRecordInput) {
  const plan = input.planId ? await getMedicationPlan(input.planId, babyId) : null;
  if (input.planId && !plan) throw new Error("用药计划不存在");
  if (plan && input.scheduledTime) validateMedicationOccurrence(plan, input.takenDate, input.scheduledTime);

  const medicationName = plan?.medicationName ?? input.medicationName;
  const doseAmount = plan?.doseAmount ?? input.doseAmount;
  const doseUnit = plan?.doseUnit ?? input.doseUnit;
  if (!medicationName || doseAmount == null || !doseUnit) throw new Error("请完整填写药品和用药量");

  const id = crypto.randomUUID();
  const now = new Date();
  try {
    await getDb().insert(medicationRecords).values({
      id,
      babyId,
      planId: plan?.id ?? null,
      medicationName,
      doseAmount,
      doseUnit,
      takenDate: input.takenDate,
      scheduledTime: plan ? input.scheduledTime : null,
      takenTime: input.takenTime,
      note: input.note,
      createdAt: now,
      updatedAt: now,
    });
  } catch (error) {
    if (error instanceof Error && "code" in error && error.code === "SQLITE_CONSTRAINT_UNIQUE") {
      throw new MedicationOccurrenceConflictError("这次计划用药已经登记过了");
    }
    throw error;
  }
  return getMedicationRecord(id, babyId);
}

export async function deleteMedicationRecord(id: string, babyId: string) {
  const result = await getDb()
    .delete(medicationRecords)
    .where(and(eq(medicationRecords.id, id), eq(medicationRecords.babyId, babyId)))
    .run();
  return result.changes > 0;
}

export async function getMedicationDay(babyId: string, date: string) {
  const [plans, records] = await Promise.all([
    listMedicationPlans(babyId),
    listMedicationRecordsByDate(babyId, date),
  ]);
  const duePlans = plans.filter((plan) => isMedicationPlanDue(plan, date));
  return { date, plans, duePlans, records };
}

export async function getEarliestMedicationDate(babyId: string) {
  const [plans, records] = await Promise.all([
    getDb().select({ date: medicationPlans.startDate }).from(medicationPlans).where(eq(medicationPlans.babyId, babyId)).orderBy(asc(medicationPlans.startDate)).limit(1),
    getDb().select({ date: medicationRecords.takenDate }).from(medicationRecords).where(eq(medicationRecords.babyId, babyId)).orderBy(asc(medicationRecords.takenDate)).limit(1),
  ]);
  return [plans[0]?.date, records[0]?.date].filter((date): date is string => Boolean(date)).sort()[0] ?? null;
}

export async function getLatestMedicationRecord(babyId: string) {
  const [record] = await getDb()
    .select()
    .from(medicationRecords)
    .where(eq(medicationRecords.babyId, babyId))
    .orderBy(desc(medicationRecords.takenDate), desc(medicationRecords.takenTime))
    .limit(1);
  return record ?? null;
}
