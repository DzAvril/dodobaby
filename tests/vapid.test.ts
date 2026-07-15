import assert from "node:assert/strict";
import test from "node:test";
import { resolveVapidSubject } from "../lib/vapid";

test("VAPID subject 优先使用有效的显式联系地址", () => {
  assert.equal(resolveVapidSubject({
    configuredSubject: "mailto:notifications@qizhidodo.top",
    appUrl: "https://ignored.example.com",
  }), "mailto:notifications@qizhidodo.top");
});

test("VAPID subject 默认采用公开 APP_URL 的 origin", () => {
  assert.equal(resolveVapidSubject({ appUrl: "https://qizhidodo.top:4410/settings" }), "https://qizhidodo.top:4410");
});

test("VAPID subject 拒绝 Apple Web Push 不接受的本地地址", () => {
  assert.throws(
    () => resolveVapidSubject({ configuredSubject: "mailto:notifications@dodobaby.local", appUrl: "https://qizhidodo.top:4410" }),
    /DODOBABY_VAPID_SUBJECT/,
  );
  assert.throws(() => resolveVapidSubject({ appUrl: "http://localhost:3000" }), /公开 HTTPS/);
  assert.throws(() => resolveVapidSubject({ appUrl: "https://127.0.0.1:3000" }), /公开 HTTPS/);
});
