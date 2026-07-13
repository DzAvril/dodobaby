import { NextResponse } from "next/server";
import { isAuthenticated, isSameOrigin } from "@/lib/auth";
import { getCurrentBaby } from "@/lib/meals";
import { validateMedicationPlanDates } from "@/lib/medication-validation";
import { deleteMedicationPlan, getMedicationPlan, updateMedicationPlan } from "@/lib/medications";
import { medicationPlanSchema } from "@/lib/validation";

type Context = { params: Promise<{ id: string }> };

export async function GET(_request: Request, { params }: Context) {
  if (!(await isAuthenticated())) return NextResponse.json({ error: "请先登录" }, { status: 401 });
  const baby = await getCurrentBaby();
  if (!baby) return NextResponse.json({ error: "宝宝资料不存在" }, { status: 404 });
  const plan = await getMedicationPlan((await params).id, baby.id);
  return plan ? NextResponse.json({ plan }) : NextResponse.json({ error: "计划不存在" }, { status: 404 });
}

export async function PATCH(request: Request, { params }: Context) {
  if (!(await isAuthenticated())) return NextResponse.json({ error: "请先登录" }, { status: 401 });
  if (!isSameOrigin(request)) return NextResponse.json({ error: "请求来源无效" }, { status: 403 });
  const baby = await getCurrentBaby();
  if (!baby) return NextResponse.json({ error: "宝宝资料不存在" }, { status: 404 });
  const parsed = medicationPlanSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: parsed.error.issues[0]?.message }, { status: 400 });
  try {
    validateMedicationPlanDates(parsed.data.startDate, parsed.data.endDate, baby.birthDate);
    const plan = await updateMedicationPlan((await params).id, baby.id, parsed.data);
    return plan ? NextResponse.json({ plan }) : NextResponse.json({ error: "计划不存在" }, { status: 404 });
  } catch (error) {
    if (error instanceof Error && /日期/.test(error.message)) return NextResponse.json({ error: error.message }, { status: 400 });
    console.error("Medication plan update failed", error);
    return NextResponse.json({ error: "保存失败，请稍后重试" }, { status: 500 });
  }
}

export async function DELETE(request: Request, { params }: Context) {
  if (!(await isAuthenticated())) return NextResponse.json({ error: "请先登录" }, { status: 401 });
  if (!isSameOrigin(request)) return NextResponse.json({ error: "请求来源无效" }, { status: 403 });
  const baby = await getCurrentBaby();
  if (!baby) return NextResponse.json({ error: "宝宝资料不存在" }, { status: 404 });
  try {
    const deleted = await deleteMedicationPlan((await params).id, baby.id);
    return deleted ? NextResponse.json({ ok: true }) : NextResponse.json({ error: "计划不存在" }, { status: 404 });
  } catch (error) {
    console.error("Medication plan deletion failed", error);
    return NextResponse.json({ error: "删除失败，请稍后重试" }, { status: 500 });
  }
}
