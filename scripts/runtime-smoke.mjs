import { createHash, createHmac } from "node:crypto";
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

function shiftDate(date, days) {
  const shifted = new Date(`${date}T00:00:00Z`);
  shifted.setUTCDate(shifted.getUTCDate() + days);
  return shifted.toISOString().slice(0, 10);
}

function shiftLocalMinute(date, time, minutes) {
  const shifted = new Date(`${date}T${time}:00Z`);
  shifted.setUTCMinutes(shifted.getUTCMinutes() + minutes);
  return { date: shifted.toISOString().slice(0, 10), time: shifted.toISOString().slice(11, 16) };
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
const twoDaysAgo = shiftDate(date, -2);
const oneMinuteAgo = shiftLocalMinute(date, time, -1);
expectStatus(await request(`/api/feedings?date=${date}`, { headers: { cookie: "" } }), 401, "unauthenticated feedings");
expectStatus(await request("/api/growth", { headers: { cookie: "" } }), 401, "unauthenticated growth records");
expectStatus(await request("/api/growth/missing-record", {
  method: "PATCH",
  headers: { cookie: "", "content-type": "application/json" },
  body: JSON.stringify({ measuredDate: date, weightKg: 7.2 }),
}), 401, "unauthenticated growth update");
expectStatus(await request("/api/growth/missing-record", { method: "DELETE", headers: { cookie: "" } }), 401, "unauthenticated growth delete");
expectStatus(await request(`/api/diapers?date=${date}`, { headers: { cookie: "" } }), 401, "unauthenticated diapers");
expectStatus(await request(`/api/sleeps?date=${date}`, { headers: { cookie: "" } }), 401, "unauthenticated sleeps");
expectStatus(await request("/api/notifications", { headers: { cookie: "" } }), 401, "unauthenticated notification settings");
expectStatus(await request("/api/notifications/dispatch", { method: "POST", headers: { cookie: "" } }), 401, "unauthorized notification dispatch");
expectStatus(await request("/api/sleeps/missing-record", {
  method: "PATCH",
  headers: { cookie: "", "content-type": "application/json" },
  body: JSON.stringify({ startedDate: date, startedTime: time, endedDate: null, endedTime: null }),
}), 401, "unauthenticated sleep update");
expectStatus(await request("/api/sleeps/missing-record", { method: "DELETE", headers: { cookie: "" } }), 401, "unauthenticated sleep delete");
expectStatus(await request("/api/sleeps/missing-record/end", { method: "POST", headers: { cookie: "" } }), 401, "unauthenticated sleep end");
expectStatus(await request("/api/diapers/missing-record", { method: "DELETE", headers: { cookie: "" } }), 401, "unauthenticated diaper delete");
expectStatus(await request("/api/diapers/missing-record", {
  method: "PATCH",
  headers: { cookie: "", "content-type": "application/json" },
  body: JSON.stringify({ diaperDate: date, changedTime: time, diaperType: "wet" }),
}), 401, "unauthenticated diaper update");
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
expectStatus(await request("/api/growth", {
  method: "POST",
  headers: { "content-type": "application/json", origin: "https://evil.example" },
  body: JSON.stringify({ measuredDate: date, weightKg: 7.2 }),
}), 403, "cross-origin growth write");
expectStatus(await request("/api/growth/missing-record", {
  method: "PATCH",
  headers: { "content-type": "application/json", origin: "https://evil.example" },
  body: JSON.stringify({ measuredDate: date, weightKg: 7.2 }),
}), 403, "cross-origin growth update");
expectStatus(await request("/api/growth/missing-record", {
  method: "DELETE",
  headers: { origin: "https://evil.example" },
}), 403, "cross-origin growth delete");
expectStatus(await request("/api/diapers", {
  method: "POST",
  headers: { "content-type": "application/json", origin: "https://evil.example" },
  body: JSON.stringify({ diaperDate: date, changedTime: time, diaperType: "wet" }),
}), 403, "cross-origin diaper write");
expectStatus(await request("/api/diapers/missing-record", {
  method: "PATCH",
  headers: { "content-type": "application/json", origin: "https://evil.example" },
  body: JSON.stringify({ diaperDate: date, changedTime: time, diaperType: "wet" }),
}), 403, "cross-origin diaper update");
expectStatus(await request("/api/diapers/missing-record", {
  method: "DELETE",
  headers: { origin: "https://evil.example" },
}), 403, "cross-origin diaper delete");
expectStatus(await request("/api/sleeps", {
  method: "POST",
  headers: { "content-type": "application/json", origin: "https://evil.example" },
  body: JSON.stringify({ startedDate: date, startedTime: time, endedDate: null, endedTime: null }),
}), 403, "cross-origin sleep write");
expectStatus(await request("/api/sleeps/missing-record", {
  method: "PATCH",
  headers: { "content-type": "application/json", origin: "https://evil.example" },
  body: JSON.stringify({ startedDate: date, startedTime: time, endedDate: null, endedTime: null }),
}), 403, "cross-origin sleep update");
expectStatus(await request("/api/sleeps/missing-record", {
  method: "DELETE",
  headers: { origin: "https://evil.example" },
}), 403, "cross-origin sleep delete");
expectStatus(await request("/api/sleeps/missing-record/end", {
  method: "POST",
  headers: { origin: "https://evil.example" },
}), 403, "cross-origin sleep end");
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
expectStatus(await request("/api/notifications", {
  method: "PATCH",
  headers: { "content-type": "application/json", origin: "https://evil.example" },
  body: JSON.stringify({ feedingReminderEnabled: true, feedingReminderMinutes: 180 }),
}), 403, "cross-origin notification settings update");

expectStatus(await request("/api/baby", {
  method: "POST",
  headers: { "content-type": "application/json" },
  body: JSON.stringify({ name: "Smoke Baby", birthDate: "2025-01-01", sex: "female", timezone: "Asia/Shanghai" }),
}), 201, "create baby");

let notificationSettings = await request("/api/notifications");
expectStatus(notificationSettings, 200, "load notification settings");
assert.equal(notificationSettings.body.settings.feedingReminderEnabled, false);
assert.equal(notificationSettings.body.settings.feedingReminderMinutes, 180);
assert.equal(notificationSettings.body.settings.subscriptionCount, 0);
assert.match(notificationSettings.body.settings.vapidPublicKey, /^[A-Za-z0-9_-]+$/);
expectStatus(await request("/api/notifications", {
  method: "PATCH",
  headers: { "content-type": "application/json" },
  body: JSON.stringify({ feedingReminderEnabled: true, feedingReminderMinutes: 10 }),
}), 400, "reject too-short feeding reminder interval");
expectStatus(await request("/api/notifications", {
  method: "PATCH",
  headers: { "content-type": "application/json" },
  body: JSON.stringify({ feedingReminderEnabled: true, feedingReminderMinutes: 150 }),
}), 200, "update feeding reminder settings");
const smokePushEndpoint = "https://push.example.test/runtime-smoke";
expectStatus(await request("/api/notifications/subscriptions", {
  method: "POST",
  headers: { "content-type": "application/json" },
  body: JSON.stringify({ endpoint: smokePushEndpoint, expirationTime: null, keys: { p256dh: "runtime-smoke-public-key", auth: "runtime-smoke-auth" } }),
}), 201, "subscribe current notification device");
notificationSettings = await request("/api/notifications");
expectStatus(notificationSettings, 200, "reload notification settings");
assert.equal(notificationSettings.body.settings.feedingReminderEnabled, true);
assert.equal(notificationSettings.body.settings.feedingReminderMinutes, 150);
assert.equal(notificationSettings.body.settings.subscriptionCount, 1);
expectStatus(await request("/api/notifications/subscriptions", {
  method: "DELETE",
  headers: { "content-type": "application/json" },
  body: JSON.stringify({ endpoint: smokePushEndpoint }),
}), 200, "unsubscribe current notification device");
expectStatus(await request("/api/notifications", {
  method: "PATCH",
  headers: { "content-type": "application/json" },
  body: JSON.stringify({ feedingReminderEnabled: false, feedingReminderMinutes: 180 }),
}), 200, "reset feeding reminder settings");
const workerToken = createHash("sha256").update(`dodobaby-notification-worker:${sessionSecret}`).digest("base64url");
const dispatchResult = await request("/api/notifications/dispatch", {
  method: "POST",
  headers: { "x-dodobaby-worker-token": workerToken },
});
expectStatus(dispatchResult, 200, "dispatch disabled feeding reminders");
assert.deepEqual(dispatchResult.body, { sent: 0, skipped: "disabled" });

let growthRecords = await request("/api/growth");
expectStatus(growthRecords, 200, "load empty growth records");
assert.deepEqual(growthRecords.body.records, []);
expectStatus(await request("/api/growth", {
  method: "POST",
  headers: { "content-type": "application/json" },
  body: JSON.stringify({ measuredDate: "2024-12-31", weightKg: 3.2 }),
}), 400, "reject growth before birth");
expectStatus(await request("/api/growth", {
  method: "POST",
  headers: { "content-type": "application/json" },
  body: JSON.stringify({ measuredDate: tomorrow, weightKg: 7.2 }),
}), 400, "reject future growth date");

const earlierGrowth = await request("/api/growth", {
  method: "POST",
  headers: { "content-type": "application/json" },
  body: JSON.stringify({ measuredDate: yesterday, weightKg: 7.1, note: "早期生长记录" }),
});
expectStatus(earlierGrowth, 201, "create earlier growth record");
const growthBirthDateConflict = await request("/api/baby", {
  method: "PATCH",
  headers: { "content-type": "application/json" },
  body: JSON.stringify({ name: "Smoke Baby", birthDate: date, timezone: "Asia/Shanghai" }),
});
expectStatus(growthBirthDateConflict, 400, "protect earliest growth date");
assert.match(growthBirthDateConflict.body.error, /已有生长记录/);
expectStatus(await request("/api/growth", {
  method: "POST",
  headers: { "content-type": "application/json" },
  body: JSON.stringify({ measuredDate: yesterday, heightCm: 68 }),
}), 409, "reject duplicate growth date");

const currentGrowth = await request("/api/growth", {
  method: "POST",
  headers: { "content-type": "application/json" },
  body: JSON.stringify({ measuredDate: date, heightCm: 68, headCircumferenceCm: 43 }),
});
expectStatus(currentGrowth, 201, "create current growth record");
growthRecords = await request("/api/growth");
expectStatus(growthRecords, 200, "load growth records");
assert.deepEqual(growthRecords.body.records.map((record) => record.measuredDate), [yesterday, date]);

const updatedGrowth = await request(`/api/growth/${currentGrowth.body.record.id}`, {
  method: "PATCH",
  headers: { "content-type": "application/json" },
  body: JSON.stringify({ measuredDate: date, weightKg: 7.4, heightCm: 69, headCircumferenceCm: 43.5, note: "  更新后的生长记录  " }),
});
expectStatus(updatedGrowth, 200, "update growth record");
assert.equal(updatedGrowth.body.record.weightKg, 7.4);
assert.equal(updatedGrowth.body.record.heightCm, 69);
assert.equal(updatedGrowth.body.record.headCircumferenceCm, 43.5);
assert.equal(updatedGrowth.body.record.note, "更新后的生长记录");
growthRecords = await request("/api/growth");
assert.equal(growthRecords.body.records.find((record) => record.id === currentGrowth.body.record.id).weightKg, 7.4);

expectStatus(await request("/api/growth/missing-record", {
  method: "PATCH",
  headers: { "content-type": "application/json" },
  body: JSON.stringify({ measuredDate: date, weightKg: 7.2 }),
}), 404, "isolate missing growth update");
expectStatus(await request("/api/growth/missing-record", { method: "DELETE" }), 404, "isolate missing growth delete");
expectStatus(await request(`/api/growth/${currentGrowth.body.record.id}`, { method: "DELETE" }), 200, "delete current growth record");
expectStatus(await request(`/api/growth/${earlierGrowth.body.record.id}`, { method: "DELETE" }), 200, "delete earlier growth record");
expectStatus(await request(`/api/growth/${earlierGrowth.body.record.id}`, { method: "DELETE" }), 404, "delete missing growth record");
growthRecords = await request("/api/growth");
assert.equal(growthRecords.body.records.length, 0);

expectStatus(await request(`/api/sleeps?date=${tomorrow}`), 400, "reject future sleep query");
expectStatus(await request("/api/sleeps", {
  method: "POST",
  headers: { "content-type": "application/json" },
  body: JSON.stringify({ startedDate: tomorrow, startedTime: "08:00", endedDate: null, endedTime: null }),
}), 400, "reject future sleep date");
expectStatus(await request("/api/sleeps", {
  method: "POST",
  headers: { "content-type": "application/json" },
  body: JSON.stringify({ startedDate: yesterday, startedTime: "08:00", endedDate: yesterday, endedTime: null }),
}), 400, "reject incomplete sleep end");

const futureStart = shiftLocalMinute(date, time, 1);
expectStatus(await request("/api/sleeps", {
  method: "POST",
  headers: { "content-type": "application/json" },
  body: JSON.stringify({ startedDate: futureStart.date, startedTime: futureStart.time, endedDate: null, endedTime: null }),
}), 400, "reject future sleep start");
expectStatus(await request("/api/sleeps", {
  method: "POST",
  headers: { "content-type": "application/json" },
  body: JSON.stringify({ startedDate: yesterday, startedTime: "10:00", endedDate: yesterday, endedTime: "10:00" }),
}), 400, "reject zero sleep duration");
expectStatus(await request("/api/sleeps", {
  method: "POST",
  headers: { "content-type": "application/json" },
  body: JSON.stringify({ startedDate: yesterday, startedTime: "11:00", endedDate: yesterday, endedTime: "10:00" }),
}), 400, "reject reversed sleep interval");
expectStatus(await request("/api/sleeps", {
  method: "POST",
  headers: { "content-type": "application/json" },
  body: JSON.stringify({ startedDate: twoDaysAgo, startedTime: "00:00", endedDate: yesterday, endedTime: "00:01" }),
}), 400, "reject sleep longer than 24 hours");

const fullDaySleep = await request("/api/sleeps", {
  method: "POST",
  headers: { "content-type": "application/json" },
  body: JSON.stringify({ startedDate: twoDaysAgo, startedTime: "00:00", endedDate: yesterday, endedTime: "00:00", note: "正好二十四小时" }),
});
expectStatus(fullDaySleep, 201, "allow exactly 24-hour sleep");
assert.equal(fullDaySleep.body.record.durationMinutes, 1_440);
expectStatus(await request(`/api/sleeps/${fullDaySleep.body.record.id}`, { method: "DELETE" }), 200, "delete 24-hour sleep");

expectStatus(await request("/api/sleeps", {
  method: "POST",
  headers: { "content-type": "application/json" },
  body: JSON.stringify({ startedDate: twoDaysAgo, startedTime: "00:00", endedDate: null, endedTime: null, note: "模拟忘记结束" }),
}), 400, "reject creating stale active sleep");

const earlierSleep = await request("/api/sleeps", {
  method: "POST",
  headers: { "content-type": "application/json" },
  body: JSON.stringify({ startedDate: yesterday, startedTime: "08:00", endedDate: yesterday, endedTime: "09:00" }),
});
expectStatus(earlierSleep, 201, "create earlier sleep");
const sleepBirthDateConflict = await request("/api/baby", {
  method: "PATCH",
  headers: { "content-type": "application/json" },
  body: JSON.stringify({ name: "Smoke Baby", birthDate: date, timezone: "Asia/Shanghai" }),
});
expectStatus(sleepBirthDateConflict, 400, "protect earliest sleep date");
assert.match(sleepBirthDateConflict.body.error, /已有睡眠记录/);
expectStatus(await request(`/api/sleeps/${earlierSleep.body.record.id}`, { method: "DELETE" }), 200, "delete earlier sleep");

const crossMidnightSleep = await request("/api/sleeps", {
  method: "POST",
  headers: { "content-type": "application/json" },
  body: JSON.stringify({
    startedDate: twoDaysAgo,
    startedTime: "23:30",
    endedDate: yesterday,
    endedTime: "01:15",
    note: "  跨午夜睡眠  ",
  }),
});
expectStatus(crossMidnightSleep, 201, "create cross-midnight sleep");
assert.equal(crossMidnightSleep.body.record.durationMinutes, 105);
assert.equal(crossMidnightSleep.body.record.note, "跨午夜睡眠");
assert.equal(crossMidnightSleep.body.record.recordTimezone, "Asia/Shanghai");

let firstSleepDay = await request(`/api/sleeps?date=${twoDaysAgo}`);
expectStatus(firstSleepDay, 200, "load first cross-midnight day");
assert.equal(firstSleepDay.body.summary.sessionCount, 1);
assert.equal(firstSleepDay.body.summary.totalMinutes, 30);
assert.equal(firstSleepDay.body.records[0].dayMinutes, 30);
let secondSleepDay = await request(`/api/sleeps?date=${yesterday}`);
expectStatus(secondSleepDay, 200, "load second cross-midnight day");
assert.equal(secondSleepDay.body.summary.sessionCount, 1);
assert.equal(secondSleepDay.body.summary.totalMinutes, 75);
assert.equal(secondSleepDay.body.records[0].dayMinutes, 75);

const updatedCrossMidnightSleep = await request(`/api/sleeps/${crossMidnightSleep.body.record.id}`, {
  method: "PATCH",
  headers: { "content-type": "application/json" },
  body: JSON.stringify({
    startedDate: twoDaysAgo,
    startedTime: "23:30",
    endedDate: yesterday,
    endedTime: "01:15",
    note: "  已更新的跨午夜记录  ",
  }),
});
expectStatus(updatedCrossMidnightSleep, 200, "update completed sleep");
assert.equal(updatedCrossMidnightSleep.body.record.note, "已更新的跨午夜记录");
expectStatus(await request("/api/sleeps", {
  method: "POST",
  headers: { "content-type": "application/json" },
  body: JSON.stringify({ startedDate: yesterday, startedTime: "00:30", endedDate: yesterday, endedTime: "02:00" }),
}), 409, "reject overlapping sleep");
expectStatus(await request("/api/sleeps/missing-record", {
  method: "PATCH",
  headers: { "content-type": "application/json" },
  body: JSON.stringify({ startedDate: yesterday, startedTime: "03:00", endedDate: yesterday, endedTime: "04:00" }),
}), 404, "isolate missing sleep update");
expectStatus(await request("/api/sleeps/missing-record/end", { method: "POST" }), 404, "isolate missing sleep end");
expectStatus(await request("/api/sleeps/missing-record", { method: "DELETE" }), 404, "isolate missing sleep delete");

const activeSleep = await request("/api/sleeps", {
  method: "POST",
  headers: { "content-type": "application/json" },
  body: JSON.stringify({ startedDate: oneMinuteAgo.date, startedTime: oneMinuteAgo.time, endedDate: null, endedTime: null, note: "进行中的睡眠" }),
});
expectStatus(activeSleep, 201, "start active sleep");
assert.equal(activeSleep.body.record.endedAt, null);
expectStatus(await request("/api/sleeps", {
  method: "POST",
  headers: { "content-type": "application/json" },
  body: JSON.stringify({ startedDate: date, startedTime: time, endedDate: null, endedTime: null }),
}), 409, "reject duplicate active sleep");
const activeSleepDay = await request(`/api/sleeps?date=${date}`);
expectStatus(activeSleepDay, 200, "load active sleep");
assert.equal(activeSleepDay.body.active.id, activeSleep.body.record.id);

const concurrentPatchJson = JSON.stringify({
  startedDate: oneMinuteAgo.date,
  startedTime: oneMinuteAgo.time,
  endedDate: null,
  endedTime: null,
  note: "不应重新打开已结束记录",
});
const encoder = new TextEncoder();
const splitAt = Math.floor(concurrentPatchJson.length / 2);
let releasePatchBody;
let markPatchBodyStarted;
const patchBodyGate = new Promise((resolve) => { releasePatchBody = resolve; });
const patchBodyStarted = new Promise((resolve) => { markPatchBodyStarted = resolve; });
let patchChunk = 0;
const slowPatchBody = new ReadableStream({
  async pull(controller) {
    if (patchChunk === 0) {
      patchChunk += 1;
      controller.enqueue(encoder.encode(concurrentPatchJson.slice(0, splitAt)));
      markPatchBodyStarted();
      return;
    }
    if (patchChunk === 1) {
      patchChunk += 1;
      await patchBodyGate;
      controller.enqueue(encoder.encode(concurrentPatchJson.slice(splitAt)));
      controller.close();
    }
  },
});
const slowPatchPromise = fetch(`${baseUrl}/api/sleeps/${activeSleep.body.record.id}`, {
  method: "PATCH",
  headers: { cookie, origin, "content-type": "application/json" },
  body: slowPatchBody,
  duplex: "half",
}).then(async (response) => {
  const text = await response.text();
  let body = text;
  try { body = JSON.parse(text); } catch { /* response body remains text */ }
  return { response, body };
});
await patchBodyStarted;
await new Promise((resolve) => setTimeout(resolve, 100));
let endedSleep;
try {
  endedSleep = await request(`/api/sleeps/${activeSleep.body.record.id}/end`, { method: "POST" });
} finally {
  releasePatchBody();
}
expectStatus(endedSleep, 200, "end active sleep");
assert.notEqual(endedSleep.body.record.endedAt, null);
expectStatus(await slowPatchPromise, 409, "prevent stale active patch from reopening ended sleep");
expectStatus(await request(`/api/sleeps/${activeSleep.body.record.id}/end`, { method: "POST" }), 409, "reject duplicate sleep end");
expectStatus(await request(`/api/sleeps/${activeSleep.body.record.id}`, {
  method: "PATCH",
  headers: { "content-type": "application/json" },
  body: JSON.stringify({ startedDate: oneMinuteAgo.date, startedTime: oneMinuteAgo.time, endedDate: null, endedTime: null }),
}), 400, "reject changing completed sleep back to active");

expectStatus(await request(`/api/sleeps/${crossMidnightSleep.body.record.id}`, { method: "DELETE" }), 200, "delete cross-midnight sleep");
expectStatus(await request(`/api/sleeps/${activeSleep.body.record.id}`, { method: "DELETE" }), 200, "delete ended sleep");
expectStatus(await request(`/api/sleeps/${activeSleep.body.record.id}`, { method: "DELETE" }), 404, "delete missing sleep");
firstSleepDay = await request(`/api/sleeps?date=${twoDaysAgo}`);
secondSleepDay = await request(`/api/sleeps?date=${yesterday}`);
assert.equal(firstSleepDay.body.records.length, 0);
assert.equal(secondSleepDay.body.records.length, 0);

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

const earlierDiaper = await request("/api/diapers", {
  method: "POST",
  headers: { "content-type": "application/json" },
  body: JSON.stringify({ diaperDate: yesterday, changedTime: "08:05", diaperType: "wet" }),
});
expectStatus(earlierDiaper, 201, "create earlier diaper record");
const diaperBirthDateConflict = await request("/api/baby", {
  method: "PATCH",
  headers: { "content-type": "application/json" },
  body: JSON.stringify({ name: "Smoke Baby", birthDate: date, timezone: "Asia/Shanghai" }),
});
expectStatus(diaperBirthDateConflict, 400, "protect earliest diaper date");
assert.match(diaperBirthDateConflict.body.error, /已有尿布记录/);
expectStatus(await request(`/api/diapers/${earlierDiaper.body.record.id}`, { method: "DELETE" }), 200, "delete earlier diaper record");

expectStatus(await request("/api/diapers", {
  method: "POST",
  headers: { "content-type": "application/json" },
  body: JSON.stringify({ diaperDate: date, changedTime: time, diaperType: "unknown" }),
}), 400, "reject unknown diaper type");
expectStatus(await request("/api/diapers", {
  method: "POST",
  headers: { "content-type": "application/json" },
  body: JSON.stringify({ diaperDate: tomorrow, changedTime: "08:00", diaperType: "wet" }),
}), 400, "reject future diaper date");
if (time !== "23:59") {
  const [hour, minute] = time.split(":").map(Number);
  const futureMinute = `${String(hour + Math.floor((minute + 1) / 60)).padStart(2, "0")}:${String((minute + 1) % 60).padStart(2, "0")}`;
  expectStatus(await request("/api/diapers", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ diaperDate: date, changedTime: futureMinute, diaperType: "wet" }),
  }), 400, "reject future diaper time");
}

const wetDiaper = await request("/api/diapers", {
  method: "POST",
  headers: { "content-type": "application/json" },
  body: JSON.stringify({
    diaperDate: date,
    changedTime: time,
    diaperType: "wet",
    urineAmount: "large",
    stoolAmount: "small",
    stoolColor: "yellow",
    stoolConsistency: "soft",
    note: "  小便记录  ",
  }),
});
expectStatus(wetDiaper, 201, "create wet diaper");
assert.equal(wetDiaper.body.record.urineAmount, "large");
assert.equal(wetDiaper.body.record.stoolAmount, null);
assert.equal(wetDiaper.body.record.stoolColor, null);
assert.equal(wetDiaper.body.record.stoolConsistency, null);
assert.equal(wetDiaper.body.record.note, "小便记录");

const bothDiaper = await request("/api/diapers", {
  method: "POST",
  headers: { "content-type": "application/json" },
  body: JSON.stringify({
    diaperDate: date,
    changedTime: time,
    diaperType: "both",
    urineAmount: "medium",
    stoolAmount: "small",
    stoolColor: "yellow",
    stoolConsistency: "soft",
    skinObservation: "red",
    note: "两者记录",
  }),
});
expectStatus(bothDiaper, 201, "create mixed diaper");

let diaperDay = await request(`/api/diapers?date=${date}`);
expectStatus(diaperDay, 200, "load diaper day");
assert.equal(diaperDay.body.records.length, 2);
assert.deepEqual(diaperDay.body.summary, {
  totalCount: 2,
  wetCount: 2,
  dirtyCount: 1,
  skinObservedCount: 1,
  skinConcernCount: 1,
});

const changedToWet = await request(`/api/diapers/${bothDiaper.body.record.id}`, {
  method: "PATCH",
  headers: { "content-type": "application/json" },
  body: JSON.stringify({
    diaperDate: date,
    changedTime: time,
    diaperType: "wet",
    urineAmount: "small",
    stoolAmount: "large",
    stoolColor: "green",
    stoolConsistency: "watery",
    skinObservation: null,
  }),
});
expectStatus(changedToWet, 200, "change mixed diaper to wet");
assert.equal(changedToWet.body.record.stoolAmount, null);
assert.equal(changedToWet.body.record.stoolColor, null);
assert.equal(changedToWet.body.record.stoolConsistency, null);

expectStatus(await request(`/api/diapers/${bothDiaper.body.record.id}`, {
  method: "PATCH",
  headers: { "content-type": "application/json" },
  body: JSON.stringify({
    diaperDate: date,
    changedTime: time,
    diaperType: "both",
    urineAmount: "medium",
    stoolAmount: "small",
    stoolColor: "yellow",
    stoolConsistency: "soft",
    skinObservation: "clear",
    note: "留给浏览器测试",
  }),
}), 200, "restore mixed diaper");
expectStatus(await request("/api/diapers/missing-record", {
  method: "PATCH",
  headers: { "content-type": "application/json" },
  body: JSON.stringify({ diaperDate: date, changedTime: time, diaperType: "wet" }),
}), 404, "isolate missing diaper");
expectStatus(await request(`/api/diapers/${wetDiaper.body.record.id}`, { method: "DELETE" }), 200, "delete diaper");
expectStatus(await request(`/api/diapers/${wetDiaper.body.record.id}`, { method: "DELETE" }), 404, "delete missing diaper");
diaperDay = await request(`/api/diapers?date=${date}`);
assert.equal(diaperDay.body.records.length, 1);
assert.deepEqual(diaperDay.body.summary, { totalCount: 1, wetCount: 1, dirtyCount: 1, skinObservedCount: 1, skinConcernCount: 0 });

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

const pdfExport = await fetch(
  `${baseUrl}/api/exports/month?month=${date.slice(0, 7)}&format=pdf&scope=plan`,
  { headers: { cookie, origin } },
);
if (!pdfExport.ok) throw new Error(`PDF export returned ${pdfExport.status}: ${await pdfExport.text()}`);
assert.equal(pdfExport.status, 200);
assert.match(pdfExport.headers.get("content-type") ?? "", /^application\/pdf\b/);
const pdfBytes = Buffer.from(await pdfExport.arrayBuffer());
assert.equal(pdfBytes.subarray(0, 5).toString("ascii"), "%PDF-");
assert.ok(pdfBytes.length > 1_000, `PDF export is unexpectedly small: ${pdfBytes.length} bytes`);

console.log("Runtime smoke passed: auth, origin, growth, sleep, diaper, feeding and vaccination CRUD, timeline protection, summaries, and PDF export");
