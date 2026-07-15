import { NextResponse } from "next/server";
import { z } from "zod";
import { isBrowserSameOrigin, isSessionAuthenticated } from "@/lib/auth";
import { deletePushSubscription, savePushSubscription } from "@/lib/push-notifications";

export const dynamic = "force-dynamic";

const endpointSchema = z.string().url().max(4096).refine((value) => new URL(value).protocol === "https:", "通知订阅地址无效");
const subscriptionSchema = z.object({
  endpoint: endpointSchema,
  expirationTime: z.number().int().positive().nullable(),
  keys: z.object({
    p256dh: z.string().min(1).max(512),
    auth: z.string().min(1).max(512),
  }),
});
const deleteSchema = z.object({ endpoint: endpointSchema });

function json(body: unknown, status = 200) {
  return NextResponse.json(body, { status, headers: { "cache-control": "no-store" } });
}

async function rejectUnauthorized(request: Request) {
  if (!(await isSessionAuthenticated())) return json({ error: "请先登录" }, 401);
  if (!isBrowserSameOrigin(request)) return json({ error: "请求来源无效" }, 403);
  return null;
}

export async function POST(request: Request) {
  const rejected = await rejectUnauthorized(request);
  if (rejected) return rejected;
  const parsed = subscriptionSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return json({ error: parsed.error.issues[0]?.message ?? "通知订阅无效" }, 400);
  savePushSubscription(parsed.data);
  return json({ subscribed: true }, 201);
}

export async function DELETE(request: Request) {
  const rejected = await rejectUnauthorized(request);
  if (rejected) return rejected;
  const parsed = deleteSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return json({ error: parsed.error.issues[0]?.message ?? "通知订阅无效" }, 400);
  deletePushSubscription(parsed.data.endpoint);
  return json({ subscribed: false });
}
