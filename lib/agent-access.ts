import "server-only";

import { createHash, randomBytes, timingSafeEqual } from "node:crypto";
import { inArray, sql } from "drizzle-orm";
import { getDb } from "@/db";
import { appSettings } from "@/db/schema";

const ENABLED_KEY = "agent_enabled";
const TOKEN_HASH_KEY = "agent_token_hash";
const TOKEN_UPDATED_AT_KEY = "agent_token_updated_at";
const SETTING_KEYS = [ENABLED_KEY, TOKEN_HASH_KEY, TOKEN_UPDATED_AT_KEY];

export type AgentAccessStatus = {
  enabled: boolean;
  configured: boolean;
  source: "database" | "environment" | null;
  updatedAt: string | null;
};

type AgentAccessConfig = AgentAccessStatus & { tokenHash: string | null };

function validTokenHash(value?: string) {
  return value && /^[a-f0-9]{64}$/i.test(value) ? value.toLowerCase() : null;
}

function loadAgentAccessConfig(): AgentAccessConfig {
  const rows = getDb()
    .select({ key: appSettings.key, value: appSettings.value })
    .from(appSettings)
    .where(inArray(appSettings.key, SETTING_KEYS))
    .all();
  const values = new Map(rows.map((row) => [row.key, row.value]));
  const hasDatabaseToken = values.has(TOKEN_HASH_KEY);
  const databaseHash = validTokenHash(values.get(TOKEN_HASH_KEY));
  const environmentHash = validTokenHash(process.env.DODOBABY_AGENT_TOKEN_SHA256);
  const tokenHash = hasDatabaseToken ? databaseHash : environmentHash;
  const source = tokenHash ? (hasDatabaseToken ? "database" : "environment") : null;
  const enabledSetting = values.get(ENABLED_KEY);

  return {
    enabled: enabledSetting === undefined ? Boolean(tokenHash) : enabledSetting === "true",
    configured: Boolean(tokenHash),
    source,
    updatedAt: source === "database" ? values.get(TOKEN_UPDATED_AT_KEY) ?? null : null,
    tokenHash,
  };
}

function writeSettings(settings: Array<{ key: string; value: string }>) {
  const updatedAt = new Date();
  getDb()
    .insert(appSettings)
    .values(settings.map((setting) => ({ ...setting, updatedAt })))
    .onConflictDoUpdate({
      target: appSettings.key,
      set: { value: sql`excluded.value`, updatedAt },
    })
    .run();
}

export function getAgentAccessStatus(): AgentAccessStatus {
  const config = loadAgentAccessConfig();
  return {
    enabled: config.enabled,
    configured: config.configured,
    source: config.source,
    updatedAt: config.updatedAt,
  };
}

export function verifyAgentToken(token?: string): boolean {
  const config = loadAgentAccessConfig();
  if (!config.enabled || !config.tokenHash || !token) return false;
  const actual = Buffer.from(createHash("sha256").update(token).digest("hex"), "hex");
  const expected = Buffer.from(config.tokenHash, "hex");
  return actual.length === expected.length && timingSafeEqual(actual, expected);
}

export function setAgentAccessEnabled(enabled: boolean): AgentAccessStatus {
  if (enabled && !loadAgentAccessConfig().configured) throw new Error("请先生成 Agent token");
  writeSettings([{ key: ENABLED_KEY, value: String(enabled) }]);
  return getAgentAccessStatus();
}

export function generateAgentToken() {
  const token = `dodobaby_${randomBytes(32).toString("base64url")}`;
  const tokenHash = createHash("sha256").update(token).digest("hex");
  const updatedAt = new Date().toISOString();
  writeSettings([
    { key: ENABLED_KEY, value: "true" },
    { key: TOKEN_HASH_KEY, value: tokenHash },
    { key: TOKEN_UPDATED_AT_KEY, value: updatedAt },
  ]);
  return { token, status: getAgentAccessStatus() };
}

export function revokeAgentToken(): AgentAccessStatus {
  writeSettings([
    { key: ENABLED_KEY, value: "false" },
    { key: TOKEN_HASH_KEY, value: "" },
    { key: TOKEN_UPDATED_AT_KEY, value: new Date().toISOString() },
  ]);
  return getAgentAccessStatus();
}
