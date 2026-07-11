import "server-only";

import { and, eq } from "drizzle-orm";
import { getDb } from "@/db";
import { vaccinationRecords, type VaccinationRecord } from "@/db/schema";
import { sortVaccinationRecords } from "@/lib/vaccination-validation";
import type { VaccinationRecordInput } from "@/lib/validation";

function recordValues(babyId: string, input: VaccinationRecordInput, now: Date) {
  return {
    babyId,
    vaccineName: input.vaccineName,
    doseNumber: input.doseNumber,
    category: input.category,
    status: input.status,
    plannedDate: input.plannedDate,
    plannedTime: input.plannedTime,
    administeredDate: input.administeredDate,
    manufacturer: input.manufacturer,
    batchNumber: input.batchNumber,
    administrationSite: input.administrationSite,
    vaccinationUnit: input.vaccinationUnit,
    note: input.note,
    updatedAt: now,
  };
}

export async function listVaccinationRecords(babyId: string): Promise<VaccinationRecord[]> {
  const records = await getDb().select().from(vaccinationRecords).where(eq(vaccinationRecords.babyId, babyId));
  return sortVaccinationRecords(records);
}

export async function getEarliestVaccinationRecordDate(babyId: string) {
  const records = await getDb()
    .select({ plannedDate: vaccinationRecords.plannedDate, administeredDate: vaccinationRecords.administeredDate })
    .from(vaccinationRecords)
    .where(eq(vaccinationRecords.babyId, babyId));
  const dates = records.flatMap((record) => [record.plannedDate, record.administeredDate]).filter((date): date is string => Boolean(date));
  return dates.sort()[0] ?? null;
}

export async function getVaccinationRecord(id: string, babyId: string): Promise<VaccinationRecord | null> {
  const [record] = await getDb()
    .select()
    .from(vaccinationRecords)
    .where(and(eq(vaccinationRecords.id, id), eq(vaccinationRecords.babyId, babyId)))
    .limit(1);
  return record ?? null;
}

export async function createVaccinationRecord(babyId: string, input: VaccinationRecordInput) {
  const id = crypto.randomUUID();
  const now = new Date();
  await getDb().insert(vaccinationRecords).values({ id, ...recordValues(babyId, input, now), createdAt: now });
  return getVaccinationRecord(id, babyId);
}

export async function updateVaccinationRecord(id: string, babyId: string, input: VaccinationRecordInput) {
  if (!(await getVaccinationRecord(id, babyId))) return null;
  await getDb()
    .update(vaccinationRecords)
    .set(recordValues(babyId, input, new Date()))
    .where(and(eq(vaccinationRecords.id, id), eq(vaccinationRecords.babyId, babyId)));
  return getVaccinationRecord(id, babyId);
}

export async function deleteVaccinationRecord(id: string, babyId: string) {
  const result = await getDb()
    .delete(vaccinationRecords)
    .where(and(eq(vaccinationRecords.id, id), eq(vaccinationRecords.babyId, babyId)))
    .run();
  return result.changes > 0;
}
