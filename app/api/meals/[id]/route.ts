import { NextResponse } from "next/server";
import { isAuthenticated, isSameOrigin } from "@/lib/auth";
import { parseDate } from "@/lib/dates";
import { deleteMeal, getCurrentBaby, getMeal, updateMeal } from "@/lib/meals";
import { mealSchema } from "@/lib/validation";

type Context = { params: Promise<{ id: string }> };

export async function GET(_request: Request, { params }: Context) {
  if (!(await isAuthenticated())) return NextResponse.json({ error: "请先登录" }, { status: 401 });
  const baby = await getCurrentBaby();
  if (!baby) return NextResponse.json({ error: "宝宝资料不存在" }, { status: 404 });
  const meal = await getMeal((await params).id, baby.id);
  return meal ? NextResponse.json({ meal }) : NextResponse.json({ error: "记录不存在" }, { status: 404 });
}

export async function PATCH(request: Request, { params }: Context) {
  if (!(await isAuthenticated())) return NextResponse.json({ error: "请先登录" }, { status: 401 });
  if (!isSameOrigin(request)) return NextResponse.json({ error: "请求来源无效" }, { status: 403 });
  const baby = await getCurrentBaby();
  if (!baby) return NextResponse.json({ error: "宝宝资料不存在" }, { status: 404 });
  const parsed = mealSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: parsed.error.issues[0]?.message }, { status: 400 });
  parseDate(parsed.data.mealDate);
  const meal = await updateMeal((await params).id, baby.id, parsed.data);
  return meal ? NextResponse.json({ meal }) : NextResponse.json({ error: "记录不存在" }, { status: 404 });
}

export async function DELETE(request: Request, { params }: Context) {
  if (!(await isAuthenticated())) return NextResponse.json({ error: "请先登录" }, { status: 401 });
  if (!isSameOrigin(request)) return NextResponse.json({ error: "请求来源无效" }, { status: 403 });
  const baby = await getCurrentBaby();
  if (!baby) return NextResponse.json({ error: "宝宝资料不存在" }, { status: 404 });
  const deleted = await deleteMeal((await params).id, baby.id);
  return deleted ? NextResponse.json({ ok: true }) : NextResponse.json({ error: "记录不存在" }, { status: 404 });
}
