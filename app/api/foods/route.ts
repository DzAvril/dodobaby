import { NextResponse } from "next/server";
import { isAuthenticated, isSameOrigin } from "@/lib/auth";
import { createFoodCatalogItem, listFoodCatalogItems } from "@/lib/foods";
import { getCurrentBaby } from "@/lib/meals";
import { foodCatalogItemSchema } from "@/lib/validation";

export async function GET() {
  if (!(await isAuthenticated())) return NextResponse.json({ error: "请先登录" }, { status: 401 });
  const baby = await getCurrentBaby();
  return NextResponse.json({ foods: baby ? await listFoodCatalogItems(baby.id) : [] });
}

export async function POST(request: Request) {
  if (!(await isAuthenticated())) return NextResponse.json({ error: "请先登录" }, { status: 401 });
  if (!isSameOrigin(request)) return NextResponse.json({ error: "请求来源无效" }, { status: 403 });
  const baby = await getCurrentBaby();
  if (!baby) return NextResponse.json({ error: "请先创建宝宝资料" }, { status: 409 });
  const parsed = foodCatalogItemSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: parsed.error.issues[0]?.message }, { status: 400 });
  try {
    return NextResponse.json({ food: await createFoodCatalogItem(baby.id, parsed.data) }, { status: 201 });
  } catch (error) {
    if (error instanceof Error && error.message.includes("UNIQUE constraint failed")) {
      return NextResponse.json({ error: "这个辅食已经在辅食库中" }, { status: 409 });
    }
    return NextResponse.json({ error: error instanceof Error ? error.message : "添加失败" }, { status: 400 });
  }
}
