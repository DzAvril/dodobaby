import { NextResponse } from "next/server";
import { isAuthenticated, isSameOrigin } from "@/lib/auth";
import { createGrowthRecord, isGrowthDateConflict, listGrowthRecords } from "@/lib/growth";
import { validateMeasurementDate } from "@/lib/growth-validation";
import { getCurrentBaby } from "@/lib/meals";
import { growthRecordSchema } from "@/lib/validation";

export async function GET() {
  if (!(await isAuthenticated())) return NextResponse.json({ error: "请先登录" }, { status: 401 });
  try {
    const baby = await getCurrentBaby();
    return NextResponse.json({ records: baby ? await listGrowthRecords(baby.id) : [] });
  } catch (error) {
    console.error("Growth records query failed", error);
    return NextResponse.json({ error: "查询失败，请稍后重试" }, { status: 500 });
  }
}

export async function POST(request: Request) {
  if (!(await isAuthenticated())) return NextResponse.json({ error: "请先登录" }, { status: 401 });
  if (!isSameOrigin(request)) return NextResponse.json({ error: "请求来源无效" }, { status: 403 });
  let baby: Awaited<ReturnType<typeof getCurrentBaby>>;
  try {
    baby = await getCurrentBaby();
  } catch (error) {
    console.error("Growth baby lookup failed", error);
    return NextResponse.json({ error: "暂时无法读取宝宝资料，请稍后重试" }, { status: 500 });
  }
  if (!baby) return NextResponse.json({ error: "请先创建宝宝资料" }, { status: 409 });
  const parsed = growthRecordSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: parsed.error.issues[0]?.message }, { status: 400 });
  try {
    validateMeasurementDate(parsed.data.measuredDate, baby.birthDate, baby.timezone);
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "测量日期无效" }, { status: 400 });
  }
  try {
    return NextResponse.json({ record: await createGrowthRecord(baby.id, parsed.data) }, { status: 201 });
  } catch (error) {
    if (isGrowthDateConflict(error)) {
      return NextResponse.json({ error: "这一天已经有一条生长记录" }, { status: 409 });
    }
    console.error("Growth record creation failed", error);
    return NextResponse.json({ error: "保存失败，请稍后重试" }, { status: 500 });
  }
}
