import { NextResponse } from "next/server";
import { isAuthenticated, isSameOrigin } from "@/lib/auth";
import { getCurrentBaby } from "@/lib/meals";
import { validateVaccinationDates } from "@/lib/vaccination-validation";
import { createVaccinationRecord, listVaccinationRecords } from "@/lib/vaccines";
import { vaccinationRecordSchema } from "@/lib/validation";

export async function GET() {
  if (!(await isAuthenticated())) return NextResponse.json({ error: "请先登录" }, { status: 401 });
  try {
    const baby = await getCurrentBaby();
    return NextResponse.json({ records: baby ? await listVaccinationRecords(baby.id) : [] });
  } catch (error) {
    console.error("Vaccination records query failed", error);
    return NextResponse.json({ error: "查询失败，请稍后重试" }, { status: 500 });
  }
}

export async function POST(request: Request) {
  if (!(await isAuthenticated())) return NextResponse.json({ error: "请先登录" }, { status: 401 });
  if (!isSameOrigin(request)) return NextResponse.json({ error: "请求来源无效" }, { status: 403 });

  let baby;
  try {
    baby = await getCurrentBaby();
  } catch (error) {
    console.error("Vaccination baby query failed", error);
    return NextResponse.json({ error: "保存失败，请稍后重试" }, { status: 500 });
  }
  if (!baby) return NextResponse.json({ error: "请先创建宝宝资料" }, { status: 409 });

  const parsed = vaccinationRecordSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: parsed.error.issues[0]?.message }, { status: 400 });
  try {
    validateVaccinationDates(parsed.data, baby.birthDate, baby.timezone);
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "接种日期无效" }, { status: 400 });
  }
  try {
    return NextResponse.json({ record: await createVaccinationRecord(baby.id, parsed.data) }, { status: 201 });
  } catch (error) {
    console.error("Vaccination record creation failed", error);
    return NextResponse.json({ error: "保存失败，请稍后重试" }, { status: 500 });
  }
}
