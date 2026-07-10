import { NextResponse } from "next/server";
import { destroySession, isAuthenticated, isSameOrigin } from "@/lib/auth";

export async function POST(request: Request) {
  if (!isSameOrigin(request)) return NextResponse.json({ error: "请求来源无效" }, { status: 403 });
  if (!(await isAuthenticated())) return NextResponse.json({ ok: true });
  await destroySession();
  return NextResponse.json({ ok: true });
}
