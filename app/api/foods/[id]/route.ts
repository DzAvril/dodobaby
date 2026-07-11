import { NextResponse } from "next/server";
import { isAuthenticated, isSameOrigin } from "@/lib/auth";
import { deleteFoodCatalogItem } from "@/lib/foods";
import { getCurrentBaby } from "@/lib/meals";

export async function DELETE(request: Request, context: { params: Promise<{ id: string }> }) {
  if (!(await isAuthenticated())) return NextResponse.json({ error: "请先登录" }, { status: 401 });
  if (!isSameOrigin(request)) return NextResponse.json({ error: "请求来源无效" }, { status: 403 });
  const baby = await getCurrentBaby();
  if (!baby) return NextResponse.json({ error: "宝宝资料不存在" }, { status: 404 });
  const { id } = await context.params;
  if (!(await deleteFoodCatalogItem(id, baby.id))) return NextResponse.json({ error: "辅食不存在" }, { status: 404 });
  return NextResponse.json({ ok: true });
}
