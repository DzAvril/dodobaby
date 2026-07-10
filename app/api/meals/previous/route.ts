import { NextResponse } from "next/server";
import { isAuthenticated } from "@/lib/auth";
import { parseDate } from "@/lib/dates";
import { getCurrentBaby, getPreviousMeal } from "@/lib/meals";

export async function GET(request: Request) {
  if (!(await isAuthenticated())) return NextResponse.json({ error: "请先登录" }, { status: 401 });
  const baby = await getCurrentBaby();
  if (!baby) return NextResponse.json({ meal: null });
  const before = new URL(request.url).searchParams.get("before") ?? "";
  try {
    parseDate(before);
    return NextResponse.json({ meal: await getPreviousMeal(baby.id, before) });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "日期无效" }, { status: 400 });
  }
}
