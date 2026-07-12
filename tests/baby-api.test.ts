import assert from "node:assert/strict";
import { spawn, type ChildProcess } from "node:child_process";
import { createHmac } from "node:crypto";
import { mkdtempSync, rmSync } from "node:fs";
import { createServer } from "node:net";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";

const sessionSecret = "baby-api-test-session-secret-123456789";

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
  const child = spawn(process.execPath, [nextBin, "dev", "--webpack", "--hostname", "127.0.0.1", "--port", String(port)], {
    cwd: process.cwd(),
    env: {
      ...process.env,
      NODE_ENV: "development",
      NEXT_TELEMETRY_DISABLED: "1",
      WATCHPACK_POLLING: "true",
      DATABASE_PATH: databasePath,
      DODOBABY_SESSION_SECRET: sessionSecret,
      APP_URL: baseUrl,
    },
    stdio: ["ignore", "pipe", "pipe"],
  });
  let logs = "";
  const capture = (chunk: Buffer) => { logs = `${logs}${chunk.toString()}`.slice(-30_000); };
  child.stdout?.on("data", capture);
  child.stderr?.on("data", capture);
  context.after(async () => {
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
});
