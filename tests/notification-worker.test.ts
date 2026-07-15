import assert from "node:assert/strict";
import test from "node:test";
import {
  dispatchReminderCheck,
  notificationWorkerToken,
} from "../scripts/notification-worker.mjs";

test("通知 worker 使用服务端密钥生成固定内部 token", () => {
  const token = notificationWorkerToken("runtime-smoke-session-secret-1234567890");
  assert.match(token, /^[A-Za-z0-9_-]{43}$/);
  assert.equal(token, notificationWorkerToken("runtime-smoke-session-secret-1234567890"));
  assert.throws(() => notificationWorkerToken("short"), /at least 32/);
});

test("通知 worker 只调用本机受保护的调度接口", async () => {
  let captured;
  const result = await dispatchReminderCheck({
    port: 3010,
    secret: "runtime-smoke-session-secret-1234567890",
    fetchImpl: async (url, options) => {
      captured = { url, options };
      return new Response(JSON.stringify({ sent: 0, skipped: "disabled" }), { status: 200 });
    },
  });
  assert.deepEqual(result, { sent: 0, skipped: "disabled" });
  assert.equal(captured.url, "http://127.0.0.1:3010/api/notifications/dispatch");
  assert.match(captured.options.headers["x-dodobaby-worker-token"], /^[A-Za-z0-9_-]{43}$/);
});
