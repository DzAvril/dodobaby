import { NextResponse } from "next/server";
import { isAuthenticated, isSameOrigin } from "@/lib/auth";
import { createGrowthRecord, listGrowthRecords } from "@/lib/growth";
import { validateMeasurementDate } from "@/lib/growth-validation";
import { getCurrentBaby } from "@/lib/meals";
import { growthRecordSchema } from "@/lib/validation";

export async function GET() {
  if (!(await isAuthenticated())) return NextResponse.json({ error: "请先登录" }, { status: 401 });
  const baby = await getCurrentBaby();
  return NextResponse.json({ records: baby ? await listGrowthRecords(baby.id) : [] });
}

export async function POST(request: Request) {
  if (!(await isAuthenticated())) return NextResponse.json({ error: "请先登录" }, { status: 401 });
  if (!isSameOrigin(request)) return NextResponse.json({ error: "请求来源无效" }, { status: 403 });
  const baby = await getCurrentBaby();
  if (!baby) return NextResponse.json({ error: "请先创建宝宝资料" }, { status: 409 });
  const parsed = growthRecordSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: parsed.error.issues[0]?.message }, { status: 400 });
  try {
    validateMeasurementDate(parsed.data.measuredDate, baby.birthDate, baby.timezone);
    return NextResponse.json({ record: await createGrowthRecord(baby.id, parsed.data) }, { status: 201 });
  } catch (error) {
    if (error instanceof Error && error.message.includes("UNIQUE constraint failed")) {
      return NextResponse.json({ error: "这一天已经有一条生长记录" }, { status: 409 });
    }
    return NextResponse.json({ error: error instanceof Error ? error.message : "保存失败" }, { status: 400 });
  }
}
