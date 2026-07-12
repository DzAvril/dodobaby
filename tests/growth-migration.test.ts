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
type TextRow = { value: string };

test("0001 旧库升级到完整迁移时保留数据并建立生长记录约束", () => {
  const directory = mkdtempSync(path.join(tmpdir(), "dodobaby-growth-migration-"));
  const databasePath = path.join(directory, "dodobaby.db");
  const migrationsFolder = path.join(process.cwd(), "drizzle");
  const migrations = readMigrationFiles({ migrationsFolder });
  const sqlite = new Database(databasePath);
  const count = (table: string) => (sqlite.prepare(`SELECT count(*) AS count FROM ${table}`).get() as CountRow).count;

  try {
    assert.ok(migrations.length >= 8);
    sqlite.pragma("foreign_keys = ON");
    sqlite.exec(`CREATE TABLE __drizzle_migrations (
      id SERIAL PRIMARY KEY,
      hash text NOT NULL,
      created_at numeric
    )`);
    const rememberMigration = sqlite.prepare("INSERT INTO __drizzle_migrations (hash, created_at) VALUES (?, ?)");
    for (const migration of migrations.slice(0, 2)) {
      for (const statement of migration.sql) if (statement.trim()) sqlite.exec(statement);
      rememberMigration.run(migration.hash, migration.folderMillis);
    }

    const createdAt = Date.parse("2026-07-01T00:00:00Z");
    sqlite.prepare("INSERT INTO babies VALUES (?, ?, ?, ?, ?, ?, ?)")
      .run("baby-1", "DoDo", "2026-01-04", "Asia/Shanghai", 1, createdAt, createdAt);
    sqlite.prepare("INSERT INTO meal_entries VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)")
      .run("meal-1", "baby-1", "2026-07-10", "lunch", null, "12:30", "迁移前餐食", "completed", "12:40", null, createdAt, createdAt);
    sqlite.prepare("INSERT INTO meal_items VALUES (?, ?, ?, ?, ?, ?, ?, ?)")
      .run("item-1", "meal-1", "南瓜", 20, "g", "蒸熟压泥", 0, 0);
    sqlite.prepare("INSERT INTO meal_reaction_tags VALUES (?, ?, ?)").run("reaction-1", "meal-1", "liked");
    sqlite.prepare("INSERT INTO app_settings VALUES (?, ?, ?)").run("password_hash", "scrypt:legacy-test", createdAt);
    sqlite.prepare("INSERT INTO food_catalog_items VALUES (?, ?, ?, ?, ?, ?)")
      .run("food-1", "baby-1", "南瓜", "g", createdAt, createdAt);

    migrate(drizzle(sqlite), { migrationsFolder });
    migrate(drizzle(sqlite), { migrationsFolder });

    for (const table of ["babies", "meal_entries", "meal_items", "meal_reaction_tags", "app_settings", "food_catalog_items"]) {
      assert.equal(count(table), 1, `${table} data should survive`);
    }
    assert.equal((sqlite.prepare("SELECT value FROM app_settings WHERE key = 'password_hash'").get() as TextRow).value, "scrypt:legacy-test");
    assert.equal((sqlite.prepare("SELECT name AS value FROM meal_items WHERE id = 'item-1'").get() as TextRow).value, "南瓜");
    assert.equal((sqlite.prepare("SELECT sex AS value FROM babies WHERE id = 'baby-1'").get() as TextRow).value, "unknown");
    assert.equal(count("growth_records"), 0);
    assert.equal(count("feeding_records"), 0);
    assert.equal(count("vaccination_records"), 0);
    assert.equal(count("diaper_records"), 0);
    assert.equal(count("sleep_records"), 0);
    assert.equal(count("__drizzle_migrations"), migrations.length);
    assert.deepEqual(
      (sqlite.pragma("index_info('growth_records_baby_date_unique')") as Array<{ name: string }>).map((column) => column.name),
      ["baby_id", "measured_date"],
    );

    const insertGrowth = sqlite.prepare(`INSERT INTO growth_records (
      id, baby_id, measured_date, weight_kg, height_cm, head_circumference_cm, note, created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`);
    insertGrowth.run("growth-1", "baby-1", "2026-07-11", 7.2, 66, 42, "首条记录", createdAt, createdAt);
    assert.throws(
      () => insertGrowth.run("growth-duplicate", "baby-1", "2026-07-11", 7.3, null, null, null, createdAt, createdAt),
      /UNIQUE constraint failed/,
    );

    sqlite.prepare(`INSERT INTO babies (
      id, name, birth_date, timezone, is_active, created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?)`)
      .run("baby-2", "Second Baby", "2026-02-01", "Asia/Shanghai", 0, createdAt, createdAt);
    insertGrowth.run("growth-other-baby", "baby-2", "2026-07-11", 6.8, null, null, null, createdAt, createdAt);
    assert.equal(count("growth_records"), 2);
    assert.throws(
      () => insertGrowth.run("growth-orphan", "missing-baby", "2026-07-12", 6.9, null, null, null, createdAt, createdAt),
      /FOREIGN KEY constraint failed/,
    );

    assert.equal((sqlite.pragma("foreign_key_check") as unknown[]).length, 0);
    assert.equal(sqlite.pragma("integrity_check", { simple: true }), "ok");
    sqlite.prepare("DELETE FROM babies WHERE id = ?").run("baby-1");
    assert.equal((sqlite.prepare("SELECT count(*) AS count FROM growth_records WHERE baby_id = 'baby-1'").get() as CountRow).count, 0);
    assert.equal((sqlite.prepare("SELECT count(*) AS count FROM growth_records WHERE baby_id = 'baby-2'").get() as CountRow).count, 1);
  } finally {
    sqlite.close();
    rmSync(directory, { recursive: true, force: true });
  }
});
