import "server-only";

import { and, asc, eq } from "drizzle-orm";
import { getDb } from "@/db";
import { foodCatalogItems } from "@/db/schema";

export async function listFoodCatalogItems(babyId: string) {
  return getDb().select().from(foodCatalogItems).where(eq(foodCatalogItems.babyId, babyId)).orderBy(asc(foodCatalogItems.name));
}

export async function createFoodCatalogItem(babyId: string, input: { name: string; defaultUnit?: string | null }) {
  const now = new Date();
  const item: typeof foodCatalogItems.$inferInsert = {
    id: crypto.randomUUID(),
    babyId,
    name: input.name,
    defaultUnit: input.defaultUnit || null,
    createdAt: now,
    updatedAt: now,
  };
  await getDb().insert(foodCatalogItems).values(item);
  return item;
}

export async function deleteFoodCatalogItem(id: string, babyId: string) {
  const result = await getDb().delete(foodCatalogItems).where(and(eq(foodCatalogItems.id, id), eq(foodCatalogItems.babyId, babyId))).run();
  return result.changes > 0;
}
