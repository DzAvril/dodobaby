import { createHash, timingSafeEqual } from "node:crypto";
import { NextResponse } from "next/server";
import { dispatchFeedingReminders } from "@/lib/push-notifications";

export const dynamic = "force-dynamic";

function workerToken() {
  const secret = process.env.DODOBABY_SESSION_SECRET;
  if (!secret || secret.length < 32) return null;
  return createHash("sha256").update(`dodobaby-notification-worker:${secret}`).digest("base64url");
}

function authorized(request: Request) {
  const expected = workerToken();
  const actual = request.headers.get("x-dodobaby-worker-token");
  if (!expected || !actual) return false;
  const expectedBytes = Buffer.from(expected);
  const actualBytes = Buffer.from(actual);
  return expectedBytes.length === actualBytes.length && timingSafeEqual(expectedBytes, actualBytes);
}

export async function POST(request: Request) {
  if (!authorized(request)) return NextResponse.json({ error: "请求未授权" }, { status: 401 });
  try {
    return NextResponse.json(await dispatchFeedingReminders(), { headers: { "cache-control": "no-store" } });
  } catch (error) {
    console.error("Feeding reminder dispatch failed", error);
    return NextResponse.json({ error: "提醒调度失败" }, { status: 500 });
  }
}
