import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";
import Database from "better-sqlite3";
import { drizzle } from "drizzle-orm/better-sqlite3";
import { migrate } from "drizzle-orm/better-sqlite3/migrator";
import { readMigrationFiles } from "drizzle-orm/migrator";

type CountRow = { count: number };
type ValueRow = { value: string };
type IndexRow = { name: string; unique: number; partial: number };
type SqlRow = { sql: string };

test("0000-0005 旧库升级到睡眠迁移时保留数据、幂等并建立数据库约束", () => {
  const directory = mkdtempSync(path.join(tmpdir(), "dodobaby-sleep-migration-"));
  const databasePath = path.join(directory, "dodobaby.db");
  const migrationsFolder = path.join(process.cwd(), "drizzle");
  const migrations = readMigrationFiles({ migrationsFolder });
  const sqlite = new Database(databasePath);

  const count = (table: string) => sqlite.prepare(`SELECT count(*) AS count FROM ${table}`).get() as CountRow;

  try {
    assert.ok(migrations.length >= 7);
    sqlite.pragma("foreign_keys = ON");
    sqlite.exec(`CREATE TABLE __drizzle_migrations (
      id SERIAL PRIMARY KEY,
      hash text NOT NULL,
      created_at numeric
    )`);
    const rememberMigration = sqlite.prepare("INSERT INTO __drizzle_migrations (hash, created_at) VALUES (?, ?)");
    for (const migration of migrations.slice(0, 6)) {
      for (const statement of migration.sql) if (statement.trim()) sqlite.exec(statement);
      rememberMigration.run(migration.hash, migration.folderMillis);
    }

    const createdAt = Date.parse("2026-07-01T00:00:00Z");
    sqlite.prepare("INSERT INTO babies VALUES (?, ?, ?, ?, ?, ?, ?)")
      .run("baby-1", "DoDo", "2026-01-04", "Asia/Shanghai", 1, createdAt, createdAt);
    sqlite.prepare("INSERT INTO meal_entries VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)")
      .run("meal-1", "baby-1", "2026-07-10", "lunch", null, "12:30", null, "completed", "12:40", null, createdAt, createdAt);
    sqlite.prepare("INSERT INTO meal_items VALUES (?, ?, ?, ?, ?, ?, ?, ?)")
      .run("item-1", "meal-1", "南瓜", 20, "g", "蒸熟压泥", 0, 0);
    sqlite.prepare("INSERT INTO meal_reaction_tags VALUES (?, ?, ?)").run("reaction-1", "meal-1", "喜欢");
    sqlite.prepare("INSERT INTO app_settings VALUES (?, ?, ?)").run("password_hash", "scrypt:legacy-test", createdAt);
    sqlite.prepare("INSERT INTO food_catalog_items VALUES (?, ?, ?, ?, ?, ?)")
      .run("food-1", "baby-1", "南瓜", "g", createdAt, createdAt);
    sqlite.prepare("INSERT INTO growth_records VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)")
      .run("growth-1", "baby-1", "2026-07-11", 7.2, 66, 42, null, createdAt, createdAt);
    sqlite.prepare("INSERT INTO feeding_records VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)")
      .run("feeding-1", "baby-1", "2026-07-11", "08:30", 10, null, 60, null, "混合喂养", createdAt, createdAt);
    sqlite.prepare(`INSERT INTO vaccination_records (
      id, baby_id, vaccine_name, dose_number, category, status, planned_date, planned_time,
      administered_date, manufacturer, batch_number, administration_site, vaccination_unit,
      note, created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`).run(
      "vaccine-1", "baby-1", "乙肝疫苗", 2, "immunization_program", "planned", "2026-08-01", "09:30",
      null, null, null, null, null, "以接种单位安排为准", createdAt, createdAt,
    );
    sqlite.prepare(`INSERT INTO diaper_records (
      id, baby_id, diaper_date, changed_time, diaper_type, urine_amount, stool_amount,
      stool_color, stool_consistency, skin_observation, note, created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`).run(
      "diaper-1", "baby-1", "2026-07-11", "09:00", "both", "medium", "small", "yellow", "soft", "clear", "迁移前尿布", createdAt, createdAt,
    );

    migrate(drizzle(sqlite), { migrationsFolder });
    migrate(drizzle(sqlite), { migrationsFolder });

    for (const table of [
      "babies",
      "meal_entries",
      "meal_items",
      "meal_reaction_tags",
      "app_settings",
      "food_catalog_items",
      "growth_records",
      "feeding_records",
      "vaccination_records",
      "diaper_records",
    ]) {
      assert.equal(count(table).count, 1, `${table} data should survive`);
    }
    assert.equal(count("sleep_records").count, 0);
    assert.equal((sqlite.prepare("SELECT value FROM app_settings WHERE key = 'password_hash'").get() as ValueRow).value, "scrypt:legacy-test");
    assert.equal((sqlite.prepare("SELECT note AS value FROM diaper_records WHERE id = 'diaper-1'").get() as ValueRow).value, "迁移前尿布");
    assert.equal(count("__drizzle_migrations").count, migrations.length);

    assert.deepEqual(
      (sqlite.pragma("index_info('sleep_records_baby_started_at_idx')") as Array<{ name: string }>).map((column) => column.name),
      ["baby_id", "started_at"],
    );
    const activeIndex = (sqlite.pragma("index_list('sleep_records')") as IndexRow[])
      .find((index) => index.name === "sleep_records_one_active_per_baby");
    assert.deepEqual(activeIndex && { unique: activeIndex.unique, partial: activeIndex.partial }, { unique: 1, partial: 1 });
    const activeIndexSql = sqlite.prepare(
      "SELECT sql FROM sqlite_master WHERE type = 'index' AND name = 'sleep_records_one_active_per_baby'",
    ).get() as SqlRow;
    assert.match(activeIndexSql.sql, /WHERE\s+["`]?sleep_records["`]?\.["`]?ended_at["`]?\s+IS\s+NULL/i);

    const insertSleep = sqlite.prepare(`INSERT INTO sleep_records (
      id, baby_id, started_at, ended_at, record_timezone, note, created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`);
    const start = Date.parse("2026-07-10T12:00:00.000Z");
    insertSleep.run("completed-24h", "baby-1", start, start + 86_400_000, "Asia/Shanghai", "正好 24 小时", createdAt, createdAt);
    assert.throws(
      () => insertSleep.run("zero", "baby-1", start, start, "Asia/Shanghai", null, createdAt, createdAt),
      /CHECK constraint failed/,
    );
    assert.throws(
      () => insertSleep.run("reverse", "baby-1", start, start - 60_000, "Asia/Shanghai", null, createdAt, createdAt),
      /CHECK constraint failed/,
    );
    insertSleep.run("stale-ended", "baby-1", start, start + 86_460_000, "Asia/Shanghai", "允许结束遗忘关闭的进行中记录", createdAt, createdAt);
    assert.equal(sqlite.prepare("SELECT count(*) AS count FROM sleep_records WHERE id = 'stale-ended'").get<CountRow>().count, 1);

    insertSleep.run("active-1", "baby-1", start + 1_000, null, "Asia/Shanghai", null, createdAt, createdAt);
    assert.throws(
      () => insertSleep.run("active-2", "baby-1", start + 2_000, null, "Asia/Shanghai", null, createdAt, createdAt),
      /UNIQUE constraint failed/,
    );

    sqlite.prepare("INSERT INTO babies VALUES (?, ?, ?, ?, ?, ?, ?)")
      .run("baby-2", "Second Baby", "2026-02-01", "Asia/Shanghai", 0, createdAt, createdAt);
    insertSleep.run("active-other-baby", "baby-2", start + 2_000, null, "Asia/Shanghai", null, createdAt, createdAt);
    assert.throws(
      () => insertSleep.run("orphan", "missing-baby", start, null, "Asia/Shanghai", null, createdAt, createdAt),
      /FOREIGN KEY constraint failed/,
    );

    assert.equal((sqlite.pragma("foreign_key_check") as unknown[]).length, 0);
    assert.equal(sqlite.pragma("integrity_check", { simple: true }), "ok");
    sqlite.prepare("DELETE FROM babies WHERE id = ?").run("baby-1");
    assert.equal(sqlite.prepare("SELECT count(*) AS count FROM sleep_records WHERE baby_id = 'baby-1'").get<CountRow>().count, 0);
    assert.equal(sqlite.prepare("SELECT count(*) AS count FROM sleep_records WHERE baby_id = 'baby-2'").get<CountRow>().count, 1);
  } finally {
    sqlite.close();
    rmSync(directory, { recursive: true, force: true });
  }
});
