import { NextResponse } from "next/server";
import { isAuthenticated, isSameOrigin } from "@/lib/auth";
import { getCurrentBaby } from "@/lib/meals";
import { serializeSleepRecord } from "@/lib/sleep-summary";
import { endSleepRecord, SleepStateConflictError } from "@/lib/sleeps";

type Context = { params: Promise<{ id: string }> };

export async function POST(request: Request, { params }: Context) {
  if (!(await isAuthenticated())) return NextResponse.json({ error: "请先登录" }, { status: 401 });
  if (!isSameOrigin(request)) return NextResponse.json({ error: "请求来源无效" }, { status: 403 });
  const baby = await getCurrentBaby();
  if (!baby) return NextResponse.json({ error: "宝宝资料不存在" }, { status: 404 });
  const id = (await params).id;
  const endedAt = new Date();

  try {
    const result = endSleepRecord(id, baby.id, endedAt);
    if (result.status === "missing") return NextResponse.json({ error: "记录不存在" }, { status: 404 });
    if (result.status === "already-ended") return NextResponse.json({ error: "这段睡眠已经结束，请刷新记录" }, { status: 409 });
    return NextResponse.json({ record: serializeSleepRecord(result.record) });
  } catch (error) {
    if (error instanceof SleepStateConflictError) return NextResponse.json({ error: error.message }, { status: 409 });
    if (error instanceof Error && error.message === "结束时间必须晚于开始时间") {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }
    console.error("Sleep record ending failed", error);
    return NextResponse.json({ error: "保存失败，请稍后重试" }, { status: 500 });
  }
}
