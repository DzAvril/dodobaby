import { NextResponse } from "next/server";
import { isAuthenticated, isSameOrigin } from "@/lib/auth";
import { validateDiaperDateTime } from "@/lib/diaper-validation";
import { deleteDiaperRecord, getDiaperRecord, updateDiaperRecord } from "@/lib/diapers";
import { getCurrentBaby } from "@/lib/meals";
import { diaperRecordSchema } from "@/lib/validation";

type Context = { params: Promise<{ id: string }> };

export async function GET(_request: Request, { params }: Context) {
  if (!(await isAuthenticated())) return NextResponse.json({ error: "请先登录" }, { status: 401 });
  const baby = await getCurrentBaby();
  if (!baby) return NextResponse.json({ error: "宝宝资料不存在" }, { status: 404 });
  const record = await getDiaperRecord((await params).id, baby.id);
  return record ? NextResponse.json({ record }) : NextResponse.json({ error: "记录不存在" }, { status: 404 });
}

export async function PATCH(request: Request, { params }: Context) {
  if (!(await isAuthenticated())) return NextResponse.json({ error: "请先登录" }, { status: 401 });
  if (!isSameOrigin(request)) return NextResponse.json({ error: "请求来源无效" }, { status: 403 });
  const baby = await getCurrentBaby();
  if (!baby) return NextResponse.json({ error: "宝宝资料不存在" }, { status: 404 });
  const parsed = diaperRecordSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: parsed.error.issues[0]?.message }, { status: 400 });
  try {
    validateDiaperDateTime(parsed.data.diaperDate, parsed.data.changedTime, baby.birthDate, baby.timezone);
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "尿布时间无效" }, { status: 400 });
  }
  try {
    const record = await updateDiaperRecord((await params).id, baby.id, parsed.data);
    return record ? NextResponse.json({ record }) : NextResponse.json({ error: "记录不存在" }, { status: 404 });
  } catch (error) {
    console.error("Diaper record update failed", error);
    return NextResponse.json({ error: "保存失败，请稍后重试" }, { status: 500 });
  }
}

export async function DELETE(request: Request, { params }: Context) {
  if (!(await isAuthenticated())) return NextResponse.json({ error: "请先登录" }, { status: 401 });
  if (!isSameOrigin(request)) return NextResponse.json({ error: "请求来源无效" }, { status: 403 });
  const baby = await getCurrentBaby();
  if (!baby) return NextResponse.json({ error: "宝宝资料不存在" }, { status: 404 });
  try {
    const deleted = await deleteDiaperRecord((await params).id, baby.id);
    return deleted ? NextResponse.json({ ok: true }) : NextResponse.json({ error: "记录不存在" }, { status: 404 });
  } catch (error) {
    console.error("Diaper record deletion failed", error);
    return NextResponse.json({ error: "删除失败，请稍后重试" }, { status: 500 });
  }
}
