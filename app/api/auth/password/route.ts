import { NextResponse } from "next/server";
import { isAuthenticated, isSameOrigin, setPassword, verifyPassword } from "@/lib/auth";
import { passwordChangeSchema } from "@/lib/validation";

export async function POST(request: Request) {
  if (!(await isAuthenticated())) return NextResponse.json({ error: "请先登录" }, { status: 401 });
  if (!isSameOrigin(request)) return NextResponse.json({ error: "请求来源无效" }, { status: 403 });
  const parsed = passwordChangeSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: parsed.error.issues[0]?.message }, { status: 400 });
  if (!(await verifyPassword(parsed.data.currentPassword))) {
    return NextResponse.json({ error: "当前密码不正确" }, { status: 400 });
  }
  await setPassword(parsed.data.newPassword);
  return NextResponse.json({ ok: true });
}
