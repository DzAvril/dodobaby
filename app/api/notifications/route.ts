import { NextResponse } from "next/server";
import { z } from "zod";
import { isBrowserSameOrigin, isSessionAuthenticated } from "@/lib/auth";
import {
  getPushNotificationSettings,
  MAX_FEEDING_REMINDER_MINUTES,
  MIN_FEEDING_REMINDER_MINUTES,
  updatePushNotificationSettings,
} from "@/lib/push-notifications";

export const dynamic = "force-dynamic";

const settingsSchema = z.object({
  feedingReminderEnabled: z.boolean(),
  feedingReminderMinutes: z.number().int()
    .min(MIN_FEEDING_REMINDER_MINUTES)
    .max(MAX_FEEDING_REMINDER_MINUTES),
});

function json(body: unknown, status = 200) {
  return NextResponse.json(body, { status, headers: { "cache-control": "no-store" } });
}

async function rejectUnauthorized(request?: Request) {
  if (!(await isSessionAuthenticated())) return json({ error: "请先登录" }, 401);
  if (request && !isBrowserSameOrigin(request)) return json({ error: "请求来源无效" }, 403);
  return null;
}

export async function GET() {
  const rejected = await rejectUnauthorized();
  if (rejected) return rejected;
  return json({ settings: getPushNotificationSettings() });
}

export async function PATCH(request: Request) {
  const rejected = await rejectUnauthorized(request);
  if (rejected) return rejected;
  const parsed = settingsSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return json({ error: parsed.error.issues[0]?.message ?? "通知设置无效" }, 400);
  try {
    return json({ settings: updatePushNotificationSettings(parsed.data) });
  } catch (error) {
    return json({ error: error instanceof Error ? error.message : "通知设置更新失败" }, 400);
  }
}
