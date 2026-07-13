import "server-only";

import { eq } from "drizzle-orm";
import { getDb } from "@/db";
import { appSettings } from "@/db/schema";
import { DEFAULT_QUICK_MODULES, normalizeQuickModules, type ModuleId } from "@/lib/navigation-preferences";

const QUICK_MODULES_KEY = "quick_modules";

export async function getQuickModules(): Promise<ModuleId[]> {
  const [setting] = await getDb().select().from(appSettings).where(eq(appSettings.key, QUICK_MODULES_KEY)).limit(1);
  if (!setting) return [...DEFAULT_QUICK_MODULES];
  try {
    return normalizeQuickModules(JSON.parse(setting.value));
  } catch {
    return [...DEFAULT_QUICK_MODULES];
  }
}

export async function setQuickModules(modules: ModuleId[]): Promise<ModuleId[]> {
  const normalized = normalizeQuickModules(modules);
  const now = new Date();
  await getDb()
    .insert(appSettings)
    .values({ key: QUICK_MODULES_KEY, value: JSON.stringify(normalized), updatedAt: now })
    .onConflictDoUpdate({ target: appSettings.key, set: { value: JSON.stringify(normalized), updatedAt: now } });
  return normalized;
}
