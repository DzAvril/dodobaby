import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";
import Database from "better-sqlite3";
import { drizzle } from "drizzle-orm/better-sqlite3";
import { migrate } from "drizzle-orm/better-sqlite3/migrator";
import { readMigrationFiles } from "drizzle-orm/migrator";

test("旧数据库升级到喂养迁移时保留原数据并建立外键", () => {
  const directory = mkdtempSync(path.join(tmpdir(), "dodobaby-feeding-migration-"));
  const databasePath = path.join(directory, "dodobaby.db");
  const migrationsFolder = path.join(process.cwd(), "drizzle");
  const migrations = readMigrationFiles({ migrationsFolder });
  const sqlite = new Database(databasePath);

  try {
    sqlite.pragma("foreign_keys = ON");
    sqlite.exec(`CREATE TABLE __drizzle_migrations (
      id SERIAL PRIMARY KEY,
      hash text NOT NULL,
      created_at numeric
    )`);

    const rememberMigration = sqlite.prepare(
      "INSERT INTO __drizzle_migrations (hash, created_at) VALUES (?, ?)",
    );
    for (const migration of migrations.slice(0, 3)) {
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
      .run("item-1", "meal-1", "米粉", 5, "g", null, 0, 0);
    sqlite.prepare("INSERT INTO food_catalog_items VALUES (?, ?, ?, ?, ?, ?)")
      .run("food-1", "baby-1", "米粉", "g", createdAt, createdAt);
    sqlite.prepare("INSERT INTO growth_records VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)")
      .run("growth-1", "baby-1", "2026-07-11", 7.2, 66, 42, null, createdAt, createdAt);

    migrate(drizzle(sqlite), { migrationsFolder });
    migrate(drizzle(sqlite), { migrationsFolder });

    for (const [table, expected] of [
      ["babies", 1],
      ["meal_entries", 1],
      ["meal_items", 1],
      ["food_catalog_items", 1],
      ["growth_records", 1],
    ] as const) {
      assert.equal(sqlite.prepare(`SELECT count(*) AS count FROM ${table}`).get().count, expected);
    }
    assert.equal(sqlite.prepare("SELECT count(*) AS count FROM __drizzle_migrations").get().count, 4);
    assert.equal(sqlite.prepare("SELECT count(*) AS count FROM feeding_records").get().count, 0);
    assert.deepEqual(
      sqlite.pragma("index_info('feeding_records_baby_date_idx')").map((column: { name: string }) => column.name),
      ["baby_id", "feeding_date"],
    );
    assert.equal(sqlite.pragma("foreign_key_check").length, 0);
    assert.equal(sqlite.pragma("integrity_check", { simple: true }), "ok");

    sqlite.prepare("INSERT INTO feeding_records VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)")
      .run("feeding-1", "baby-1", "2026-07-11", "08:30", 10, null, 60, null, "混合喂养", createdAt, createdAt);
    sqlite.prepare("DELETE FROM babies WHERE id = ?").run("baby-1");
    assert.equal(sqlite.prepare("SELECT count(*) AS count FROM feeding_records").get().count, 0);
  } finally {
    sqlite.close();
    rmSync(directory, { recursive: true, force: true });
  }
});
