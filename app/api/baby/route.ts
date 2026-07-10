import { NextResponse } from "next/server";
import { isAuthenticated, isSameOrigin } from "@/lib/auth";
import { createBaby, getCurrentBaby, updateBaby } from "@/lib/meals";
import { babySchema } from "@/lib/validation";
import { parseDate } from "@/lib/dates";

export async function GET() {
  if (!(await isAuthenticated())) return NextResponse.json({ error: "请先登录" }, { status: 401 });
  return NextResponse.json({ baby: await getCurrentBaby() });
}

export async function POST(request: Request) {
  if (!(await isAuthenticated())) return NextResponse.json({ error: "请先登录" }, { status: 401 });
  if (!isSameOrigin(request)) return NextResponse.json({ error: "请求来源无效" }, { status: 403 });
  if (await getCurrentBaby()) return NextResponse.json({ error: "宝宝资料已存在" }, { status: 409 });
  const parsed = babySchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: parsed.error.issues[0]?.message }, { status: 400 });
  try {
    parseDate(parsed.data.birthDate);
    return NextResponse.json({ baby: await createBaby(parsed.data) }, { status: 201 });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "保存失败" }, { status: 400 });
  }
}

export async function PATCH(request: Request) {
  if (!(await isAuthenticated())) return NextResponse.json({ error: "请先登录" }, { status: 401 });
  if (!isSameOrigin(request)) return NextResponse.json({ error: "请求来源无效" }, { status: 403 });
  const baby = await getCurrentBaby();
  if (!baby) return NextResponse.json({ error: "请先创建宝宝资料" }, { status: 404 });
  const parsed = babySchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: parsed.error.issues[0]?.message }, { status: 400 });
  try {
    parseDate(parsed.data.birthDate);
    return NextResponse.json({ baby: await updateBaby(baby.id, parsed.data) });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "保存失败" }, { status: 400 });
  }
}
