import { NextResponse } from "next/server";
import { isAuthenticated, isSameOrigin } from "@/lib/auth";
import { getQuickModules, setQuickModules } from "@/lib/navigation";
import { quickModulesSchema } from "@/lib/validation";

export async function GET() {
  if (!(await isAuthenticated())) return NextResponse.json({ error: "请先登录" }, { status: 401 });
  return NextResponse.json({ quickModules: await getQuickModules() });
}

export async function PATCH(request: Request) {
  if (!(await isAuthenticated())) return NextResponse.json({ error: "请先登录" }, { status: 401 });
  if (!isSameOrigin(request)) return NextResponse.json({ error: "请求来源无效" }, { status: 403 });
  const body = (await request.json().catch(() => null)) as { quickModules?: unknown } | null;
  const parsed = quickModulesSchema.safeParse(body?.quickModules);
  if (!parsed.success) return NextResponse.json({ error: parsed.error.issues[0]?.message }, { status: 400 });
  return NextResponse.json({ quickModules: await setQuickModules(parsed.data) });
}
