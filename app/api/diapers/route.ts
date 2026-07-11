import { NextResponse } from "next/server";
import { isAuthenticated, isSameOrigin } from "@/lib/auth";
import { validateDiaperDate, validateDiaperDateTime } from "@/lib/diaper-validation";
import { summarizeDiapers } from "@/lib/diaper-summary";
import { createDiaperRecord, getLatestDiaperRecord, listDiaperRecordsByDate } from "@/lib/diapers";
import { parseDate } from "@/lib/dates";
import { getCurrentBaby } from "@/lib/meals";
import { diaperRecordSchema } from "@/lib/validation";

export async function GET(request: Request) {
  if (!(await isAuthenticated())) return NextResponse.json({ error: "请先登录" }, { status: 401 });
  const date = new URL(request.url).searchParams.get("date");
  if (!date) return NextResponse.json({ error: "请提供尿布日期" }, { status: 400 });
  try {
    parseDate(date);
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "尿布日期无效" }, { status: 400 });
  }
  const baby = await getCurrentBaby();
  if (!baby) return NextResponse.json({ date, records: [], latest: null, summary: summarizeDiapers([]) });
  try {
    validateDiaperDate(date, baby.birthDate, baby.timezone);
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "尿布日期无效" }, { status: 400 });
  }
  try {
    const [records, latest] = await Promise.all([
      listDiaperRecordsByDate(baby.id, date),
      getLatestDiaperRecord(baby.id),
    ]);
    return NextResponse.json({ date, records, latest, summary: summarizeDiapers(records) });
  } catch (error) {
    console.error("Diaper records query failed", error);
    return NextResponse.json({ error: "查询失败，请稍后重试" }, { status: 500 });
  }
}

export async function POST(request: Request) {
  if (!(await isAuthenticated())) return NextResponse.json({ error: "请先登录" }, { status: 401 });
  if (!isSameOrigin(request)) return NextResponse.json({ error: "请求来源无效" }, { status: 403 });
  const baby = await getCurrentBaby();
  if (!baby) return NextResponse.json({ error: "请先创建宝宝资料" }, { status: 409 });
  const parsed = diaperRecordSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: parsed.error.issues[0]?.message }, { status: 400 });
  try {
    validateDiaperDateTime(parsed.data.diaperDate, parsed.data.changedTime, baby.birthDate, baby.timezone);
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "尿布时间无效" }, { status: 400 });
  }
  try {
    return NextResponse.json({ record: await createDiaperRecord(baby.id, parsed.data) }, { status: 201 });
  } catch (error) {
    console.error("Diaper record creation failed", error);
    return NextResponse.json({ error: "保存失败，请稍后重试" }, { status: 500 });
  }
}
