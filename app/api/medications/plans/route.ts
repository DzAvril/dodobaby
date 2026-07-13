import { NextResponse } from "next/server";
import { isAuthenticated, isSameOrigin } from "@/lib/auth";
import { getCurrentBaby } from "@/lib/meals";
import { validateMedicationPlanDates } from "@/lib/medication-validation";
import { createMedicationPlan, listMedicationPlans } from "@/lib/medications";
import { medicationPlanSchema } from "@/lib/validation";

export async function GET() {
  if (!(await isAuthenticated())) return NextResponse.json({ error: "请先登录" }, { status: 401 });
  const baby = await getCurrentBaby();
  return NextResponse.json({ plans: baby ? await listMedicationPlans(baby.id) : [] });
}

export async function POST(request: Request) {
  if (!(await isAuthenticated())) return NextResponse.json({ error: "请先登录" }, { status: 401 });
  if (!isSameOrigin(request)) return NextResponse.json({ error: "请求来源无效" }, { status: 403 });
  const baby = await getCurrentBaby();
  if (!baby) return NextResponse.json({ error: "请先创建宝宝资料" }, { status: 409 });
  const parsed = medicationPlanSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: parsed.error.issues[0]?.message }, { status: 400 });
  try {
    validateMedicationPlanDates(parsed.data.startDate, parsed.data.endDate, baby.birthDate);
    return NextResponse.json({ plan: await createMedicationPlan(baby.id, parsed.data) }, { status: 201 });
  } catch (error) {
    if (error instanceof Error && /日期/.test(error.message)) return NextResponse.json({ error: error.message }, { status: 400 });
    console.error("Medication plan creation failed", error);
    return NextResponse.json({ error: "保存失败，请稍后重试" }, { status: 500 });
  }
}
