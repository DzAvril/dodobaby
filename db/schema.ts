import { sql } from "drizzle-orm";
import { check, index, integer, real, sqliteTable, text, uniqueIndex } from "drizzle-orm/sqlite-core";

export const appSettings = sqliteTable("app_settings", {
  key: text("key").primaryKey(),
  value: text("value").notNull(),
  updatedAt: integer("updated_at", { mode: "timestamp_ms" }).notNull(),
});

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

export const foodCatalogItems = sqliteTable(
  "food_catalog_items",
  {
    id: text("id").primaryKey(),
    babyId: text("baby_id").notNull().references(() => babies.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    defaultUnit: text("default_unit"),
    createdAt: integer("created_at", { mode: "timestamp_ms" }).notNull(),
    updatedAt: integer("updated_at", { mode: "timestamp_ms" }).notNull(),
  },
  (table) => [
    uniqueIndex("food_catalog_baby_name_unique").on(table.babyId, table.name),
    index("food_catalog_baby_idx").on(table.babyId),
  ],
);

export const growthRecords = sqliteTable(
  "growth_records",
  {
    id: text("id").primaryKey(),
    babyId: text("baby_id").notNull().references(() => babies.id, { onDelete: "cascade" }),
    measuredDate: text("measured_date").notNull(),
    weightKg: real("weight_kg"),
    heightCm: real("height_cm"),
    headCircumferenceCm: real("head_circumference_cm"),
    note: text("note"),
    createdAt: integer("created_at", { mode: "timestamp_ms" }).notNull(),
    updatedAt: integer("updated_at", { mode: "timestamp_ms" }).notNull(),
  },
  (table) => [
    uniqueIndex("growth_records_baby_date_unique").on(table.babyId, table.measuredDate),
  ],
);

export const feedingRecords = sqliteTable(
  "feeding_records",
  {
    id: text("id").primaryKey(),
    babyId: text("baby_id").notNull().references(() => babies.id, { onDelete: "cascade" }),
    feedingDate: text("feeding_date").notNull(),
    startedTime: text("started_time").notNull(),
    leftDurationMinutes: integer("left_duration_minutes"),
    rightDurationMinutes: integer("right_duration_minutes"),
    expressedMilkMl: real("expressed_milk_ml"),
    formulaMl: real("formula_ml"),
    note: text("note"),
    createdAt: integer("created_at", { mode: "timestamp_ms" }).notNull(),
    updatedAt: integer("updated_at", { mode: "timestamp_ms" }).notNull(),
  },
  (table) => [index("feeding_records_baby_date_idx").on(table.babyId, table.feedingDate)],
);

export const vaccinationRecords = sqliteTable(
  "vaccination_records",
  {
    id: text("id").primaryKey(),
    babyId: text("baby_id").notNull().references(() => babies.id, { onDelete: "cascade" }),
    vaccineName: text("vaccine_name").notNull(),
    doseNumber: integer("dose_number").notNull(),
    category: text("category", { enum: ["immunization_program", "non_immunization_program", "unknown"] }).notNull().default("unknown"),
    status: text("status", { enum: ["planned", "completed"] }).notNull(),
    plannedDate: text("planned_date"),
    plannedTime: text("planned_time"),
    administeredDate: text("administered_date"),
    manufacturer: text("manufacturer"),
    batchNumber: text("batch_number"),
    administrationSite: text("administration_site"),
    vaccinationUnit: text("vaccination_unit"),
    note: text("note"),
    createdAt: integer("created_at", { mode: "timestamp_ms" }).notNull(),
    updatedAt: integer("updated_at", { mode: "timestamp_ms" }).notNull(),
  },
  (table) => [
    index("vaccination_records_baby_status_planned_date_idx").on(table.babyId, table.status, table.plannedDate),
    index("vaccination_records_baby_administered_date_idx").on(table.babyId, table.administeredDate),
  ],
);

export const diaperRecords = sqliteTable(
  "diaper_records",
  {
    id: text("id").primaryKey(),
    babyId: text("baby_id").notNull().references(() => babies.id, { onDelete: "cascade" }),
    diaperDate: text("diaper_date").notNull(),
    changedTime: text("changed_time").notNull(),
    diaperType: text("diaper_type", { enum: ["wet", "dirty", "both"] }).notNull(),
    urineAmount: text("urine_amount", { enum: ["small", "medium", "large"] }),
    stoolAmount: text("stool_amount", { enum: ["small", "medium", "large"] }),
    stoolColor: text("stool_color", { enum: ["yellow", "green", "brown", "black", "red", "white", "other"] }),
    stoolConsistency: text("stool_consistency", { enum: ["watery", "loose", "soft", "formed", "hard", "other"] }),
    skinObservation: text("skin_observation", { enum: ["clear", "red", "broken"] }),
    note: text("note"),
    createdAt: integer("created_at", { mode: "timestamp_ms" }).notNull(),
    updatedAt: integer("updated_at", { mode: "timestamp_ms" }).notNull(),
  },
  (table) => [index("diaper_records_baby_date_time_idx").on(table.babyId, table.diaperDate, table.changedTime)],
);

export const sleepRecords = sqliteTable(
  "sleep_records",
  {
    id: text("id").primaryKey(),
    babyId: text("baby_id").notNull().references(() => babies.id, { onDelete: "cascade" }),
    startedAt: integer("started_at", { mode: "timestamp_ms" }).notNull(),
    endedAt: integer("ended_at", { mode: "timestamp_ms" }),
    recordTimezone: text("record_timezone").notNull(),
    note: text("note"),
    createdAt: integer("created_at", { mode: "timestamp_ms" }).notNull(),
    updatedAt: integer("updated_at", { mode: "timestamp_ms" }).notNull(),
  },
  (table) => [
    index("sleep_records_baby_started_at_idx").on(table.babyId, table.startedAt),
    uniqueIndex("sleep_records_one_active_per_baby").on(table.babyId).where(sql`${table.endedAt} IS NULL`),
    check(
      "sleep_records_valid_interval",
      sql`${table.endedAt} IS NULL OR ${table.endedAt} > ${table.startedAt}`,
    ),
  ],
);

export type Baby = typeof babies.$inferSelect;
export type MealEntryRow = typeof mealEntries.$inferSelect;
export type MealItem = typeof mealItems.$inferSelect;
export type FoodCatalogItem = typeof foodCatalogItems.$inferSelect;
export type GrowthRecord = typeof growthRecords.$inferSelect;
export type FeedingRecord = typeof feedingRecords.$inferSelect;
export type VaccinationRecord = typeof vaccinationRecords.$inferSelect;
export type DiaperRecord = typeof diaperRecords.$inferSelect;
export type SleepRecord = typeof sleepRecords.$inferSelect;
