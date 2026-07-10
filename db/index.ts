import "server-only";

import fs from "node:fs";
import path from "node:path";
import Database from "better-sqlite3";
import { drizzle } from "drizzle-orm/better-sqlite3";
import { migrate } from "drizzle-orm/better-sqlite3/migrator";
import * as schema from "./schema";

type DatabaseState = {
  sqlite: Database.Database;
  db: ReturnType<typeof drizzle<typeof schema>>;
};

const globalForDb = globalThis as unknown as { dodobabyDb?: DatabaseState };

function openDatabase(): DatabaseState {
  const databasePath = process.env.DATABASE_PATH ?? path.join(process.cwd(), "data", "dodobaby.db");
  fs.mkdirSync(path.dirname(databasePath), { recursive: true });

  const sqlite = new Database(databasePath);
  sqlite.pragma("journal_mode = WAL");
  sqlite.pragma("foreign_keys = ON");
  sqlite.pragma("busy_timeout = 5000");

  const db = drizzle(sqlite, { schema });
  const migrationsFolder = path.join(process.cwd(), "drizzle");
  if (!fs.existsSync(migrationsFolder)) throw new Error(`Migration folder not found: ${migrationsFolder}`);
  migrate(db, { migrationsFolder });
  return { sqlite, db };
}

export function getDb() {
  globalForDb.dodobabyDb ??= openDatabase();
  return globalForDb.dodobabyDb.db;
}

export function checkDatabase() {
  globalForDb.dodobabyDb ??= openDatabase();
  globalForDb.dodobabyDb.sqlite.prepare("SELECT 1").get();
}
