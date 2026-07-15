import { createHash } from "node:crypto";
import path from "node:path";
import { fileURLToPath } from "node:url";

const DEFAULT_INTERVAL_MS = 60_000;

export function notificationWorkerToken(secret) {
  if (typeof secret !== "string" || secret.length < 32) throw new Error("DODOBABY_SESSION_SECRET must contain at least 32 characters");
  return createHash("sha256").update(`dodobaby-notification-worker:${secret}`).digest("base64url");
}

export async function dispatchReminderCheck({ port, secret, fetchImpl = fetch }) {
  const response = await fetchImpl(`http://127.0.0.1:${port}/api/notifications/dispatch`, {
    method: "POST",
    headers: { "x-dodobaby-worker-token": notificationWorkerToken(secret) },
  });
  if (!response.ok) throw new Error(`Notification dispatch returned ${response.status}`);
  return response.json();
}

async function startWorker() {
  const port = Number(process.env.PORT) || 3000;
  const secret = process.env.DODOBABY_SESSION_SECRET;
  const intervalMs = Math.max(5_000, Number(process.env.NOTIFICATION_WORKER_INTERVAL_MS) || DEFAULT_INTERVAL_MS);
  let stopped = false;
  let waitTimer = null;
  let finishWait = null;
  const wait = (duration) => new Promise((resolve) => {
    finishWait = resolve;
    waitTimer = setTimeout(() => {
      waitTimer = null;
      finishWait = null;
      resolve();
    }, duration);
  });
  const stop = () => {
    stopped = true;
    if (waitTimer) clearTimeout(waitTimer);
    waitTimer = null;
    finishWait?.();
    finishWait = null;
  };
  process.once("SIGTERM", stop);
  process.once("SIGINT", stop);
  notificationWorkerToken(secret);
  await wait(5_000);
  while (!stopped) {
    try {
      const result = await dispatchReminderCheck({ port, secret });
      if (result.sent) console.log(`Sent ${result.sent} feeding reminder notification(s)`);
    } catch (error) {
      console.error("Notification worker check failed", error);
    }
    if (!stopped) await wait(intervalMs);
  }
}

const isMain = process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1]);
if (isMain) startWorker().catch((error) => {
  console.error("Notification worker stopped", error);
  process.exitCode = 1;
});
