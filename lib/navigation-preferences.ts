export const MODULE_IDS = ["food", "feeding", "sleep", "diapers", "medications", "growth", "vaccines"] as const;

export type ModuleId = (typeof MODULE_IDS)[number];

export const DEFAULT_QUICK_MODULES: ModuleId[] = ["feeding", "sleep", "diapers"];

export function normalizeQuickModules(value: unknown): ModuleId[] {
  if (!Array.isArray(value)) return [...DEFAULT_QUICK_MODULES];
  const valid = value.filter((item): item is ModuleId => typeof item === "string" && MODULE_IDS.includes(item as ModuleId));
  const unique = [...new Set(valid)];
  for (const item of [...DEFAULT_QUICK_MODULES, ...MODULE_IDS]) {
    if (unique.length === 3) break;
    if (!unique.includes(item)) unique.push(item);
  }
  return unique.slice(0, 3);
}
