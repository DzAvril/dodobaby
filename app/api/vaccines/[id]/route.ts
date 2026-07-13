import { NextResponse } from "next/server";
import { isAuthenticated, isSameOrigin } from "@/lib/auth";
import { getCurrentBaby } from "@/lib/meals";
import { validateVaccinationDates } from "@/lib/vaccination-validation";
import { deleteVaccinationRecord, getVaccinationRecord, updateVaccinationRecord } from "@/lib/vaccines";
import { vaccinationRecordSchema } from "@/lib/validation";

type Context = { params: Promise<{ id: string }> };

export async function GET(_request: Request, { params }: Context) {
  if (!(await isAuthenticated())) return NextResponse.json({ error: "请先登录" }, { status: 401 });
  const baby = await getCurrentBaby();
  if (!baby) return NextResponse.json({ error: "宝宝资料不存在" }, { status: 404 });
  const record = await getVaccinationRecord((await params).id, baby.id);
  return record ? NextResponse.json({ record }) : NextResponse.json({ error: "记录不存在" }, { status: 404 });
}

export async function PATCH(request: Request, { params }: Context) {
  if (!(await isAuthenticated())) return NextResponse.json({ error: "请先登录" }, { status: 401 });
  if (!isSameOrigin(request)) return NextResponse.json({ error: "请求来源无效" }, { status: 403 });

  let baby;
  try {
    baby = await getCurrentBaby();
  } catch (error) {
    console.error("Vaccination baby query failed", error);
    return NextResponse.json({ error: "保存失败，请稍后重试" }, { status: 500 });
  }
  if (!baby) return NextResponse.json({ error: "宝宝资料不存在" }, { status: 404 });

  const parsed = vaccinationRecordSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: parsed.error.issues[0]?.message }, { status: 400 });
  try {
    validateVaccinationDates(parsed.data, baby.birthDate, baby.timezone);
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "接种日期无效" }, { status: 400 });
  }
  try {
    const record = await updateVaccinationRecord((await params).id, baby.id, parsed.data);
    return record ? NextResponse.json({ record }) : NextResponse.json({ error: "记录不存在" }, { status: 404 });
  } catch (error) {
    console.error("Vaccination record update failed", error);
    return NextResponse.json({ error: "保存失败，请稍后重试" }, { status: 500 });
  }
}

export async function DELETE(request: Request, { params }: Context) {
  if (!(await isAuthenticated())) return NextResponse.json({ error: "请先登录" }, { status: 401 });
  if (!isSameOrigin(request)) return NextResponse.json({ error: "请求来源无效" }, { status: 403 });

  let baby;
  try {
    baby = await getCurrentBaby();
  } catch (error) {
    console.error("Vaccination baby query failed", error);
    return NextResponse.json({ error: "删除失败，请稍后重试" }, { status: 500 });
  }
  if (!baby) return NextResponse.json({ error: "宝宝资料不存在" }, { status: 404 });
  try {
    const deleted = await deleteVaccinationRecord((await params).id, baby.id);
    return deleted ? NextResponse.json({ ok: true }) : NextResponse.json({ error: "记录不存在" }, { status: 404 });
  } catch (error) {
    console.error("Vaccination record deletion failed", error);
    return NextResponse.json({ error: "删除失败，请稍后重试" }, { status: 500 });
  }
}
