import { NextResponse } from "next/server";
import { isAuthenticated, isSameOrigin } from "@/lib/auth";
import { deleteFoodCatalogItem, getFoodCatalogItem, updateFoodCatalogItem } from "@/lib/foods";
import { getCurrentBaby } from "@/lib/meals";
import { foodCatalogItemSchema } from "@/lib/validation";

type Context = { params: Promise<{ id: string }> };

export async function GET(_request: Request, context: Context) {
  if (!(await isAuthenticated())) return NextResponse.json({ error: "请先登录" }, { status: 401 });
  const baby = await getCurrentBaby();
  if (!baby) return NextResponse.json({ error: "宝宝资料不存在" }, { status: 404 });
  const { id } = await context.params;
  const food = await getFoodCatalogItem(id, baby.id);
  return food ? NextResponse.json({ food }) : NextResponse.json({ error: "辅食不存在" }, { status: 404 });
}

export async function PATCH(request: Request, context: Context) {
  if (!(await isAuthenticated())) return NextResponse.json({ error: "请先登录" }, { status: 401 });
  if (!isSameOrigin(request)) return NextResponse.json({ error: "请求来源无效" }, { status: 403 });
  const baby = await getCurrentBaby();
  if (!baby) return NextResponse.json({ error: "宝宝资料不存在" }, { status: 404 });
  const parsed = foodCatalogItemSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: parsed.error.issues[0]?.message }, { status: 400 });
  const { id } = await context.params;
  try {
    const food = await updateFoodCatalogItem(id, baby.id, parsed.data);
    return food ? NextResponse.json({ food }) : NextResponse.json({ error: "辅食不存在" }, { status: 404 });
  } catch (error) {
    if (error instanceof Error && error.message.includes("UNIQUE constraint failed")) {
      return NextResponse.json({ error: "这个辅食已经在辅食库中" }, { status: 409 });
    }
    return NextResponse.json({ error: error instanceof Error ? error.message : "保存失败" }, { status: 400 });
  }
}

export async function DELETE(request: Request, context: Context) {
  if (!(await isAuthenticated())) return NextResponse.json({ error: "请先登录" }, { status: 401 });
  if (!isSameOrigin(request)) return NextResponse.json({ error: "请求来源无效" }, { status: 403 });
  const baby = await getCurrentBaby();
  if (!baby) return NextResponse.json({ error: "宝宝资料不存在" }, { status: 404 });
  const { id } = await context.params;
  if (!(await deleteFoodCatalogItem(id, baby.id))) return NextResponse.json({ error: "辅食不存在" }, { status: 404 });
  return NextResponse.json({ ok: true });
}
