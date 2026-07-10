import type { Baby } from "@/db/schema";
import { formatAge, getMonthGrid } from "@/lib/dates";
import type { MealRecord } from "@/lib/meals";

const WEEKDAYS = ["一", "二", "三", "四", "五", "六", "日"];
const MEAL_LABELS: Record<string, string> = {
  breakfast: "早餐",
  morning_snack: "上午加餐",
  lunch: "午餐",
  afternoon_snack: "下午加餐",
  dinner: "晚餐",
  custom: "加餐",
};
const STATUS_LABELS: Record<string, string> = { planned: "待记录", completed: "吃完", partial: "部分吃", skipped: "未吃" };
const REACTION_LABELS: Record<string, string> = {
  normal: "无异常",
  liked: "喜欢",
  disliked: "不喜欢",
  rash: "皮疹",
  vomit: "呕吐",
  diarrhea: "腹泻",
  constipation: "便秘",
  other: "其他",
};

function escapeHtml(value: unknown) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function amountText(item: MealRecord["items"][number]) {
  const amount = item.amount == null ? "" : Number.isInteger(item.amount) ? String(item.amount) : String(Number(item.amount.toFixed(2)));
  return `${amount}${item.unit ?? ""}`;
}

function mealTitle(meal: MealRecord) {
  return meal.customMealType || MEAL_LABELS[meal.mealType] || "辅食";
}

function mainMeal(meal: MealRecord, scope: "plan" | "full") {
  const items = meal.items.slice(0, 3).map((item) => `<span>${escapeHtml(item.name)}${escapeHtml(amountText(item))}${item.isFirstTry ? '<b class="new-food">新</b>' : ""}</span>`).join(" · ");
  const more = meal.items.length > 3 ? `<span class="more"> +${meal.items.length - 3}项</span>` : "";
  const actual = scope === "full" ? `<em class="status ${escapeHtml(meal.actualStatus)}">${escapeHtml(STATUS_LABELS[meal.actualStatus])}</em>` : "";
  return `<div class="meal"><div class="meal-head"><strong>${escapeHtml(meal.plannedTime || mealTitle(meal))}</strong>${actual}</div><div class="foods">${items}${more}</div></div>`;
}

function detailDay(date: string, meals: MealRecord[], scope: "plan" | "full") {
  return `<section class="detail-day"><h3>${Number(date.slice(8))}日</h3>${meals
    .map((meal) => {
      const foods = meal.items.map((item) => `${escapeHtml(item.name)} ${escapeHtml(amountText(item))}${item.preparation ? `（${escapeHtml(item.preparation)}）` : ""}`).join("、");
      const actual = scope === "full" ? `<div>实际：${escapeHtml(STATUS_LABELS[meal.actualStatus])}${meal.actualTime ? ` ${escapeHtml(meal.actualTime)}` : ""}${meal.reactionTags.length ? ` · ${meal.reactionTags.map((tag) => escapeHtml(REACTION_LABELS[tag] || tag)).join("、")}` : ""}</div>` : "";
      return `<div class="detail-meal"><b>${escapeHtml(meal.plannedTime || "--:--")} ${escapeHtml(mealTitle(meal))}</b><div>${foods}</div>${actual}${meal.planNote ? `<small>计划：${escapeHtml(meal.planNote)}</small>` : ""}${scope === "full" && meal.actualNote ? `<small>备注：${escapeHtml(meal.actualNote)}</small>` : ""}</div>`;
    })
    .join("")}</section>`;
}

export function renderMonthlyHtml(baby: Baby, meals: MealRecord[], month: string, scope: "plan" | "full") {
  const dates = getMonthGrid(month);
  const mealsByDate = new Map<string, MealRecord[]>();
  for (const meal of meals) mealsByDate.set(meal.mealDate, [...(mealsByDate.get(meal.mealDate) ?? []), meal]);
  const overflowDates = dates.filter((date) => {
    const entries = mealsByDate.get(date) ?? [];
    return entries.length > 2 || entries.some((entry) => entry.items.length > 3 || (entry.planNote?.length ?? 0) > 70 || (entry.actualNote?.length ?? 0) > 70);
  });

  const cells = dates
    .map((date) => {
      const inMonth = date.startsWith(month);
      const entries = mealsByDate.get(date) ?? [];
      const age = inMonth ? formatAge(baby.birthDate, date) : "";
      return `<article class="day ${inMonth ? "" : "outside"}"><header><b>${Number(date.slice(8))}</b><span>${escapeHtml(age)}</span></header>${entries.slice(0, 2).map((meal) => mainMeal(meal, scope)).join("")}${entries.length > 2 ? `<div class="overflow">另有 ${entries.length - 2} 餐见详情</div>` : ""}</article>`;
    })
    .join("");

  const detailGroups = Array.from({ length: Math.ceil(overflowDates.length / 12) }, (_, index) => overflowDates.slice(index * 12, index * 12 + 12));
  const detailPages = detailGroups
    .map((group, index) => `<div class="page detail-page"><div class="detail-title"><span>${escapeHtml(baby.name)}的辅食菜单 · ${escapeHtml(month)}</span><b>详情 ${index + 1}/${detailGroups.length}</b></div><div class="detail-grid">${group.map((date) => detailDay(date, mealsByDate.get(date) ?? [], scope)).join("")}</div></div>`)
    .join("");

  const [year, monthNumber] = month.split("-");
  const html = `<!doctype html><html lang="zh-CN"><head><meta charset="utf-8"><title>${escapeHtml(baby.name)}的辅食菜单 - ${escapeHtml(month)}</title><style>
    *{box-sizing:border-box}html,body{margin:0;padding:0;background:#f4eee3;color:#3f382f;font-family:"Noto Sans CJK SC","PingFang SC","Microsoft YaHei",sans-serif;-webkit-print-color-adjust:exact;print-color-adjust:exact}
    @page{size:A4 landscape;margin:0}.page{width:1122.56px;height:793.6px;background:#fffdf8;padding:35px 40px;overflow:hidden;break-after:page}.page:last-child{break-after:auto}
    .hero{height:82px;display:flex;align-items:flex-end;justify-content:space-between;border-bottom:3px solid #e6b978;padding-bottom:16px}.hero h1{margin:0;font-size:38px;letter-spacing:-1px}.hero h1 small{font-size:18px;color:#a66a38;margin-left:14px}.hero p{margin:0;color:#776c5e;font-size:15px}.weekdays,.calendar{display:grid;grid-template-columns:repeat(7,1fr)}.weekdays{height:34px;align-items:center;text-align:center;font-weight:700;color:#8a684b}.calendar{height:607px;border-left:1px solid #eadfce;border-top:1px solid #eadfce}.day{min-width:0;border-right:1px solid #eadfce;border-bottom:1px solid #eadfce;padding:7px 8px;overflow:hidden;background:#fffdf8}.day:nth-child(7n),.day:nth-child(7n-1){background:#fff9ef}.day.outside{opacity:.34}.day header{display:flex;justify-content:space-between;align-items:center;margin-bottom:5px}.day header b{font-size:16px}.day header span{font-size:10px;color:#a47654}.meal{border-left:3px solid #a8c8a6;padding-left:6px;margin:5px 0}.meal-head{display:flex;align-items:center;justify-content:space-between;gap:4px;font-size:11px}.foods{font-size:10px;line-height:1.35;color:#5f5549}.new-food{display:inline-flex;margin-left:2px;border-radius:3px;padding:0 2px;background:#f5c992;color:#7a4f22;font-size:8px}.more,.overflow{color:#a66a38;font-size:9px}.status{font-style:normal;border-radius:99px;padding:1px 5px;font-size:8px;background:#eee}.status.completed{background:#ddecda;color:#397048}.status.partial{background:#fff0c9;color:#80631d}.status.skipped{background:#f5dddd;color:#985151}.detail-title{height:60px;display:flex;align-items:center;justify-content:space-between;border-bottom:3px solid #e6b978;font-size:22px}.detail-title b{font-size:13px;color:#8a684b}.detail-grid{display:grid;grid-template-columns:repeat(3,1fr);gap:12px;padding-top:18px}.detail-day{border:1px solid #eadfce;border-radius:10px;padding:10px;min-height:154px}.detail-day h3{margin:0 0 7px;color:#a66a38}.detail-meal{font-size:11px;line-height:1.45;border-top:1px dashed #eadfce;padding-top:5px;margin-top:5px}.detail-meal:first-of-type{border-top:0;margin-top:0}.detail-meal small{display:block;color:#7d7164}
    @media print{.page{width:297mm;height:210mm;padding:9.26mm 10.58mm}}
  </style></head><body><div class="page"><div class="hero"><h1>${escapeHtml(baby.name)}的辅食菜单 <small>${escapeHtml(year)}年${Number(monthNumber)}月</small></h1><p>${scope === "full" ? "计划与实际记录" : "计划菜单"} · 周一开始</p></div><div class="weekdays">${WEEKDAYS.map((day) => `<div>星期${day}</div>`).join("")}</div><div class="calendar">${cells}</div></div>${detailPages}</body></html>`;
  return { html, pageCount: 1 + detailGroups.length };
}
