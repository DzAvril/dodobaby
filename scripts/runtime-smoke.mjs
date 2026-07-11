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
const nextDate = new Date(`${date}T00:00:00Z`);
nextDate.setUTCDate(nextDate.getUTCDate() + 1);
const tomorrow = nextDate.toISOString().slice(0, 10);
expectStatus(await request(`/api/feedings?date=${date}`, { headers: { cookie: "" } }), 401, "unauthenticated feedings");
expectStatus(await request("/api/vaccines", { headers: { cookie: "" } }), 401, "unauthenticated vaccinations");
expectStatus(await request("/api/vaccines/missing-record", { method: "DELETE", headers: { cookie: "" } }), 401, "unauthenticated vaccination delete");
expectStatus(await request("/api/vaccines/missing-record", {
  method: "PATCH",
  headers: { cookie: "", "content-type": "application/json" },
  body: JSON.stringify({ vaccineName: "未登录", doseNumber: 1, category: "unknown", status: "planned", plannedDate: tomorrow }),
}), 401, "unauthenticated vaccination update");
expectStatus(await request("/api/feedings", {
  method: "POST",
  headers: { "content-type": "application/json", origin: "https://evil.example" },
  body: JSON.stringify({ feedingDate: date, startedTime: time, formulaMl: 60 }),
}), 403, "cross-origin feeding write");
expectStatus(await request("/api/vaccines", {
  method: "POST",
  headers: { "content-type": "application/json", origin: "https://evil.example" },
  body: JSON.stringify({ vaccineName: "乙肝疫苗", doseNumber: 1, category: "immunization_program", status: "planned", plannedDate: tomorrow }),
}), 403, "cross-origin vaccination write");
expectStatus(await request("/api/vaccines/missing-record", {
  method: "PATCH",
  headers: { "content-type": "application/json", origin: "https://evil.example" },
  body: JSON.stringify({ vaccineName: "跨域", doseNumber: 1, category: "unknown", status: "planned", plannedDate: tomorrow }),
}), 403, "cross-origin vaccination update");
expectStatus(await request("/api/vaccines/missing-record", {
  method: "DELETE",
  headers: { origin: "https://evil.example" },
}), 403, "cross-origin vaccination delete");

expectStatus(await request("/api/baby", {
  method: "POST",
  headers: { "content-type": "application/json" },
  body: JSON.stringify({ name: "Smoke Baby", birthDate: "2025-01-01", timezone: "Asia/Shanghai" }),
}), 201, "create baby");

expectStatus(await request("/api/vaccines", {
  method: "POST",
  headers: { "content-type": "application/json" },
  body: JSON.stringify({ vaccineName: "乙肝疫苗", doseNumber: 1, category: "immunization_program", status: "planned" }),
}), 400, "reject vaccination plan without date");
expectStatus(await request("/api/vaccines", {
  method: "POST",
  headers: { "content-type": "application/json" },
  body: JSON.stringify({ vaccineName: "卡介苗", doseNumber: 1, category: "immunization_program", status: "completed", administeredDate: tomorrow }),
}), 400, "reject future administered date");

const earlierVaccination = await request("/api/vaccines", {
  method: "POST",
  headers: { "content-type": "application/json" },
  body: JSON.stringify({ vaccineName: "早期计划", doseNumber: 1, category: "unknown", status: "planned", plannedDate: yesterday }),
});
expectStatus(earlierVaccination, 201, "create earlier vaccination plan");
const vaccinationBirthDateConflict = await request("/api/baby", {
  method: "PATCH",
  headers: { "content-type": "application/json" },
  body: JSON.stringify({ name: "Smoke Baby", birthDate: date, timezone: "Asia/Shanghai" }),
});
expectStatus(vaccinationBirthDateConflict, 400, "protect earliest vaccination date");
assert.match(vaccinationBirthDateConflict.body.error, /已有疫苗记录/);
expectStatus(await request(`/api/vaccines/${earlierVaccination.body.record.id}`, { method: "DELETE" }), 200, "delete earlier vaccination plan");

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

const plannedVaccination = await request("/api/vaccines", {
  method: "POST",
  headers: { "content-type": "application/json" },
  body: JSON.stringify({
    vaccineName: "乙肝疫苗",
    doseNumber: 2,
    category: "immunization_program",
    status: "planned",
    plannedDate: tomorrow,
    plannedTime: "09:15",
    vaccinationUnit: "测试接种门诊",
    note: "按家庭已有安排记录",
  }),
});
expectStatus(plannedVaccination, 201, "create vaccination plan");

const completedVaccination = await request("/api/vaccines", {
  method: "POST",
  headers: { "content-type": "application/json" },
  body: JSON.stringify({
    vaccineName: "卡介苗",
    doseNumber: 1,
    category: "immunization_program",
    status: "completed",
    administeredDate: date,
    manufacturer: "测试企业",
    batchNumber: "BATCH-1",
    administrationSite: "左上臂",
    vaccinationUnit: "测试接种门诊",
    note: "应保留的计划备注",
  }),
});
expectStatus(completedVaccination, 201, "create completed vaccination");

let vaccinations = await request("/api/vaccines");
expectStatus(vaccinations, 200, "load vaccinations");
assert.equal(vaccinations.body.records.length, 2);
assert.deepEqual(vaccinations.body.records.map((record) => record.status), ["planned", "completed"]);

const revertedPlan = await request(`/api/vaccines/${completedVaccination.body.record.id}`, {
  method: "PATCH",
  headers: { "content-type": "application/json" },
  body: JSON.stringify({
    vaccineName: "卡介苗",
    doseNumber: 1,
    category: "immunization_program",
    status: "planned",
    plannedDate: tomorrow,
    administeredDate: null,
    manufacturer: "不应保留的测试企业",
    batchNumber: "HIDDEN-BATCH",
    administrationSite: "左上臂",
    vaccinationUnit: "测试接种门诊",
    note: "应保留的计划备注",
  }),
});
expectStatus(revertedPlan, 200, "revert completed vaccination to plan");
assert.equal(revertedPlan.body.record.manufacturer, null);
assert.equal(revertedPlan.body.record.batchNumber, null);
assert.equal(revertedPlan.body.record.administrationSite, null);
assert.equal(revertedPlan.body.record.vaccinationUnit, "测试接种门诊");
assert.equal(revertedPlan.body.record.note, "应保留的计划备注");

expectStatus(await request(`/api/vaccines/${plannedVaccination.body.record.id}`, {
  method: "PATCH",
  headers: { "content-type": "application/json" },
  body: JSON.stringify({
    vaccineName: "乙肝疫苗",
    doseNumber: 2,
    category: "immunization_program",
    status: "completed",
    plannedDate: tomorrow,
    plannedTime: "09:15",
    administeredDate: date,
    manufacturer: "更新后的测试企业",
  }),
}), 200, "mark vaccination completed");
expectStatus(await request("/api/vaccines/missing-record", {
  method: "PATCH",
  headers: { "content-type": "application/json" },
  body: JSON.stringify({ vaccineName: "不存在", doseNumber: 1, category: "unknown", status: "planned", plannedDate: tomorrow }),
}), 404, "isolate missing vaccination");

expectStatus(await request(`/api/vaccines/${plannedVaccination.body.record.id}`, { method: "DELETE" }), 200, "delete updated vaccination");
expectStatus(await request(`/api/vaccines/${completedVaccination.body.record.id}`, { method: "DELETE" }), 200, "delete reverted vaccination plan");
expectStatus(await request(`/api/vaccines/${completedVaccination.body.record.id}`, { method: "DELETE" }), 404, "delete missing vaccination");
vaccinations = await request("/api/vaccines");
assert.equal(vaccinations.body.records.length, 0);

console.log("Runtime smoke passed: auth, origin, feeding and vaccination CRUD, timeline protection, and summaries");
