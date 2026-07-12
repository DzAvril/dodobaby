import { NextResponse } from "next/server";
import { isAuthenticated, isSameOrigin } from "@/lib/auth";
import { createBaby, getCurrentBaby, updateBaby } from "@/lib/meals";
import { getEarliestGrowthRecordDate } from "@/lib/growth";
import { getEarliestFeedingRecordDate } from "@/lib/feedings";
import { getEarliestVaccinationRecordDate } from "@/lib/vaccines";
import { getEarliestDiaperRecordDate } from "@/lib/diapers";
import { getEarliestSleepRecordDate } from "@/lib/sleeps";
import { babySchema } from "@/lib/validation";
import { parseDate, todayInTimezone } from "@/lib/dates";

export async function GET() {
  if (!(await isAuthenticated())) return NextResponse.json({ error: "请先登录" }, { status: 401 });
  return NextResponse.json({ baby: await getCurrentBaby() });
}

export async function POST(request: Request) {
  if (!(await isAuthenticated())) return NextResponse.json({ error: "请先登录" }, { status: 401 });
  if (!isSameOrigin(request)) return NextResponse.json({ error: "请求来源无效" }, { status: 403 });
  if (await getCurrentBaby()) return NextResponse.json({ error: "宝宝资料已存在" }, { status: 409 });
  const parsed = babySchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: parsed.error.issues[0]?.message }, { status: 400 });
  try {
    parseDate(parsed.data.birthDate);
    if (parsed.data.birthDate > todayInTimezone(parsed.data.timezone)) throw new Error("出生日期不能晚于今天");
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "宝宝资料无效" }, { status: 400 });
  }
  try {
    return NextResponse.json({ baby: await createBaby({ ...parsed.data, sex: parsed.data.sex ?? "unknown" }) }, { status: 201 });
  } catch (error) {
    console.error("Baby profile creation failed", error);
    return NextResponse.json({ error: "保存失败，请稍后重试" }, { status: 500 });
  }
}

export async function PATCH(request: Request) {
  if (!(await isAuthenticated())) return NextResponse.json({ error: "请先登录" }, { status: 401 });
  if (!isSameOrigin(request)) return NextResponse.json({ error: "请求来源无效" }, { status: 403 });
  const baby = await getCurrentBaby();
  if (!baby) return NextResponse.json({ error: "请先创建宝宝资料" }, { status: 404 });
  const parsed = babySchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: parsed.error.issues[0]?.message }, { status: 400 });
  try {
    parseDate(parsed.data.birthDate);
    if (parsed.data.birthDate > todayInTimezone(parsed.data.timezone)) throw new Error("出生日期不能晚于今天");
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "宝宝资料无效" }, { status: 400 });
  }

  let earliestGrowthDate: string | null;
  let earliestFeedingDate: string | null;
  let earliestVaccinationDate: string | null;
  let earliestDiaperDate: string | null;
  let earliestSleepDate: string | null;
  try {
    [earliestGrowthDate, earliestFeedingDate, earliestVaccinationDate, earliestDiaperDate, earliestSleepDate] = await Promise.all([
      getEarliestGrowthRecordDate(baby.id),
      getEarliestFeedingRecordDate(baby.id),
      getEarliestVaccinationRecordDate(baby.id),
      getEarliestDiaperRecordDate(baby.id),
      getEarliestSleepRecordDate(baby.id),
    ]);
  } catch (error) {
    console.error("Baby timeline validation failed", error);
    return NextResponse.json({ error: "暂时无法检查已有记录，请稍后重试" }, { status: 500 });
  }
  if (earliestGrowthDate && parsed.data.birthDate > earliestGrowthDate) {
    return NextResponse.json({ error: `出生日期不能晚于已有生长记录（${earliestGrowthDate}）` }, { status: 400 });
  }
  if (earliestFeedingDate && parsed.data.birthDate > earliestFeedingDate) {
    return NextResponse.json({ error: `出生日期不能晚于已有喂养记录（${earliestFeedingDate}）` }, { status: 400 });
  }
  if (earliestVaccinationDate && parsed.data.birthDate > earliestVaccinationDate) {
    return NextResponse.json({ error: `出生日期不能晚于已有疫苗记录（${earliestVaccinationDate}）` }, { status: 400 });
  }
  if (earliestDiaperDate && parsed.data.birthDate > earliestDiaperDate) {
    return NextResponse.json({ error: `出生日期不能晚于已有尿布记录（${earliestDiaperDate}）` }, { status: 400 });
  }
  if (earliestSleepDate && parsed.data.birthDate > earliestSleepDate) {
    return NextResponse.json({ error: `出生日期不能晚于已有睡眠记录（${earliestSleepDate}）` }, { status: 400 });
  }

  try {
    return NextResponse.json({ baby: await updateBaby(baby.id, { ...parsed.data, sex: parsed.data.sex ?? baby.sex }) });
  } catch (error) {
    console.error("Baby profile update failed", error);
    return NextResponse.json({ error: "保存失败，请稍后重试" }, { status: 500 });
  }
}
