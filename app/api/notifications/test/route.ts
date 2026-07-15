import { NextResponse } from "next/server";
import { z } from "zod";
import { isBrowserSameOrigin, isSessionAuthenticated } from "@/lib/auth";
import { sendTestPush } from "@/lib/push-notifications";

export const dynamic = "force-dynamic";

const bodySchema = z.object({
  endpoint: z.string().url().max(4096).refine((value) => new URL(value).protocol === "https:", "通知订阅地址无效"),
});

function json(body: unknown, status = 200) {
  return NextResponse.json(body, { status, headers: { "cache-control": "no-store" } });
}

export async function POST(request: Request) {
  if (!(await isSessionAuthenticated())) return json({ error: "请先登录" }, 401);
  if (!isBrowserSameOrigin(request)) return json({ error: "请求来源无效" }, 403);
  const parsed = bodySchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return json({ error: parsed.error.issues[0]?.message ?? "通知订阅无效" }, 400);
  try {
    await sendTestPush(parsed.data.endpoint);
    return json({ sent: true });
  } catch (error) {
    return json({ error: error instanceof Error ? error.message : "测试通知发送失败" }, 502);
  }
}
