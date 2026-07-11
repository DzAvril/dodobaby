import { NextResponse } from "next/server";
import { isAuthenticated, isSameOrigin } from "@/lib/auth";
import { dayBoundsInTimezone, parseDate, truncateToMinute } from "@/lib/dates";
import { getCurrentBaby } from "@/lib/meals";
import { validateSleepDate, validateSleepInterval } from "@/lib/sleep-validation";
import { serializeSleepRecord, summarizeSleeps } from "@/lib/sleep-summary";
import {
  ActiveSleepConflictError,
  createSleepRecord,
  getActiveSleepRecord,
  getLatestSleepRecord,
  listSleepRecordsForDay,
  SleepOverlapError,
} from "@/lib/sleeps";
import { sleepRecordSchema } from "@/lib/validation";

export async function GET(request: Request) {
  if (!(await isAuthenticated())) return NextResponse.json({ error: "请先登录" }, { status: 401 });
  const date = new URL(request.url).searchParams.get("date");
  if (!date) return NextResponse.json({ error: "请提供睡眠日期" }, { status: 400 });
  try {
    parseDate(date);
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "睡眠日期无效" }, { status: 400 });
  }

  const baby = await getCurrentBaby();
  if (!baby) {
    return NextResponse.json({
      date,
      records: [],
      active: null,
      latest: null,
      summary: { sessionCount: 0, totalMinutes: 0, longestMinutes: 0, ongoingCount: 0 },
    }, { headers: { "cache-control": "no-store" } });
  }

  try {
    validateSleepDate(date, baby.birthDate, baby.timezone);
    const { start, end } = dayBoundsInTimezone(date, baby.timezone);
    const now = truncateToMinute();
    const [records, active, latest] = await Promise.all([
      listSleepRecordsForDay(baby.id, start, end),
      getActiveSleepRecord(baby.id),
      getLatestSleepRecord(baby.id),
    ]);
    return NextResponse.json({
      date,
      records: records.map((record) => serializeSleepRecord(record, start, end, now)),
      active: active ? serializeSleepRecord(active, undefined, undefined, now) : null,
      latest: latest ? serializeSleepRecord(latest, undefined, undefined, now) : null,
      summary: summarizeSleeps(records, start, end, now),
    }, { headers: { "cache-control": "no-store" } });
  } catch (error) {
    if (error instanceof RangeError || (error instanceof Error && /日期|时间|时区/.test(error.message))) {
      return NextResponse.json({ error: error instanceof Error ? error.message : "睡眠日期无效" }, { status: 400 });
    }
    console.error("Sleep records query failed", error);
    return NextResponse.json({ error: "查询失败，请稍后重试" }, { status: 500 });
  }
}

export async function POST(request: Request) {
  if (!(await isAuthenticated())) return NextResponse.json({ error: "请先登录" }, { status: 401 });
  if (!isSameOrigin(request)) return NextResponse.json({ error: "请求来源无效" }, { status: 403 });
  const baby = await getCurrentBaby();
  if (!baby) return NextResponse.json({ error: "请先创建宝宝资料" }, { status: 409 });
  const parsed = sleepRecordSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: parsed.error.issues[0]?.message }, { status: 400 });

  let interval: ReturnType<typeof validateSleepInterval>;
  try {
    interval = validateSleepInterval(parsed.data, baby.birthDate, baby.timezone);
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "睡眠时间无效" }, { status: 400 });
  }

  try {
    const record = createSleepRecord(baby.id, { ...interval, note: parsed.data.note });
    return NextResponse.json({ record: serializeSleepRecord(record) }, { status: 201 });
  } catch (error) {
    if (error instanceof ActiveSleepConflictError || error instanceof SleepOverlapError) {
      return NextResponse.json({ error: error.message }, { status: 409 });
    }
    console.error("Sleep record creation failed", error);
    return NextResponse.json({ error: "保存失败，请稍后重试" }, { status: 500 });
  }
}
