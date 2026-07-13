import { NextResponse } from "next/server";
import { isAuthenticated, isSameOrigin } from "@/lib/auth";
import { parseDate } from "@/lib/dates";
import { getCurrentBaby } from "@/lib/meals";
import { validateMedicationRecordDate } from "@/lib/medication-validation";
import {
  createMedicationRecord,
  getMedicationDay,
  MedicationOccurrenceConflictError,
} from "@/lib/medications";
import { medicationRecordSchema } from "@/lib/validation";

export async function GET(request: Request) {
  if (!(await isAuthenticated())) return NextResponse.json({ error: "请先登录" }, { status: 401 });
  const date = new URL(request.url).searchParams.get("date") ?? "";
  try {
    parseDate(date);
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "用药日期无效" }, { status: 400 });
  }
  const baby = await getCurrentBaby();
  if (!baby) return NextResponse.json({ date, plans: [], duePlans: [], records: [] });
  try {
    validateMedicationRecordDate(date, baby.birthDate, baby.timezone);
    return NextResponse.json(await getMedicationDay(baby.id, date), { headers: { "cache-control": "no-store" } });
  } catch (error) {
    if (error instanceof Error && /日期/.test(error.message)) return NextResponse.json({ error: error.message }, { status: 400 });
    console.error("Medication day query failed", error);
    return NextResponse.json({ error: "查询失败，请稍后重试" }, { status: 500 });
  }
}

export async function POST(request: Request) {
  if (!(await isAuthenticated())) return NextResponse.json({ error: "请先登录" }, { status: 401 });
  if (!isSameOrigin(request)) return NextResponse.json({ error: "请求来源无效" }, { status: 403 });
  const baby = await getCurrentBaby();
  if (!baby) return NextResponse.json({ error: "请先创建宝宝资料" }, { status: 409 });
  const parsed = medicationRecordSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: parsed.error.issues[0]?.message }, { status: 400 });
  try {
    validateMedicationRecordDate(parsed.data.takenDate, baby.birthDate, baby.timezone);
    return NextResponse.json({ record: await createMedicationRecord(baby.id, parsed.data) }, { status: 201 });
  } catch (error) {
    if (error instanceof MedicationOccurrenceConflictError) return NextResponse.json({ error: error.message }, { status: 409 });
    if (error instanceof Error && /日期|计划|时间|药品|用药量/.test(error.message)) return NextResponse.json({ error: error.message }, { status: 400 });
    console.error("Medication record creation failed", error);
    return NextResponse.json({ error: "保存失败，请稍后重试" }, { status: 500 });
  }
}
