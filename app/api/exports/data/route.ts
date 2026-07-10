import { NextResponse } from "next/server";
import { isAuthenticated } from "@/lib/auth";
import { monthBounds } from "@/lib/dates";
import { getCurrentBaby, listMealsByMonth } from "@/lib/meals";

const MEAL_LABELS: Record<string, string> = { breakfast: "早餐", morning_snack: "上午加餐", lunch: "午餐", afternoon_snack: "下午加餐", dinner: "晚餐", custom: "自定义" };
const STATUS_LABELS: Record<string, string> = { planned: "待记录", completed: "吃完", partial: "部分吃", skipped: "未吃" };
const REACTION_LABELS: Record<string, string> = { normal: "无异常", liked: "喜欢", disliked: "不喜欢", rash: "皮疹", vomit: "呕吐", diarrhea: "腹泻", constipation: "便秘", other: "其他" };

function csvCell(value: unknown) {
  const text = value == null ? "" : String(value);
  return `"${text.replaceAll('"', '""')}"`;
}

export async function GET(request: Request) {
  if (!(await isAuthenticated())) return NextResponse.json({ error: "请先登录" }, { status: 401 });
  const baby = await getCurrentBaby();
  if (!baby) return NextResponse.json({ error: "请先创建宝宝资料" }, { status: 409 });

  const search = new URL(request.url).searchParams;
  const month = search.get("month") ?? "";
  const format = search.get("format") ?? "json";
  try {
    monthBounds(month);
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "月份无效" }, { status: 400 });
  }
  if (!['json', 'csv'].includes(format)) return NextResponse.json({ error: "导出格式无效" }, { status: 400 });

  const meals = await listMealsByMonth(baby.id, month);
  const baseName = `${baby.name}-辅食记录-${month}`;
  if (format === "json") {
    return new Response(JSON.stringify({ exportedAt: new Date().toISOString(), baby, meals }, null, 2), {
      headers: {
        "content-type": "application/json; charset=utf-8",
        "content-disposition": `attachment; filename*=UTF-8''${encodeURIComponent(`${baseName}.json`)}`,
        "cache-control": "no-store",
      },
    });
  }

  const headers = ["日期", "餐次", "计划时间", "食材", "数量", "单位", "做法", "首次尝试", "实际状态", "实际时间", "反应", "计划备注", "实际备注"];
  const rows = meals.flatMap((meal) =>
    meal.items.map((item) => [
      meal.mealDate,
      meal.customMealType || MEAL_LABELS[meal.mealType] || meal.mealType,
      meal.plannedTime,
      item.name,
      item.amount,
      item.unit,
      item.preparation,
      item.isFirstTry ? "是" : "否",
      STATUS_LABELS[meal.actualStatus] || meal.actualStatus,
      meal.actualTime,
      meal.reactionTags.map((tag) => REACTION_LABELS[tag] || tag).join("、"),
      meal.planNote,
      meal.actualNote,
    ]),
  );
  const csv = `\uFEFF${[headers, ...rows].map((row) => row.map(csvCell).join(",")).join("\r\n")}`;
  return new Response(csv, {
    headers: {
      "content-type": "text/csv; charset=utf-8",
      "content-disposition": `attachment; filename*=UTF-8''${encodeURIComponent(`${baseName}.csv`)}`,
      "cache-control": "no-store",
    },
  });
}
