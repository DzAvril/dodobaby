import { NextResponse } from "next/server";
import { isAuthenticated, isSameOrigin } from "@/lib/auth";
import { deleteGrowthRecord, updateGrowthRecord } from "@/lib/growth";
import { validateMeasurementDate } from "@/lib/growth-validation";
import { getCurrentBaby } from "@/lib/meals";
import { growthRecordSchema } from "@/lib/validation";

type Context = { params: Promise<{ id: string }> };

export async function PATCH(request: Request, { params }: Context) {
  if (!(await isAuthenticated())) return NextResponse.json({ error: "请先登录" }, { status: 401 });
  if (!isSameOrigin(request)) return NextResponse.json({ error: "请求来源无效" }, { status: 403 });
  const baby = await getCurrentBaby();
  if (!baby) return NextResponse.json({ error: "宝宝资料不存在" }, { status: 404 });
  const parsed = growthRecordSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: parsed.error.issues[0]?.message }, { status: 400 });
  try {
    validateMeasurementDate(parsed.data.measuredDate, baby.birthDate, baby.timezone);
    const record = await updateGrowthRecord((await params).id, baby.id, parsed.data);
    return record ? NextResponse.json({ record }) : NextResponse.json({ error: "记录不存在" }, { status: 404 });
  } catch (error) {
    if (error instanceof Error && error.message.includes("UNIQUE constraint failed")) {
      return NextResponse.json({ error: "这一天已经有一条生长记录" }, { status: 409 });
    }
    return NextResponse.json({ error: error instanceof Error ? error.message : "保存失败" }, { status: 400 });
  }
}

export async function DELETE(request: Request, { params }: Context) {
  if (!(await isAuthenticated())) return NextResponse.json({ error: "请先登录" }, { status: 401 });
  if (!isSameOrigin(request)) return NextResponse.json({ error: "请求来源无效" }, { status: 403 });
  const baby = await getCurrentBaby();
  if (!baby) return NextResponse.json({ error: "宝宝资料不存在" }, { status: 404 });
  const deleted = await deleteGrowthRecord((await params).id, baby.id);
  return deleted ? NextResponse.json({ ok: true }) : NextResponse.json({ error: "记录不存在" }, { status: 404 });
}
