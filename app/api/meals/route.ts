import { NextResponse } from "next/server";
import { isAuthenticated, isSameOrigin } from "@/lib/auth";
import { monthBounds, parseDate } from "@/lib/dates";
import { createMeal, getCurrentBaby, listMealsByMonth } from "@/lib/meals";
import { mealSchema } from "@/lib/validation";

export async function GET(request: Request) {
  if (!(await isAuthenticated())) return NextResponse.json({ error: "请先登录" }, { status: 401 });
  const baby = await getCurrentBaby();
  if (!baby) return NextResponse.json({ meals: [] });
  const month = new URL(request.url).searchParams.get("month") ?? "";
  try {
    monthBounds(month);
    return NextResponse.json({ meals: await listMealsByMonth(baby.id, month) });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "月份无效" }, { status: 400 });
  }
}

export async function POST(request: Request) {
  if (!(await isAuthenticated())) return NextResponse.json({ error: "请先登录" }, { status: 401 });
  if (!isSameOrigin(request)) return NextResponse.json({ error: "请求来源无效" }, { status: 403 });
  const baby = await getCurrentBaby();
  if (!baby) return NextResponse.json({ error: "请先创建宝宝资料" }, { status: 409 });
  const parsed = mealSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: parsed.error.issues[0]?.message }, { status: 400 });
  try {
    parseDate(parsed.data.mealDate);
    return NextResponse.json({ meal: await createMeal(baby.id, parsed.data) }, { status: 201 });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "保存失败" }, { status: 400 });
  }
}
