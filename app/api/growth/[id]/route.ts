import { NextResponse } from "next/server";
import { isAuthenticated, isSameOrigin } from "@/lib/auth";
import { deleteGrowthRecord, isGrowthDateConflict, updateGrowthRecord } from "@/lib/growth";
import { validateMeasurementDate } from "@/lib/growth-validation";
import { getCurrentBaby } from "@/lib/meals";
import { growthRecordSchema } from "@/lib/validation";

type Context = { params: Promise<{ id: string }> };

export async function PATCH(request: Request, { params }: Context) {
  if (!(await isAuthenticated())) return NextResponse.json({ error: "请先登录" }, { status: 401 });
  if (!isSameOrigin(request)) return NextResponse.json({ error: "请求来源无效" }, { status: 403 });
  let baby: Awaited<ReturnType<typeof getCurrentBaby>>;
  try {
    baby = await getCurrentBaby();
  } catch (error) {
    console.error("Growth baby lookup failed", error);
    return NextResponse.json({ error: "暂时无法读取宝宝资料，请稍后重试" }, { status: 500 });
  }
  if (!baby) return NextResponse.json({ error: "宝宝资料不存在" }, { status: 404 });
  const parsed = growthRecordSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: parsed.error.issues[0]?.message }, { status: 400 });
  try {
    validateMeasurementDate(parsed.data.measuredDate, baby.birthDate, baby.timezone);
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "测量日期无效" }, { status: 400 });
  }
  try {
    const record = await updateGrowthRecord((await params).id, baby.id, parsed.data);
    return record ? NextResponse.json({ record }) : NextResponse.json({ error: "记录不存在" }, { status: 404 });
  } catch (error) {
    if (isGrowthDateConflict(error)) {
      return NextResponse.json({ error: "这一天已经有一条生长记录" }, { status: 409 });
    }
    console.error("Growth record update failed", error);
    return NextResponse.json({ error: "保存失败，请稍后重试" }, { status: 500 });
  }
}

export async function DELETE(request: Request, { params }: Context) {
  if (!(await isAuthenticated())) return NextResponse.json({ error: "请先登录" }, { status: 401 });
  if (!isSameOrigin(request)) return NextResponse.json({ error: "请求来源无效" }, { status: 403 });
  let baby: Awaited<ReturnType<typeof getCurrentBaby>>;
  try {
    baby = await getCurrentBaby();
  } catch (error) {
    console.error("Growth baby lookup failed", error);
    return NextResponse.json({ error: "暂时无法读取宝宝资料，请稍后重试" }, { status: 500 });
  }
  if (!baby) return NextResponse.json({ error: "宝宝资料不存在" }, { status: 404 });
  try {
    const deleted = await deleteGrowthRecord((await params).id, baby.id);
    return deleted ? NextResponse.json({ ok: true }) : NextResponse.json({ error: "记录不存在" }, { status: 404 });
  } catch (error) {
    console.error("Growth record deletion failed", error);
    return NextResponse.json({ error: "删除失败，请稍后重试" }, { status: 500 });
  }
}
