import assert from "node:assert/strict";
import test from "node:test";
import { jsonRequestWithTimeout } from "../lib/client-api";

test("超时请求会中止 fetch 并返回明确错误", async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = ((_url: string | URL | Request, init?: RequestInit) => new Promise<Response>((_resolve, reject) => {
    init?.signal?.addEventListener("abort", () => reject(new DOMException("Aborted", "AbortError")), { once: true });
  })) as typeof fetch;

  try {
    await assert.rejects(
      jsonRequestWithTimeout("/api/notifications/test", { method: "POST" }, 5, "推送服务响应超时，请稍后重试"),
      /推送服务响应超时/,
    );
  } finally {
    globalThis.fetch = originalFetch;
  }
});
