import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";
import Database from "better-sqlite3";
import { drizzle } from "drizzle-orm/better-sqlite3";
import { migrate } from "drizzle-orm/better-sqlite3/migrator";
import { readMigrationFiles } from "drizzle-orm/migrator";

test("旧数据库升级后建立设备订阅和喂奶提醒去重约束", () => {
  const directory = mkdtempSync(path.join(tmpdir(), "dodobaby-notification-migration-"));
  const databasePath = path.join(directory, "dodobaby.db");
  const migrationsFolder = path.join(process.cwd(), "drizzle");
  const migrations = readMigrationFiles({ migrationsFolder });
  const sqlite = new Database(databasePath);

  try {
    assert.ok(migrations.length >= 11);
    sqlite.pragma("foreign_keys = ON");
    sqlite.exec("CREATE TABLE __drizzle_migrations (id SERIAL PRIMARY KEY, hash text NOT NULL, created_at numeric)");
    const remember = sqlite.prepare("INSERT INTO __drizzle_migrations (hash, created_at) VALUES (?, ?)");
    for (const migration of migrations.slice(0, -1)) {
      for (const statement of migration.sql) if (statement.trim()) sqlite.exec(statement);
      remember.run(migration.hash, migration.folderMillis);
    }
    const now = Date.parse("2026-07-15T00:00:00Z");
    sqlite.prepare("INSERT INTO babies (id, name, birth_date, sex, timezone, is_active, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)")
      .run("baby-1", "DoDo", "2026-01-01", "unknown", "Asia/Shanghai", 1, now, now);
    sqlite.prepare("INSERT INTO feeding_records VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)")
      .run("feeding-1", "baby-1", "2026-07-15", "08:30", 10, null, null, null, null, now, now);

    migrate(drizzle(sqlite), { migrationsFolder });
    migrate(drizzle(sqlite), { migrationsFolder });

    sqlite.prepare("INSERT INTO push_subscriptions (id, endpoint, p256dh, auth, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)")
      .run("subscription-1", "https://push.example.test/one", "public-key", "auth-secret", now, now);
    assert.throws(() => sqlite.prepare("INSERT INTO push_subscriptions (id, endpoint, p256dh, auth, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)")
      .run("subscription-2", "https://push.example.test/one", "other-key", "other-secret", now, now), /UNIQUE/);
    sqlite.prepare("INSERT INTO feeding_reminder_deliveries VALUES (?, ?, ?, ?)")
      .run("delivery-1", "subscription-1", "feeding-1", now);
    assert.throws(() => sqlite.prepare("INSERT INTO feeding_reminder_deliveries VALUES (?, ?, ?, ?)")
      .run("delivery-2", "subscription-1", "feeding-1", now), /UNIQUE/);
    sqlite.prepare("DELETE FROM feeding_records WHERE id = ?").run("feeding-1");
    assert.equal((sqlite.prepare("SELECT count(*) AS count FROM feeding_reminder_deliveries").get() as { count: number }).count, 0);
    assert.equal(sqlite.pragma("foreign_key_check").length, 0);
    assert.equal(sqlite.pragma("integrity_check", { simple: true }), "ok");
  } finally {
    sqlite.close();
    rmSync(directory, { recursive: true, force: true });
  }
});
