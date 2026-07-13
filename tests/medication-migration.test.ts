import assert from "node:assert/strict";
import test from "node:test";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import Database from "better-sqlite3";
import { drizzle } from "drizzle-orm/better-sqlite3";
import { migrate } from "drizzle-orm/better-sqlite3/migrator";
import { readMigrationFiles } from "drizzle-orm/migrator";

test("旧数据库升级后建立用药计划和实际记录约束并保留历史", () => {
  const directory = mkdtempSync(path.join(tmpdir(), "dodobaby-medication-migration-"));
  const databasePath = path.join(directory, "dodobaby.db");
  const migrationsFolder = path.join(process.cwd(), "drizzle");
  const migrations = readMigrationFiles({ migrationsFolder });
  const sqlite = new Database(databasePath);

  try {
    assert.ok(migrations.length >= 10);
    sqlite.pragma("foreign_keys = ON");
    sqlite.exec("CREATE TABLE __drizzle_migrations (id SERIAL PRIMARY KEY, hash text NOT NULL, created_at numeric)");
    const remember = sqlite.prepare("INSERT INTO __drizzle_migrations (hash, created_at) VALUES (?, ?)");
    for (const migration of migrations.slice(0, -1)) {
      for (const statement of migration.sql) if (statement.trim()) sqlite.exec(statement);
      remember.run(migration.hash, migration.folderMillis);
    }
    const now = Date.parse("2026-07-13T00:00:00Z");
    sqlite.prepare("INSERT INTO babies (id, name, birth_date, sex, timezone, is_active, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)")
      .run("baby-1", "DoDo", "2026-01-01", "unknown", "Asia/Shanghai", 1, now, now);
    sqlite.prepare("INSERT INTO app_settings (key, value, updated_at) VALUES (?, ?, ?)")
      .run("password_hash", "scrypt:legacy-test", now);

    migrate(drizzle(sqlite), { migrationsFolder });
    migrate(drizzle(sqlite), { migrationsFolder });

    assert.equal((sqlite.prepare("SELECT count(*) AS count FROM app_settings").get() as { count: number }).count, 1);
    assert.equal((sqlite.prepare("SELECT count(*) AS count FROM __drizzle_migrations").get() as { count: number }).count, migrations.length);
    assert.deepEqual(sqlite.pragma("index_info('medication_plans_baby_start_date_idx')").map((column: { name: string }) => column.name), ["baby_id", "start_date"]);
    assert.deepEqual(sqlite.pragma("index_info('medication_records_baby_date_time_idx')").map((column: { name: string }) => column.name), ["baby_id", "taken_date", "taken_time"]);

    sqlite.prepare("INSERT INTO medication_plans VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)")
      .run("plan-1", "baby-1", "维生素 D3", 1, "滴", 2, '["08:00"]', "2026-07-13", null, null, now, now);
    sqlite.prepare("INSERT INTO medication_records VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)")
      .run("record-1", "baby-1", "plan-1", "维生素 D3", 1, "滴", "2026-07-13", "08:00", "08:05", null, now, now);
    assert.throws(() => sqlite.prepare("INSERT INTO medication_records VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)")
      .run("record-2", "baby-1", "plan-1", "维生素 D3", 1, "滴", "2026-07-13", "08:00", "08:10", null, now, now), /UNIQUE/);
    sqlite.prepare("DELETE FROM medication_plans WHERE id = ?").run("plan-1");
    assert.equal((sqlite.prepare("SELECT plan_id AS planId FROM medication_records WHERE id = 'record-1'").get() as { planId: string | null }).planId, null);
    assert.equal((sqlite.prepare("SELECT medication_name AS name FROM medication_records WHERE id = 'record-1'").get() as { name: string }).name, "维生素 D3");
    sqlite.prepare("DELETE FROM babies WHERE id = ?").run("baby-1");
    assert.equal((sqlite.prepare("SELECT count(*) AS count FROM medication_records").get() as { count: number }).count, 0);
    assert.equal(sqlite.pragma("foreign_key_check").length, 0);
    assert.equal(sqlite.pragma("integrity_check", { simple: true }), "ok");
  } finally {
    sqlite.close();
    rmSync(directory, { recursive: true, force: true });
  }
});
