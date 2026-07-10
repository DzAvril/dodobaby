import { index, integer, real, sqliteTable, text } from "drizzle-orm/sqlite-core";

export const babies = sqliteTable("babies", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  birthDate: text("birth_date").notNull(),
  timezone: text("timezone").notNull().default("Asia/Shanghai"),
  isActive: integer("is_active", { mode: "boolean" }).notNull().default(true),
  createdAt: integer("created_at", { mode: "timestamp_ms" }).notNull(),
  updatedAt: integer("updated_at", { mode: "timestamp_ms" }).notNull(),
});

export const mealEntries = sqliteTable(
  "meal_entries",
  {
    id: text("id").primaryKey(),
    babyId: text("baby_id").notNull().references(() => babies.id, { onDelete: "cascade" }),
    mealDate: text("meal_date").notNull(),
    mealType: text("meal_type").notNull(),
    customMealType: text("custom_meal_type"),
    plannedTime: text("planned_time"),
    planNote: text("plan_note"),
    actualStatus: text("actual_status").notNull().default("planned"),
    actualTime: text("actual_time"),
    actualNote: text("actual_note"),
    createdAt: integer("created_at", { mode: "timestamp_ms" }).notNull(),
    updatedAt: integer("updated_at", { mode: "timestamp_ms" }).notNull(),
  },
  (table) => [
    index("meal_entries_baby_date_idx").on(table.babyId, table.mealDate),
    index("meal_entries_status_idx").on(table.actualStatus),
  ],
);

export const mealItems = sqliteTable(
  "meal_items",
  {
    id: text("id").primaryKey(),
    mealId: text("meal_id").notNull().references(() => mealEntries.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    amount: real("amount"),
    unit: text("unit"),
    preparation: text("preparation"),
    isFirstTry: integer("is_first_try", { mode: "boolean" }).notNull().default(false),
    sortOrder: integer("sort_order").notNull().default(0),
  },
  (table) => [index("meal_items_meal_idx").on(table.mealId), index("meal_items_name_idx").on(table.name)],
);

export const mealReactionTags = sqliteTable(
  "meal_reaction_tags",
  {
    id: text("id").primaryKey(),
    mealId: text("meal_id").notNull().references(() => mealEntries.id, { onDelete: "cascade" }),
    tag: text("tag").notNull(),
  },
  (table) => [index("meal_reaction_tags_meal_idx").on(table.mealId), index("meal_reaction_tags_tag_idx").on(table.tag)],
);

export type Baby = typeof babies.$inferSelect;
export type MealEntryRow = typeof mealEntries.$inferSelect;
export type MealItem = typeof mealItems.$inferSelect;
