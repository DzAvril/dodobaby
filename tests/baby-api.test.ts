import assert from "node:assert/strict";
import { spawn, type ChildProcess } from "node:child_process";
import { createHash, createHmac } from "node:crypto";
import { mkdtempSync, rmSync } from "node:fs";
import { createServer } from "node:net";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import Database from "better-sqlite3";

const sessionSecret = "baby-api-test-session-secret-123456789";
const agentToken = "baby-api-test-agent-token-123456789";
const agentTokenHash = createHash("sha256").update(agentToken).digest("hex");

function delay(milliseconds: number) {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

async function freePort() {
  const server = createServer();
  await new Promise<void>((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", resolve);
  });
  const address = server.address();
  assert.ok(address && typeof address === "object");
  const port = address.port;
  await new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
  return port;
}

function sessionCookie() {
  const payload = Buffer.from(JSON.stringify({ exp: Math.floor(Date.now() / 1000) + 300, nonce: "baby-api-test" }))
    .toString("base64url");
  const signature = createHmac("sha256", sessionSecret).update(payload).digest("base64url");
  return `dodobaby_session=${payload}.${signature}`;
}

async function stopServer(child: ChildProcess) {
  if (child.exitCode != null || child.signalCode != null) return;
  child.kill("SIGTERM");
  for (let attempt = 0; attempt < 50 && child.exitCode == null && child.signalCode == null; attempt += 1) await delay(100);
  if (child.exitCode == null && child.signalCode == null) child.kill("SIGKILL");
}

test("宝宝 API 创建缺省 unknown、校验枚举并在 PATCH 省略时保留现有性别", { timeout: 60_000 }, async (context) => {
  const directory = mkdtempSync(path.join(tmpdir(), "dodobaby-baby-api-"));
  const databasePath = path.join(directory, "dodobaby.db");
  const port = await freePort();
  const baseUrl = `http://127.0.0.1:${port}`;
  const nextBin = path.join(process.cwd(), "node_modules", "next", "dist", "bin", "next");
  let mcpClient: Client | null = null;
  let remoteMcpClient: Client | null = null;
  const child = spawn(process.execPath, [nextBin, "dev", "--webpack", "--hostname", "127.0.0.1", "--port", String(port)], {
    cwd: process.cwd(),
    env: {
      ...process.env,
      NODE_ENV: "development",
      NEXT_TELEMETRY_DISABLED: "1",
      WATCHPACK_POLLING: "true",
      DATABASE_PATH: databasePath,
      DODOBABY_SESSION_SECRET: sessionSecret,
      DODOBABY_AGENT_TOKEN_SHA256: agentTokenHash,
      APP_URL: baseUrl,
    },
    stdio: ["ignore", "pipe", "pipe"],
  });
  let logs = "";
  const capture = (chunk: Buffer) => { logs = `${logs}${chunk.toString()}`.slice(-30_000); };
  child.stdout?.on("data", capture);
  child.stderr?.on("data", capture);
  context.after(async () => {
    await mcpClient?.close().catch(() => undefined);
    await remoteMcpClient?.close().catch(() => undefined);
    await stopServer(child);
    rmSync(directory, { recursive: true, force: true });
  });

  let ready = false;
  for (let attempt = 0; attempt < 200 && !ready; attempt += 1) {
    if (child.exitCode != null || child.signalCode != null) break;
    try {
      const response = await fetch(`${baseUrl}/api/baby`, { signal: AbortSignal.timeout(1_000) });
      ready = response.status === 401;
    } catch {
      await delay(100);
    }
  }
  assert.equal(ready, true, `Next.js test server did not become ready:\n${logs}`);

  const cookie = sessionCookie();
  async function request(route: string, init: RequestInit = {}) {
    const response = await fetch(`${baseUrl}${route}`, {
      ...init,
      headers: { cookie, origin: baseUrl, ...init.headers },
    });
    const body = await response.json().catch(() => null) as { error?: string; baby?: { sex: string } } | null;
    return { response, body };
  }
  async function agentRequest(route: string, init: RequestInit = {}) {
    const response = await fetch(`${baseUrl}${route}`, {
      ...init,
      headers: { authorization: `Bearer ${agentToken}`, "content-type": "application/json", origin: "https://agent.example", ...init.headers },
    });
    const body = await response.json().catch(() => null) as Record<string, unknown> | null;
    return { response, body };
  }
  async function agentAccessRequest(method = "GET", origin = baseUrl) {
    const response = await fetch(`${baseUrl}/api/agent-access`, {
      method,
      headers: { cookie, origin, ...(method === "PATCH" ? { "content-type": "application/json" } : {}) },
      body: method === "PATCH" ? JSON.stringify({ enabled: true }) : undefined,
    });
    const body = await response.json().catch(() => null) as {
      error?: string;
      token?: string;
      status?: { enabled: boolean; configured: boolean; source: string | null; updatedAt: string | null };
    } | null;
    return { response, body };
  }
  const baby = { name: "API Baby", birthDate: "2025-01-01", timezone: "Asia/Shanghai" };

  assert.equal((await request("/api/baby", { headers: { cookie: "" } })).response.status, 401);
  assert.equal((await request("/api/baby", {
    method: "POST",
    headers: { "content-type": "application/json", origin: "https://evil.example" },
    body: JSON.stringify(baby),
  })).response.status, 403);
  assert.equal((await request("/api/baby", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ ...baby, sex: "boy" }),
  })).response.status, 400);

  const created = await request("/api/baby", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(baby),
  });
  assert.equal(created.response.status, 201, JSON.stringify(created.body));
  assert.equal(created.body?.baby?.sex, "unknown");
  assert.equal((await request("/api/baby")).body?.baby?.sex, "unknown");

  const agentRead = await fetch(`${baseUrl}/api/baby`, { headers: { authorization: `Bearer ${agentToken}` } });
  assert.equal(agentRead.status, 200, await agentRead.text());

  const invalidAgentRead = await fetch(`${baseUrl}/api/baby`, { headers: { authorization: "Bearer wrong-token" } });
  assert.equal(invalidAgentRead.status, 401);

  const agentPatch = await fetch(`${baseUrl}/api/baby`, {
    method: "PATCH",
    headers: {
      authorization: `Bearer ${agentToken}`,
      "content-type": "application/json",
      origin: "https://evil.example",
    },
    body: JSON.stringify({ ...baby, sex: "male" }),
  });
  assert.equal(agentPatch.status, 200, await agentPatch.text());
  assert.equal((await request("/api/baby")).body?.baby?.sex, "male");

  const createdFood = await agentRequest("/api/foods", {
    method: "POST",
    body: JSON.stringify({ name: "苹果泥", defaultUnit: "g" }),
  });
  assert.equal(createdFood.response.status, 201, JSON.stringify(createdFood.body));
  const foodId = (createdFood.body?.food as { id?: string } | undefined)?.id;
  assert.ok(foodId);
  assert.equal((await agentRequest(`/api/foods/${foodId}`)).response.status, 200);
  const updatedFood = await agentRequest(`/api/foods/${foodId}`, {
    method: "PATCH",
    body: JSON.stringify({ name: "苹果泥", defaultUnit: "勺" }),
  });
  assert.equal(updatedFood.response.status, 200, JSON.stringify(updatedFood.body));
  assert.equal((updatedFood.body?.food as { defaultUnit?: string } | undefined)?.defaultUnit, "勺");
  assert.equal((await agentRequest(`/api/foods/${foodId}`, { method: "DELETE" })).response.status, 200);

  const medicationPayload = { medicationName: "维生素 D3", doseAmount: 1, doseUnit: "滴", takenDate: "2025-01-01", takenTime: "09:00" };
  const createdMedication = await agentRequest("/api/medications", {
    method: "POST",
    body: JSON.stringify(medicationPayload),
  });
  assert.equal(createdMedication.response.status, 201, JSON.stringify(createdMedication.body));
  const medicationId = (createdMedication.body?.record as { id?: string } | undefined)?.id;
  assert.ok(medicationId);
  assert.equal((await agentRequest(`/api/medications/${medicationId}`)).response.status, 200);
  const updatedMedication = await agentRequest(`/api/medications/${medicationId}`, {
    method: "PATCH",
    body: JSON.stringify({ ...medicationPayload, doseAmount: 2, takenTime: "09:05" }),
  });
  assert.equal(updatedMedication.response.status, 200, JSON.stringify(updatedMedication.body));
  assert.equal((updatedMedication.body?.record as { doseAmount?: number } | undefined)?.doseAmount, 2);
  assert.equal((await agentRequest(`/api/medications/${medicationId}`, { method: "DELETE" })).response.status, 200);

  const mcpTransport = new StdioClientTransport({
    command: path.join(process.cwd(), "node_modules", ".bin", "tsx"),
    args: [path.join(process.cwd(), "scripts", "dodobaby-mcp.ts")],
    env: { ...process.env, DODOBABY_APP_URL: baseUrl, DODOBABY_AGENT_TOKEN: agentToken },
  });
  mcpClient = new Client({ name: "dodobaby-api-test", version: "0.0.0" });
  await mcpClient.connect(mcpTransport);
  const tools = await mcpClient.listTools();
  assert.ok(tools.tools.some((tool) => tool.name === "dodobaby_create_record"));

  const unauthorizedMcp = await fetch(`${baseUrl}/mcp`, {
    method: "POST",
    headers: { "content-type": "application/json", accept: "application/json, text/event-stream" },
    body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "initialize", params: { protocolVersion: "2025-03-26", capabilities: {}, clientInfo: { name: "unauthorized-test", version: "0.0.0" } } }),
  });
  assert.equal(unauthorizedMcp.status, 401);
  assert.equal(unauthorizedMcp.headers.get("www-authenticate"), 'Bearer realm="dodobaby-mcp"');
  assert.equal((await fetch(`${baseUrl}/mcp`, { headers: { authorization: `Bearer ${agentToken}` } })).status, 405);

  remoteMcpClient = new Client({ name: "dodobaby-remote-api-test", version: "0.0.0" });
  await remoteMcpClient.connect(new StreamableHTTPClientTransport(new URL(`${baseUrl}/mcp`), {
    requestInit: { headers: { authorization: `Bearer ${agentToken}` } },
  }));
  const remoteTools = await remoteMcpClient.listTools();
  assert.deepEqual(remoteTools.tools.map((tool) => tool.name), tools.tools.map((tool) => tool.name));
  const remoteAuth = await remoteMcpClient.callTool({ name: "dodobaby_auth_status", arguments: {} });
  const remoteAuthContent = remoteAuth.content as Array<{ type: string; text?: string }>;
  assert.equal(JSON.parse(remoteAuthContent[0]?.text ?? "null").ok, true);

  async function callMcp(name: string, args: Record<string, unknown> = {}) {
    assert.ok(mcpClient);
    const result = await mcpClient.callTool({ name, arguments: args });
    const content = result.content as Array<{ type: string; text?: string }>;
    assert.equal(content[0]?.type, "text");
    return JSON.parse(content[0]?.text ?? "null") as Record<string, unknown>;
  }
  function recordFrom(body: Record<string, unknown>) {
    return (body.record ?? body.meal ?? body.food ?? body.plan) as { id?: string } | undefined;
  }

  const mcpContracts = await callMcp("dodobaby_record_contracts");
  assert.deepEqual(mcpContracts.recordTypes, [
    "meals",
    "food_catalog",
    "feedings",
    "diapers",
    "sleeps",
    "growth",
    "vaccines",
    "medication_plans",
    "medication_records",
  ]);

  const mcpCases = [
    {
      recordType: "food_catalog",
      create: { name: "香蕉泥", defaultUnit: "g" },
      update: { name: "香蕉泥", defaultUnit: "勺" },
      listQuery: {},
    },
    {
      recordType: "meals",
      create: {
        mealDate: "2025-01-02",
        mealType: "lunch",
        actualStatus: "completed",
        items: [{ name: "香蕉泥", amount: 10, unit: "g", isFirstTry: true }],
        reactionTags: ["normal"],
      },
      update: {
        mealDate: "2025-01-02",
        mealType: "lunch",
        actualStatus: "completed",
        actualNote: "MCP updated",
        items: [{ name: "香蕉泥", amount: 12, unit: "g", isFirstTry: true }],
        reactionTags: ["liked"],
      },
      listQuery: { month: "2025-01" },
    },
    {
      recordType: "feedings",
      create: { feedingDate: "2025-01-02", startedTime: "08:00", formulaMl: 60 },
      update: { feedingDate: "2025-01-02", startedTime: "08:00", formulaMl: 70 },
      listQuery: { date: "2025-01-02" },
    },
    {
      recordType: "diapers",
      create: { diaperDate: "2025-01-02", changedTime: "09:00", diaperType: "wet", urineAmount: "medium" },
      update: { diaperDate: "2025-01-02", changedTime: "09:00", diaperType: "wet", urineAmount: "large" },
      listQuery: { date: "2025-01-02" },
    },
    {
      recordType: "sleeps",
      create: { startedDate: "2025-01-02", startedTime: "10:00", endedDate: "2025-01-02", endedTime: "11:00" },
      update: { startedDate: "2025-01-02", startedTime: "10:00", endedDate: "2025-01-02", endedTime: "11:00", note: "MCP updated" },
      listQuery: { date: "2025-01-02" },
    },
    {
      recordType: "growth",
      create: { measuredDate: "2025-01-02", weightKg: 3.2 },
      update: { measuredDate: "2025-01-02", weightKg: 3.3 },
      listQuery: {},
    },
    {
      recordType: "vaccines",
      create: { vaccineName: "乙肝", doseNumber: 1, category: "immunization_program", status: "completed", administeredDate: "2025-01-02" },
      update: { vaccineName: "乙肝", doseNumber: 1, category: "immunization_program", status: "completed", administeredDate: "2025-01-02", note: "MCP updated" },
      listQuery: {},
    },
    {
      recordType: "medication_plans",
      create: { medicationName: "维生素 D3", doseAmount: 1, doseUnit: "滴", intervalDays: 1, scheduledTimes: ["08:00"], startDate: "2025-01-02" },
      update: { medicationName: "维生素 D3", doseAmount: 1, doseUnit: "滴", intervalDays: 1, scheduledTimes: ["08:00"], startDate: "2025-01-02", note: "MCP updated" },
      listQuery: {},
    },
    {
      recordType: "medication_records",
      create: { medicationName: "维生素 D3", doseAmount: 1, doseUnit: "滴", takenDate: "2025-01-02", takenTime: "08:10" },
      update: { medicationName: "维生素 D3", doseAmount: 2, doseUnit: "滴", takenDate: "2025-01-02", takenTime: "08:20" },
      listQuery: { date: "2025-01-02" },
    },
  ];

  for (const item of mcpCases) {
    const createdRecord = recordFrom(await callMcp("dodobaby_create_record", { recordType: item.recordType, payload: item.create }));
    assert.ok(createdRecord?.id, `${item.recordType} create should return id`);
    assert.ok(recordFrom(await callMcp("dodobaby_get_record", { recordType: item.recordType, id: createdRecord.id })));
    assert.ok(recordFrom(await callMcp("dodobaby_update_record", { recordType: item.recordType, id: createdRecord.id, payload: item.update })));
    await callMcp("dodobaby_list_records", { recordType: item.recordType, query: item.listQuery });
    assert.deepEqual(await callMcp("dodobaby_delete_record", { recordType: item.recordType, id: createdRecord.id }), { ok: true });
  }

  const male = await request("/api/baby", {
    method: "PATCH",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ ...baby, sex: "male" }),
  });
  assert.equal(male.response.status, 200, JSON.stringify(male.body));
  assert.equal(male.body?.baby?.sex, "male");

  const rejected = await request("/api/baby", {
    method: "PATCH",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ ...baby, sex: "Male" }),
  });
  assert.equal(rejected.response.status, 400);
  assert.equal((await request("/api/baby")).body?.baby?.sex, "male");

  const female = await request("/api/baby", {
    method: "PATCH",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ ...baby, sex: "female" }),
  });
  assert.equal(female.response.status, 200, JSON.stringify(female.body));
  assert.equal(female.body?.baby?.sex, "female");

  const legacyPatch = await request("/api/baby", {
    method: "PATCH",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ ...baby, name: "Legacy Client Update" }),
  });
  assert.equal(legacyPatch.response.status, 200, JSON.stringify(legacyPatch.body));
  assert.equal(legacyPatch.body?.baby?.sex, "female");

  const legacyAgentStatus = await agentAccessRequest();
  assert.equal(legacyAgentStatus.response.status, 200, JSON.stringify(legacyAgentStatus.body));
  assert.equal(legacyAgentStatus.response.headers.get("cache-control"), "no-store");
  assert.deepEqual(legacyAgentStatus.body?.status, {
    enabled: true,
    configured: true,
    source: "environment",
    updatedAt: null,
  });
  assert.equal("token" in (legacyAgentStatus.body ?? {}), false);

  const bearerManagement = await fetch(`${baseUrl}/api/agent-access`, {
    headers: { authorization: `Bearer ${agentToken}` },
  });
  assert.equal(bearerManagement.status, 401);
  assert.equal((await agentAccessRequest("POST", "https://evil.example")).response.status, 403);

  const disabled = await fetch(`${baseUrl}/api/agent-access`, {
    method: "PATCH",
    headers: { cookie, origin: baseUrl, "content-type": "application/json" },
    body: JSON.stringify({ enabled: false }),
  });
  assert.equal(disabled.status, 200, await disabled.text());
  assert.equal((await fetch(`${baseUrl}/api/baby`, { headers: { authorization: `Bearer ${agentToken}` } })).status, 401);

  const reEnabled = await agentAccessRequest("PATCH");
  assert.equal(reEnabled.response.status, 200, JSON.stringify(reEnabled.body));
  assert.equal((await fetch(`${baseUrl}/api/baby`, { headers: { authorization: `Bearer ${agentToken}` } })).status, 200);

  const generated = await agentAccessRequest("POST");
  assert.equal(generated.response.status, 200, JSON.stringify(generated.body));
  assert.match(generated.body?.token ?? "", /^dodobaby_[A-Za-z0-9_-]{43}$/);
  assert.equal(generated.body?.status?.enabled, true);
  assert.equal(generated.body?.status?.source, "database");
  assert.ok(generated.body?.status?.updatedAt);
  const generatedToken = generated.body?.token ?? "";
  const persistedStatus = await agentAccessRequest();
  assert.equal(persistedStatus.response.status, 200, JSON.stringify(persistedStatus.body));
  assert.equal("token" in (persistedStatus.body ?? {}), false);
  assert.equal(JSON.stringify(persistedStatus.body).includes(generatedToken), false);

  const sqlite = new Database(databasePath, { readonly: true });
  const agentSettings = Object.fromEntries((sqlite.prepare("SELECT key, value FROM app_settings WHERE key LIKE 'agent_%'").all() as Array<{ key: string; value: string }>).map((row) => [row.key, row.value]));
  sqlite.close();
  assert.equal(agentSettings.agent_enabled, "true");
  assert.equal(agentSettings.agent_token_hash, createHash("sha256").update(generatedToken).digest("hex"));
  assert.ok(agentSettings.agent_token_updated_at);
  assert.equal(Object.values(agentSettings).includes(generatedToken), false);

  assert.equal((await fetch(`${baseUrl}/api/baby`, { headers: { authorization: `Bearer ${agentToken}` } })).status, 401);
  assert.equal((await fetch(`${baseUrl}/api/baby`, { headers: { authorization: `Bearer ${generatedToken}` } })).status, 200);

  const databaseDisabled = await fetch(`${baseUrl}/api/agent-access`, {
    method: "PATCH",
    headers: { cookie, origin: baseUrl, "content-type": "application/json" },
    body: JSON.stringify({ enabled: false }),
  });
  assert.equal(databaseDisabled.status, 200, await databaseDisabled.text());
  assert.equal((await fetch(`${baseUrl}/api/baby`, { headers: { authorization: `Bearer ${generatedToken}` } })).status, 401);
  assert.equal((await agentAccessRequest("PATCH")).response.status, 200);
  assert.equal((await fetch(`${baseUrl}/api/baby`, { headers: { authorization: `Bearer ${generatedToken}` } })).status, 200);

  const revoked = await agentAccessRequest("DELETE");
  assert.equal(revoked.response.status, 200, JSON.stringify(revoked.body));
  assert.deepEqual(revoked.body?.status, { enabled: false, configured: false, source: null, updatedAt: null });
  assert.equal((await fetch(`${baseUrl}/api/baby`, { headers: { authorization: `Bearer ${generatedToken}` } })).status, 401);
  assert.equal((await fetch(`${baseUrl}/api/baby`, { headers: { authorization: `Bearer ${agentToken}` } })).status, 401);
  assert.equal((await agentAccessRequest("PATCH")).response.status, 400);
});
