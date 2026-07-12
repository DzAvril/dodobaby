import "server-only";

import { and, asc, desc, eq, gte, inArray, lt, lte } from "drizzle-orm";
import { getDb } from "@/db";
import { babies, mealEntries, mealItems, mealReactionTags, type Baby, type MealEntryRow, type MealItem } from "@/db/schema";
import { monthBounds } from "@/lib/dates";
import type { MealInput } from "@/lib/validation";

export type MealRecord = MealEntryRow & {
  items: MealItem[];
  reactionTags: string[];
};

export async function getCurrentBaby(): Promise<Baby | null> {
  const [baby] = await getDb().select().from(babies).orderBy(desc(babies.isActive), asc(babies.createdAt)).limit(1);
  return baby ?? null;
}

export async function createBaby(input: { name: string; birthDate: string; sex: "male" | "female" | "unknown"; timezone: string }) {
  const now = new Date();
  const baby: typeof babies.$inferInsert = {
    id: crypto.randomUUID(),
    ...input,
    isActive: true,
    createdAt: now,
    updatedAt: now,
  };
  await getDb().insert(babies).values(baby);
  return baby;
}

export async function updateBaby(id: string, input: { name: string; birthDate: string; sex: "male" | "female" | "unknown"; timezone: string }) {
  await getDb().update(babies).set({ ...input, updatedAt: new Date() }).where(eq(babies.id, id));
  return getCurrentBaby();
}

async function hydrateMeals(rows: MealEntryRow[]): Promise<MealRecord[]> {
  if (!rows.length) return [];
  const ids = rows.map((row) => row.id);
  const [items, reactions] = await Promise.all([
    getDb().select().from(mealItems).where(inArray(mealItems.mealId, ids)).orderBy(asc(mealItems.sortOrder)),
    getDb().select().from(mealReactionTags).where(inArray(mealReactionTags.mealId, ids)),
  ]);

  return rows.map((row) => ({
    ...row,
    items: items.filter((item) => item.mealId === row.id),
    reactionTags: reactions.filter((reaction) => reaction.mealId === row.id).map((reaction) => reaction.tag),
  }));
}

export async function listMealsByMonth(babyId: string, month: string): Promise<MealRecord[]> {
  const { start, end } = monthBounds(month);
  const rows = await getDb()
    .select()
    .from(mealEntries)
    .where(and(eq(mealEntries.babyId, babyId), gte(mealEntries.mealDate, start), lte(mealEntries.mealDate, end)))
    .orderBy(asc(mealEntries.mealDate), asc(mealEntries.plannedTime), asc(mealEntries.createdAt));
  return hydrateMeals(rows);
}

export async function getMeal(id: string, babyId: string): Promise<MealRecord | null> {
  const [row] = await getDb()
    .select()
    .from(mealEntries)
    .where(and(eq(mealEntries.id, id), eq(mealEntries.babyId, babyId)))
    .limit(1);
  return row ? (await hydrateMeals([row]))[0] : null;
}

function entryValues(babyId: string, input: MealInput, now: Date) {
  return {
    babyId,
    mealDate: input.mealDate,
    mealType: input.mealType,
    customMealType: input.customMealType || null,
    plannedTime: input.plannedTime || null,
    planNote: input.planNote || null,
    actualStatus: input.actualStatus,
    actualTime: input.actualTime || null,
    actualNote: input.actualNote || null,
    updatedAt: now,
  };
}

function itemValues(mealId: string, input: MealInput) {
  return input.items.map((item, index) => ({
    id: crypto.randomUUID(),
    mealId,
    name: item.name,
    amount: item.amount ?? null,
    unit: item.unit || null,
    preparation: item.preparation || null,
    isFirstTry: item.isFirstTry,
    sortOrder: index,
  }));
}

export async function createMeal(babyId: string, input: MealInput) {
  const id = crypto.randomUUID();
  const now = new Date();
  getDb().transaction((tx) => {
    tx.insert(mealEntries).values({ id, ...entryValues(babyId, input, now), createdAt: now }).run();
    tx.insert(mealItems).values(itemValues(id, input)).run();
    if (input.reactionTags.length) {
      tx.insert(mealReactionTags).values(input.reactionTags.map((tag) => ({ id: crypto.randomUUID(), mealId: id, tag }))).run();
    }
  });
  return getMeal(id, babyId);
}

export async function updateMeal(id: string, babyId: string, input: MealInput) {
  const existing = await getMeal(id, babyId);
  if (!existing) return null;
  const now = new Date();
  getDb().transaction((tx) => {
    tx.update(mealEntries).set(entryValues(babyId, input, now)).where(eq(mealEntries.id, id)).run();
    tx.delete(mealItems).where(eq(mealItems.mealId, id)).run();
    tx.delete(mealReactionTags).where(eq(mealReactionTags.mealId, id)).run();
    tx.insert(mealItems).values(itemValues(id, input)).run();
    if (input.reactionTags.length) {
      tx.insert(mealReactionTags).values(input.reactionTags.map((tag) => ({ id: crypto.randomUUID(), mealId: id, tag }))).run();
    }
  });
  return getMeal(id, babyId);
}

export async function deleteMeal(id: string, babyId: string) {
  const result = await getDb().delete(mealEntries).where(and(eq(mealEntries.id, id), eq(mealEntries.babyId, babyId))).run();
  return result.changes > 0;
}

export async function getPreviousMeal(babyId: string, beforeDate: string): Promise<MealRecord | null> {
  const [row] = await getDb()
    .select()
    .from(mealEntries)
    .where(and(eq(mealEntries.babyId, babyId), lt(mealEntries.mealDate, beforeDate)))
    .orderBy(desc(mealEntries.mealDate), desc(mealEntries.plannedTime), desc(mealEntries.createdAt))
    .limit(1);
  return row ? (await hydrateMeals([row]))[0] : null;
}
