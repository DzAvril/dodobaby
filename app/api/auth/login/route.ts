import { NextResponse } from "next/server";
import { createSession, isSameOrigin, verifyPassword } from "@/lib/auth";

type Attempt = { count: number; resetAt: number };
const attempts = new Map<string, Attempt>();

export async function POST(request: Request) {
  if (!isSameOrigin(request)) return NextResponse.json({ error: "请求来源无效" }, { status: 403 });

  const ip = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "local";
  const now = Date.now();
  const attempt = attempts.get(ip);
  if (attempt && attempt.resetAt > now && attempt.count >= 5) {
    return NextResponse.json({ error: "尝试次数过多，请稍后再试" }, { status: 429 });
  }

  const body = (await request.json().catch(() => null)) as { password?: unknown } | null;
  if (typeof body?.password !== "string") return NextResponse.json({ error: "请输入家庭密码" }, { status: 400 });

  try {
    if (!verifyPassword(body.password)) {
      const current = attempt && attempt.resetAt > now ? attempt : { count: 0, resetAt: now + 10 * 60_000 };
      attempts.set(ip, { ...current, count: current.count + 1 });
      return NextResponse.json({ error: "密码不正确" }, { status: 401 });
    }
    attempts.delete(ip);
    await createSession();
    return NextResponse.json({ ok: true });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "登录配置异常" }, { status: 503 });
  }
}
