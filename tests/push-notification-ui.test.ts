import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

test("设置页提供喂奶提醒间隔、设备订阅和测试通知操作", () => {
  const source = readFileSync(new URL("../components/PushNotificationSettings.tsx", import.meta.url), "utf8");
  const settingsPage = readFileSync(new URL("../components/SettingsPageClient.tsx", import.meta.url), "utf8");
  assert.match(source, /喂奶提醒/);
  assert.match(source, /喂奶提醒间隔小时数/);
  assert.match(source, /开启当前设备通知/);
  assert.match(source, /发送测试通知/);
  assert.match(settingsPage, /PushNotificationSettings/);
});

test("Service Worker 显示推送并将点击导航到对应模块", () => {
  const worker = readFileSync(new URL("../public/sw.js", import.meta.url), "utf8");
  assert.match(worker, /addEventListener\("push"/);
  assert.match(worker, /showNotification/);
  assert.match(worker, /addEventListener\("notificationclick"/);
  assert.match(worker, /openWindow/);
});
