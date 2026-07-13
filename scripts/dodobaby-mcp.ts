import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { readFileSync } from "node:fs";
import { z } from "zod";

const recordTypes = [
  "meals",
  "food_catalog",
  "feedings",
  "diapers",
  "sleeps",
  "growth",
  "vaccines",
  "medication_plans",
  "medication_records",
] as const;

type RecordType = (typeof recordTypes)[number];
type RecordConfig = {
  label: string;
  listPath: string;
  itemPath: (id: string) => string;
  requiredListQuery: string[];
  collectionKey: string;
  payload: Record<string, string>;
};

const recordConfigs: Record<RecordType, RecordConfig> = {
  meals: {
    label: "辅食餐次记录",
    listPath: "/api/meals",
    itemPath: (id) => `/api/meals/${encodeURIComponent(id)}`,
    requiredListQuery: ["month"],
    collectionKey: "meals",
    payload: {
      mealDate: "YYYY-MM-DD",
      mealType: "breakfast | morning_snack | lunch | afternoon_snack | dinner | custom",
      customMealType: "string | null; required when mealType is custom",
      plannedTime: "HH:mm | empty string | null",
      planNote: "string | null",
      actualStatus: "planned | completed | partial | skipped",
      actualTime: "HH:mm | empty string | null",
      actualNote: "string | null",
      items: "array of { name, amount?, unit?, preparation?, isFirstTry }",
      reactionTags: "array of normal | liked | disliked | rash | vomit | diarrhea | constipation | other",
    },
  },
  food_catalog: {
    label: "辅食库条目",
    listPath: "/api/foods",
    itemPath: (id) => `/api/foods/${encodeURIComponent(id)}`,
    requiredListQuery: [],
    collectionKey: "foods",
    payload: {
      name: "string",
      defaultUnit: "string | null",
    },
  },
  feedings: {
    label: "喂养记录",
    listPath: "/api/feedings",
    itemPath: (id) => `/api/feedings/${encodeURIComponent(id)}`,
    requiredListQuery: ["date"],
    collectionKey: "records",
    payload: {
      feedingDate: "YYYY-MM-DD",
      startedTime: "HH:mm",
      leftDurationMinutes: "number | null",
      rightDurationMinutes: "number | null",
      expressedMilkMl: "number | null",
      formulaMl: "number | null",
      note: "string | null",
    },
  },
  diapers: {
    label: "尿布记录",
    listPath: "/api/diapers",
    itemPath: (id) => `/api/diapers/${encodeURIComponent(id)}`,
    requiredListQuery: ["date"],
    collectionKey: "records",
    payload: {
      diaperDate: "YYYY-MM-DD",
      changedTime: "HH:mm",
      diaperType: "wet | dirty | both",
      urineAmount: "small | medium | large | null",
      stoolAmount: "small | medium | large | null",
      stoolColor: "yellow | green | brown | black | red | white | other | null",
      stoolConsistency: "watery | loose | soft | formed | hard | other | null",
      skinObservation: "clear | red | broken | null",
      photoDataUrl: "data image url | null",
      note: "string | null",
    },
  },
  sleeps: {
    label: "睡眠记录",
    listPath: "/api/sleeps",
    itemPath: (id) => `/api/sleeps/${encodeURIComponent(id)}`,
    requiredListQuery: ["date"],
    collectionKey: "records",
    payload: {
      startedDate: "YYYY-MM-DD",
      startedTime: "HH:mm",
      endedDate: "YYYY-MM-DD | null",
      endedTime: "HH:mm | null",
      note: "string | null",
    },
  },
  growth: {
    label: "生长记录",
    listPath: "/api/growth",
    itemPath: (id) => `/api/growth/${encodeURIComponent(id)}`,
    requiredListQuery: [],
    collectionKey: "records",
    payload: {
      measuredDate: "YYYY-MM-DD",
      weightKg: "number | null",
      heightCm: "number | null",
      headCircumferenceCm: "number | null",
      note: "string | null",
    },
  },
  vaccines: {
    label: "疫苗记录",
    listPath: "/api/vaccines",
    itemPath: (id) => `/api/vaccines/${encodeURIComponent(id)}`,
    requiredListQuery: [],
    collectionKey: "records",
    payload: {
      vaccineName: "string",
      doseNumber: "integer",
      category: "immunization_program | non_immunization_program | unknown",
      status: "planned | completed",
      plannedDate: "YYYY-MM-DD | null",
      plannedTime: "HH:mm | null",
      administeredDate: "YYYY-MM-DD | null",
      manufacturer: "string | null",
      batchNumber: "string | null",
      administrationSite: "string | null",
      vaccinationUnit: "string | null",
      note: "string | null",
    },
  },
  medication_plans: {
    label: "用药计划",
    listPath: "/api/medications/plans",
    itemPath: (id) => `/api/medications/plans/${encodeURIComponent(id)}`,
    requiredListQuery: [],
    collectionKey: "plans",
    payload: {
      medicationName: "string",
      doseAmount: "number",
      doseUnit: "string",
      intervalDays: "integer 1-30",
      scheduledTimes: "array of HH:mm",
      startDate: "YYYY-MM-DD",
      endDate: "YYYY-MM-DD | null",
      note: "string | null",
    },
  },
  medication_records: {
    label: "实际用药记录",
    listPath: "/api/medications",
    itemPath: (id) => `/api/medications/${encodeURIComponent(id)}`,
    requiredListQuery: ["date"],
    collectionKey: "records",
    payload: {
      planId: "uuid | null",
      scheduledTime: "HH:mm | null; required when planId is set",
      medicationName: "string | null; required when planId is null",
      doseAmount: "number | null; required when planId is null",
      doseUnit: "string | null; required when planId is null",
      takenDate: "YYYY-MM-DD",
      takenTime: "HH:mm",
      note: "string | null",
    },
  },
};

const RecordTypeSchema = z.enum(recordTypes);
const JsonObjectSchema = z.record(z.string(), z.unknown());
const QuerySchema = z.record(z.string(), z.union([z.string(), z.number(), z.boolean()]));

function appBaseUrl() {
  const raw = process.env.DODOBABY_APP_URL || process.env.APP_URL || "http://127.0.0.1:3000";
  const url = new URL(raw);
  return `${url.origin}${url.pathname.replace(/\/$/, "")}`;
}

function agentToken() {
  const token = process.env.DODOBABY_AGENT_TOKEN
    ?? (process.env.DODOBABY_AGENT_TOKEN_FILE ? readFileSync(process.env.DODOBABY_AGENT_TOKEN_FILE, "utf8").trim() : undefined);
  if (!token) {
    throw new Error("DODOBABY_AGENT_TOKEN or DODOBABY_AGENT_TOKEN_FILE is required. Generate one with `npm run agent:token` and set DODOBABY_AGENT_TOKEN_SHA256 in the app.");
  }
  return token;
}

function toolResult(data: unknown) {
  const structuredContent = data && typeof data === "object" && !Array.isArray(data)
    ? data as Record<string, unknown>
    : { result: data };
  return {
    content: [{ type: "text" as const, text: JSON.stringify(data, null, 2) }],
    structuredContent,
  };
}

function errorMessage(error: unknown) {
  return error instanceof Error ? error.message : String(error);
}

function withQuery(path: string, query: Record<string, string | number | boolean> | undefined, required: string[]) {
  const params = new URLSearchParams();
  for (const key of required) {
    const value = query?.[key];
    if (value === undefined || value === "") throw new Error(`recordType requires query.${key}`);
    params.set(key, String(value));
  }
  return params.size ? `${path}?${params}` : path;
}

async function apiFetch(path: string, init: { method?: string; body?: unknown } = {}) {
  const baseUrl = appBaseUrl();
  const response = await fetch(new URL(path, baseUrl), {
    method: init.method ?? "GET",
    headers: {
      authorization: `Bearer ${agentToken()}`,
      origin: new URL(baseUrl).origin,
      ...(init.body === undefined ? {} : { "content-type": "application/json" }),
    },
    body: init.body === undefined ? undefined : JSON.stringify(init.body),
    signal: AbortSignal.timeout(Number(process.env.DODOBABY_MCP_TIMEOUT_MS ?? 15_000)),
  });
  const text = await response.text();
  const body = text ? JSON.parse(text) : null;
  if (!response.ok) {
    const message = body && typeof body === "object" && "error" in body ? String(body.error) : text;
    throw new Error(`${init.method ?? "GET"} ${path} failed with HTTP ${response.status}: ${message}`);
  }
  return body;
}

const server = new McpServer({
  name: "dodobaby",
  version: "0.1.0",
});

server.registerTool(
  "dodobaby_auth_status",
  {
    title: "Check DodoBaby authentication",
    description: "Checks that the configured app URL and agent token can access the current baby profile.",
    inputSchema: {},
    annotations: { readOnlyHint: true },
  },
  async () => {
    try {
      const body = await apiFetch("/api/baby");
      return toolResult({ ok: true, appUrl: appBaseUrl(), ...body });
    } catch (error) {
      return toolResult({ ok: false, appUrl: appBaseUrl(), error: errorMessage(error) });
    }
  },
);

server.registerTool(
  "dodobaby_record_contracts",
  {
    title: "List DodoBaby record contracts",
    description: "Returns supported record types, required list query fields, response collection keys, and payload contracts.",
    inputSchema: {},
    annotations: { readOnlyHint: true },
  },
  async () => toolResult({ recordTypes, records: recordConfigs }),
);

server.registerTool(
  "dodobaby_get_baby",
  {
    title: "Get current baby profile",
    description: "Reads the current baby profile.",
    inputSchema: {},
    annotations: { readOnlyHint: true },
  },
  async () => toolResult(await apiFetch("/api/baby")),
);

server.registerTool(
  "dodobaby_save_baby",
  {
    title: "Create or update baby profile",
    description: "Creates the baby profile when none exists; otherwise updates the current profile.",
    inputSchema: {
      payload: JsonObjectSchema.describe("Baby profile payload: { name, birthDate, sex?, timezone }"),
    },
  },
  async ({ payload }) => {
    const existing = await apiFetch("/api/baby");
    const method = existing?.baby ? "PATCH" : "POST";
    return toolResult(await apiFetch("/api/baby", { method, body: payload }));
  },
);

server.registerTool(
  "dodobaby_list_records",
  {
    title: "List records",
    description: "Lists records of a supported type. Some types require query.date or query.month.",
    inputSchema: {
      recordType: RecordTypeSchema,
      query: QuerySchema.optional(),
    },
    annotations: { readOnlyHint: true },
  },
  async ({ recordType, query }) => {
    const config = recordConfigs[recordType];
    return toolResult(await apiFetch(withQuery(config.listPath, query, config.requiredListQuery)));
  },
);

server.registerTool(
  "dodobaby_get_record",
  {
    title: "Get record by id",
    description: "Reads a single record by id for any supported record type.",
    inputSchema: {
      recordType: RecordTypeSchema,
      id: z.string().min(1),
    },
    annotations: { readOnlyHint: true },
  },
  async ({ recordType, id }) => toolResult(await apiFetch(recordConfigs[recordType].itemPath(id))),
);

server.registerTool(
  "dodobaby_create_record",
  {
    title: "Create record",
    description: "Creates one record. Use dodobaby_record_contracts first when payload fields are unclear.",
    inputSchema: {
      recordType: RecordTypeSchema,
      payload: JsonObjectSchema,
    },
  },
  async ({ recordType, payload }) => toolResult(await apiFetch(recordConfigs[recordType].listPath, { method: "POST", body: payload })),
);

server.registerTool(
  "dodobaby_update_record",
  {
    title: "Update record",
    description: "Replaces one record using the same payload contract as create for that record type.",
    inputSchema: {
      recordType: RecordTypeSchema,
      id: z.string().min(1),
      payload: JsonObjectSchema,
    },
  },
  async ({ recordType, id, payload }) => toolResult(await apiFetch(recordConfigs[recordType].itemPath(id), { method: "PATCH", body: payload })),
);

server.registerTool(
  "dodobaby_delete_record",
  {
    title: "Delete record",
    description: "Deletes one record by id.",
    inputSchema: {
      recordType: RecordTypeSchema,
      id: z.string().min(1),
    },
  },
  async ({ recordType, id }) => toolResult(await apiFetch(recordConfigs[recordType].itemPath(id), { method: "DELETE" })),
);

server.registerTool(
  "dodobaby_end_sleep_record",
  {
    title: "End active sleep record",
    description: "Ends an active sleep record at the server's current time.",
    inputSchema: {
      id: z.string().min(1),
    },
  },
  async ({ id }) => toolResult(await apiFetch(`/api/sleeps/${encodeURIComponent(id)}/end`, { method: "POST" })),
);

const transport = new StdioServerTransport();
await server.connect(transport);
