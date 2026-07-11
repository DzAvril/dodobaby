import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";
import Database from "better-sqlite3";
import { drizzle } from "drizzle-orm/better-sqlite3";
import { migrate } from "drizzle-orm/better-sqlite3/migrator";
import { readMigrationFiles } from "drizzle-orm/migrator";

test("旧数据库升级到疫苗迁移时保留原数据、索引和级联外键", () => {
  const directory = mkdtempSync(path.join(tmpdir(), "dodobaby-vaccination-migration-"));
  const databasePath = path.join(directory, "dodobaby.db");
  const migrationsFolder = path.join(process.cwd(), "drizzle");
  const migrations = readMigrationFiles({ migrationsFolder });
  const sqlite = new Database(databasePath);

  try {
    assert.ok(migrations.length >= 5);
    sqlite.pragma("foreign_keys = ON");
    sqlite.exec(`CREATE TABLE __drizzle_migrations (
      id SERIAL PRIMARY KEY,
      hash text NOT NULL,
      created_at numeric
    )`);

    const rememberMigration = sqlite.prepare("INSERT INTO __drizzle_migrations (hash, created_at) VALUES (?, ?)");
    for (const migration of migrations.slice(0, 4)) {
      for (const statement of migration.sql) {
        if (statement.trim()) sqlite.exec(statement);
      }
      rememberMigration.run(migration.hash, migration.folderMillis);
    }

    const createdAt = Date.parse("2026-07-01T00:00:00Z");
    sqlite.prepare("INSERT INTO babies VALUES (?, ?, ?, ?, ?, ?, ?)")
      .run("baby-1", "DoDo", "2026-01-04", "Asia/Shanghai", 1, createdAt, createdAt);
    sqlite.prepare("INSERT INTO meal_entries VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)")
      .run("meal-1", "baby-1", "2026-07-10", "lunch", null, "12:30", null, "completed", "12:40", null, createdAt, createdAt);
    sqlite.prepare("INSERT INTO meal_items VALUES (?, ?, ?, ?, ?, ?, ?, ?)")
      .run("item-1", "meal-1", "南瓜", 20, "g", "蒸熟压泥", 0, 0);
    sqlite.prepare("INSERT INTO meal_reaction_tags VALUES (?, ?, ?)")
      .run("reaction-1", "meal-1", "喜欢");
    sqlite.prepare("INSERT INTO app_settings VALUES (?, ?, ?)")
      .run("password_hash", "scrypt:legacy-test", createdAt);
    sqlite.prepare("INSERT INTO food_catalog_items VALUES (?, ?, ?, ?, ?, ?)")
      .run("food-1", "baby-1", "南瓜", "g", createdAt, createdAt);
    sqlite.prepare("INSERT INTO growth_records VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)")
      .run("growth-1", "baby-1", "2026-07-11", 7.2, 66, 42, null, createdAt, createdAt);
    sqlite.prepare("INSERT INTO feeding_records VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)")
      .run("feeding-1", "baby-1", "2026-07-11", "08:30", 10, null, 60, null, "混合喂养", createdAt, createdAt);

    migrate(drizzle(sqlite), { migrationsFolder });
    migrate(drizzle(sqlite), { migrationsFolder });

    assert.equal(sqlite.prepare("SELECT count(*) AS count FROM babies").get().count, 1);
    assert.equal(sqlite.prepare("SELECT count(*) AS count FROM meal_entries").get().count, 1);
    assert.equal(sqlite.prepare("SELECT count(*) AS count FROM meal_items").get().count, 1);
    assert.equal(sqlite.prepare("SELECT count(*) AS count FROM meal_reaction_tags").get().count, 1);
    assert.equal(sqlite.prepare("SELECT count(*) AS count FROM app_settings").get().count, 1);
    assert.equal(sqlite.prepare("SELECT count(*) AS count FROM food_catalog_items").get().count, 1);
    assert.equal(sqlite.prepare("SELECT count(*) AS count FROM growth_records").get().count, 1);
    assert.equal(sqlite.prepare("SELECT count(*) AS count FROM feeding_records").get().count, 1);
    assert.equal(sqlite.prepare("SELECT count(*) AS count FROM vaccination_records").get().count, 0);
    assert.equal(sqlite.prepare("SELECT name FROM meal_items WHERE id = 'item-1'").get().name, "南瓜");
    assert.equal(sqlite.prepare("SELECT tag FROM meal_reaction_tags WHERE id = 'reaction-1'").get().tag, "喜欢");
    assert.equal(sqlite.prepare("SELECT value FROM app_settings WHERE key = 'password_hash'").get().value, "scrypt:legacy-test");
    assert.equal(sqlite.prepare("SELECT count(*) AS count FROM __drizzle_migrations").get().count, migrations.length);
    assert.deepEqual(
      sqlite.pragma("index_info('vaccination_records_baby_status_planned_date_idx')").map((column: { name: string }) => column.name),
      ["baby_id", "status", "planned_date"],
    );
    assert.deepEqual(
      sqlite.pragma("index_info('vaccination_records_baby_administered_date_idx')").map((column: { name: string }) => column.name),
      ["baby_id", "administered_date"],
    );
    assert.equal(sqlite.pragma("foreign_key_check").length, 0);
    assert.equal(sqlite.pragma("integrity_check", { simple: true }), "ok");

    sqlite.prepare(`INSERT INTO vaccination_records (
      id, baby_id, vaccine_name, dose_number, category, status, planned_date, planned_time,
      administered_date, manufacturer, batch_number, administration_site, vaccination_unit,
      note, created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`).run(
      "vaccine-1", "baby-1", "乙肝疫苗", 2, "immunization_program", "planned", "2026-08-01", "09:30",
      null, null, null, null, null, "以接种单位安排为准", createdAt, createdAt,
    );
    sqlite.prepare("DELETE FROM babies WHERE id = ?").run("baby-1");
    assert.equal(sqlite.prepare("SELECT count(*) AS count FROM vaccination_records").get().count, 0);
  } finally {
    sqlite.close();
    rmSync(directory, { recursive: true, force: true });
  }
});
