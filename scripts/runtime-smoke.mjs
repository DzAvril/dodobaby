import { createHmac } from "node:crypto";
import assert from "node:assert/strict";

const baseUrl = process.argv[2] ?? "http://127.0.0.1:13000";
const sessionSecret = process.env.SMOKE_SESSION_SECRET;
if (!sessionSecret || sessionSecret.length < 32) throw new Error("SMOKE_SESSION_SECRET must contain at least 32 characters");

function currentMinuteInShanghai() {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Shanghai",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(new Date());
  const values = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return { date: `${values.year}-${values.month}-${values.day}`, time: `${values.hour}:${values.minute}` };
}

function sessionCookie() {
  const payload = Buffer.from(JSON.stringify({ exp: Math.floor(Date.now() / 1000) + 300, nonce: "runtime-smoke" }))
    .toString("base64url");
  const signature = createHmac("sha256", sessionSecret).update(payload).digest("base64url");
  return `dodobaby_session=${payload}.${signature}`;
}

const cookie = sessionCookie();
const origin = new URL(baseUrl).origin;

async function request(path, options = {}) {
  const response = await fetch(`${baseUrl}${path}`, {
    ...options,
    headers: {
      cookie,
      origin,
      ...options.headers,
    },
  });
  const text = await response.text();
  let body = null;
  if (text) {
    try { body = JSON.parse(text); } catch { body = text; }
  }
  return { response, body };
}

function expectStatus(result, status, label) {
  assert.equal(result.response.status, status, `${label}: ${JSON.stringify(result.body)}`);
}

const health = await fetch(`${baseUrl}/api/health`);
assert.equal(health.status, 200);

const { date, time } = currentMinuteInShanghai();
const previousDate = new Date(`${date}T00:00:00Z`);
previousDate.setUTCDate(previousDate.getUTCDate() - 1);
const yesterday = previousDate.toISOString().slice(0, 10);
expectStatus(await request(`/api/feedings?date=${date}`, { headers: { cookie: "" } }), 401, "unauthenticated feedings");
expectStatus(await request("/api/feedings", {
  method: "POST",
  headers: { "content-type": "application/json", origin: "https://evil.example" },
  body: JSON.stringify({ feedingDate: date, startedTime: time, formulaMl: 60 }),
}), 403, "cross-origin feeding write");

expectStatus(await request("/api/baby", {
  method: "POST",
  headers: { "content-type": "application/json" },
  body: JSON.stringify({ name: "Smoke Baby", birthDate: "2025-01-01", timezone: "Asia/Shanghai" }),
}), 201, "create baby");

expectStatus(await request("/api/feedings", {
  method: "POST",
  headers: { "content-type": "application/json" },
  body: JSON.stringify({ feedingDate: date, startedTime: time }),
}), 400, "reject empty feeding");

expectStatus(await request("/api/feedings", {
  method: "POST",
  headers: { "content-type": "application/json" },
  body: JSON.stringify({ feedingDate: yesterday, startedTime: "08:00", formulaMl: 30 }),
}), 201, "create earlier feeding");
const birthDateConflict = await request("/api/baby", {
  method: "PATCH",
  headers: { "content-type": "application/json" },
  body: JSON.stringify({ name: "Smoke Baby", birthDate: date, timezone: "Asia/Shanghai" }),
});
expectStatus(birthDateConflict, 400, "protect earliest feeding date");
assert.match(birthDateConflict.body.error, /已有喂养记录/);

const direct = await request("/api/feedings", {
  method: "POST",
  headers: { "content-type": "application/json" },
  body: JSON.stringify({ feedingDate: date, startedTime: time, leftDurationMinutes: 12, note: "亲喂" }),
});
expectStatus(direct, 201, "create direct feeding");

const mixed = await request("/api/feedings", {
  method: "POST",
  headers: { "content-type": "application/json" },
  body: JSON.stringify({ feedingDate: date, startedTime: time, expressedMilkMl: 60, formulaMl: 30, note: "混合瓶喂" }),
});
expectStatus(mixed, 201, "create mixed feeding");

let day = await request(`/api/feedings?date=${date}`);
expectStatus(day, 200, "load feeding day");
assert.equal(day.body.records.length, 2);
assert.deepEqual(day.body.summary, {
  sessionCount: 2,
  directMinutes: 12,
  expressedMilkMl: 60,
  formulaMl: 30,
  bottleMl: 90,
});

expectStatus(await request(`/api/feedings/${direct.body.record.id}`, {
  method: "PATCH",
  headers: { "content-type": "application/json" },
  body: JSON.stringify({ feedingDate: date, startedTime: time, leftDurationMinutes: 15, formulaMl: 20, note: "修改后" }),
}), 200, "update feeding");
expectStatus(await request("/api/feedings/missing-record", {
  method: "PATCH",
  headers: { "content-type": "application/json" },
  body: JSON.stringify({ feedingDate: date, startedTime: time, formulaMl: 20 }),
}), 404, "isolate missing feeding");

day = await request(`/api/feedings?date=${date}`);
expectStatus(day, 200, "reload feeding day");
assert.equal(day.body.summary.directMinutes, 15);
assert.equal(day.body.summary.bottleMl, 110);

expectStatus(await request(`/api/feedings/${direct.body.record.id}`, { method: "DELETE" }), 200, "delete feeding");
expectStatus(await request(`/api/feedings/${direct.body.record.id}`, { method: "DELETE" }), 404, "delete missing feeding");
day = await request(`/api/feedings?date=${date}`);
assert.equal(day.body.records.length, 1);
assert.equal(day.body.summary.sessionCount, 1);

console.log("Runtime smoke passed: auth, origin, feeding CRUD, mixed session, and summary");
