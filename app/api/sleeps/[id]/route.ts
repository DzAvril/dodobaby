import { NextResponse } from "next/server";
import { isAuthenticated, isSameOrigin } from "@/lib/auth";
import { getCurrentBaby } from "@/lib/meals";
import { validateSleepInterval } from "@/lib/sleep-validation";
import { serializeSleepRecord } from "@/lib/sleep-summary";
import {
  ActiveSleepConflictError,
  deleteSleepRecord,
  getSleepRecord,
  SleepOverlapError,
  SleepStateConflictError,
  updateSleepRecord,
} from "@/lib/sleeps";
import { sleepRecordSchema } from "@/lib/validation";

type Context = { params: Promise<{ id: string }> };

export async function PATCH(request: Request, { params }: Context) {
  if (!(await isAuthenticated())) return NextResponse.json({ error: "请先登录" }, { status: 401 });
  if (!isSameOrigin(request)) return NextResponse.json({ error: "请求来源无效" }, { status: 403 });
  const baby = await getCurrentBaby();
  if (!baby) return NextResponse.json({ error: "宝宝资料不存在" }, { status: 404 });
  const id = (await params).id;
  const existing = getSleepRecord(id, baby.id);
  if (!existing) return NextResponse.json({ error: "记录不存在" }, { status: 404 });
  const parsed = sleepRecordSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: parsed.error.issues[0]?.message }, { status: 400 });

  let interval: ReturnType<typeof validateSleepInterval>;
  try {
    interval = validateSleepInterval(parsed.data, baby.birthDate, existing.recordTimezone);
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "睡眠时间无效" }, { status: 400 });
  }
  if (Boolean(existing.endedAt) !== Boolean(interval.endedAt)) {
    return NextResponse.json({ error: existing.endedAt ? "已结束记录不能改为进行中" : "请使用结束睡眠操作记录醒来时间" }, { status: 400 });
  }

  try {
    const record = updateSleepRecord(id, baby.id, { ...interval, note: parsed.data.note });
    return record
      ? NextResponse.json({ record: serializeSleepRecord(record) })
      : NextResponse.json({ error: "记录不存在" }, { status: 404 });
  } catch (error) {
    if (error instanceof ActiveSleepConflictError || error instanceof SleepOverlapError || error instanceof SleepStateConflictError) {
      return NextResponse.json({ error: error.message }, { status: 409 });
    }
    console.error("Sleep record update failed", error);
    return NextResponse.json({ error: "保存失败，请稍后重试" }, { status: 500 });
  }
}

export async function DELETE(request: Request, { params }: Context) {
  if (!(await isAuthenticated())) return NextResponse.json({ error: "请先登录" }, { status: 401 });
  if (!isSameOrigin(request)) return NextResponse.json({ error: "请求来源无效" }, { status: 403 });
  const baby = await getCurrentBaby();
  if (!baby) return NextResponse.json({ error: "宝宝资料不存在" }, { status: 404 });
  try {
    const deleted = deleteSleepRecord((await params).id, baby.id);
    return deleted ? NextResponse.json({ ok: true }) : NextResponse.json({ error: "记录不存在" }, { status: 404 });
  } catch (error) {
    console.error("Sleep record deletion failed", error);
    return NextResponse.json({ error: "删除失败，请稍后重试" }, { status: 500 });
  }
}
