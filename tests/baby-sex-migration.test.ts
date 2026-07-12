import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";
import Database from "better-sqlite3";
import { drizzle } from "drizzle-orm/better-sqlite3";
import { migrate } from "drizzle-orm/better-sqlite3/migrator";
import { readMigrationFiles } from "drizzle-orm/migrator";

type MigrationCount = { count: number };
type BabySexRow = { name: string; sex: string };
type TableColumn = { name: string; notnull: number; dflt_value: string | null };

test("0007 为已有宝宝补 unknown 性别且可重复执行", () => {
  const directory = mkdtempSync(path.join(tmpdir(), "dodobaby-sex-migration-"));
  const databasePath = path.join(directory, "dodobaby.db");
  const migrationsFolder = path.join(process.cwd(), "drizzle");
  const migrations = readMigrationFiles({ migrationsFolder });
  const sqlite = new Database(databasePath);

  try {
    assert.ok(migrations.length >= 8, "expected migration 0007 to exist");
    sqlite.pragma("foreign_keys = ON");
    sqlite.exec(`CREATE TABLE __drizzle_migrations (
      id SERIAL PRIMARY KEY,
      hash text NOT NULL,
      created_at numeric
    )`);
    const rememberMigration = sqlite.prepare("INSERT INTO __drizzle_migrations (hash, created_at) VALUES (?, ?)");
    for (const migration of migrations.slice(0, 7)) {
      for (const statement of migration.sql) if (statement.trim()) sqlite.exec(statement);
      rememberMigration.run(migration.hash, migration.folderMillis);
    }

    const createdAt = Date.parse("2026-07-01T00:00:00Z");
    sqlite.prepare(`INSERT INTO babies (
      id, name, birth_date, timezone, is_active, created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?)`)
      .run("legacy-baby", "Legacy Baby", "2026-01-01", "Asia/Shanghai", 1, createdAt, createdAt);
    sqlite.prepare(`INSERT INTO growth_records (
      id, baby_id, measured_date, weight_kg, height_cm, head_circumference_cm, note, created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`)
      .run("legacy-growth", "legacy-baby", "2026-07-01", 7.2, 68, 43, "迁移前记录", createdAt, createdAt);

    migrate(drizzle(sqlite), { migrationsFolder });
    migrate(drizzle(sqlite), { migrationsFolder });

    assert.deepEqual(
      sqlite.prepare("SELECT name, sex FROM babies WHERE id = ?").get("legacy-baby") as BabySexRow,
      { name: "Legacy Baby", sex: "unknown" },
    );
    assert.equal(
      (sqlite.prepare("SELECT count(*) AS count FROM growth_records WHERE id = ?").get("legacy-growth") as MigrationCount).count,
      1,
    );

    const sexColumn = (sqlite.pragma("table_info('babies')") as TableColumn[]).find((column) => column.name === "sex");
    assert.ok(sexColumn);
    assert.equal(sexColumn.notnull, 1);
    assert.equal(sexColumn.dflt_value, "'unknown'");

    const insertBaby = sqlite.prepare(`INSERT INTO babies (
      id, name, birth_date, timezone, is_active, created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?)`);
    insertBaby.run("default-baby", "Default Baby", "2026-02-01", "Asia/Shanghai", 0, createdAt, createdAt);
    sqlite.prepare(`INSERT INTO babies (
      id, name, birth_date, sex, timezone, is_active, created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`)
      .run("female-baby", "Female Baby", "2026-03-01", "female", "Asia/Shanghai", 0, createdAt, createdAt);

    assert.equal((sqlite.prepare("SELECT sex FROM babies WHERE id = ?").get("default-baby") as { sex: string }).sex, "unknown");
    assert.equal((sqlite.prepare("SELECT sex FROM babies WHERE id = ?").get("female-baby") as { sex: string }).sex, "female");
    assert.equal((sqlite.prepare("SELECT count(*) AS count FROM __drizzle_migrations").get() as MigrationCount).count, migrations.length);
    assert.equal((sqlite.pragma("foreign_key_check") as unknown[]).length, 0);
    assert.equal(sqlite.pragma("integrity_check", { simple: true }), "ok");
  } finally {
    sqlite.close();
    rmSync(directory, { recursive: true, force: true });
  }
});
