"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { ArrowRight, CalendarDays, ChartNoAxesCombined, Milk, Syringe, Utensils } from "lucide-react";
import type { Baby } from "@/components/DiaryApp";
import type { FeedingDayResponse } from "@/components/FeedingTracker";
import type { GrowthRecord } from "@/components/GrowthTracker";
import type { VaccinationRecord } from "@/components/VaccinationTracker";
import { jsonRequest } from "@/lib/client-api";
import { formatAge, todayInTimezone } from "@/lib/dates";

type MealSummary = {
  id: string;
  mealDate: string;
  plannedTime: string | null;
  actualStatus: string;
  items: Array<{ name: string }>;
};

function metricText(record: GrowthRecord | undefined) {
  if (!record) return "还没有测量记录";
  return [
    record.weightKg != null ? `${record.weightKg}kg` : "",
    record.heightCm != null ? `${record.heightCm}cm` : "",
    record.headCircumferenceCm != null ? `头围 ${record.headCircumferenceCm}cm` : "",
  ].filter(Boolean).join(" · ");
}

export function HomeDashboard({ baby }: { baby: Baby }) {
  const today = todayInTimezone(baby.timezone);
  const [meals, setMeals] = useState<MealSummary[]>([]);
  const [growth, setGrowth] = useState<GrowthRecord[]>([]);
  const [feeding, setFeeding] = useState<FeedingDayResponse | null>(null);
  const [vaccines, setVaccines] = useState<VaccinationRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [mealFailed, setMealFailed] = useState(false);
  const [growthFailed, setGrowthFailed] = useState(false);
  const [feedingFailed, setFeedingFailed] = useState(false);
  const [vaccineFailed, setVaccineFailed] = useState(false);

  useEffect(() => {
    let active = true;
    Promise.allSettled([
      jsonRequest<{ meals: MealSummary[] }>(`/api/meals?month=${today.slice(0, 7)}`),
      jsonRequest<{ records: GrowthRecord[] }>("/api/growth"),
      jsonRequest<FeedingDayResponse>(`/api/feedings?date=${today}`),
      jsonRequest<{ records: VaccinationRecord[] }>("/api/vaccines"),
    ]).then(([mealResult, growthResult, feedingResult, vaccineResult]) => {
      if (!active) return;
      if (mealResult.status === "fulfilled") setMeals(mealResult.value.meals);
      else setMealFailed(true);
      if (growthResult.status === "fulfilled") setGrowth(growthResult.value.records);
      else setGrowthFailed(true);
      if (feedingResult.status === "fulfilled") setFeeding(feedingResult.value);
      else setFeedingFailed(true);
      if (vaccineResult.status === "fulfilled") setVaccines(vaccineResult.value.records);
      else setVaccineFailed(true);
    }).finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [today]);

  const todayMeals = useMemo(() => meals.filter((meal) => meal.mealDate === today), [meals, today]);
  const nextMeal = todayMeals.find((meal) => meal.actualStatus === "planned") ?? todayMeals[0];
  const latestGrowth = growth.at(-1);
  const nextVaccine = useMemo(() => vaccines
    .filter((record) => record.status === "planned" && record.plannedDate != null && record.plannedDate >= today)
    .sort((a, b) => `${a.plannedDate} ${a.plannedTime ?? "23:59"}`.localeCompare(`${b.plannedDate} ${b.plannedTime ?? "23:59"}`))[0], [vaccines, today]);
  const vaccinesToConfirm = useMemo(() => vaccines.filter((record) => record.status === "planned" && record.plannedDate != null && record.plannedDate < today).length, [vaccines, today]);
  const todayActivityCount = todayMeals.length
    + (feeding?.summary.sessionCount ?? 0)
    + growth.filter((record) => record.measuredDate === today).length
    + vaccines.filter((record) => record.plannedDate === today || record.administeredDate === today).length;
  const failedModuleCount = [mealFailed, feedingFailed, growthFailed, vaccineFailed].filter(Boolean).length;

  return (
    <div className="module-page home-page">
      <header className="home-hero">
        <div><p className="eyebrow">TODAY WITH {baby.name.toUpperCase()}</p><h1>今天也一起，<br />好好照顾每个小变化。</h1><p>{baby.name}现在 {formatAge(baby.birthDate, today)}。首页只提供跨模块概览，详细记录分别留在各自页面。</p></div>
        <div className="home-date-card"><CalendarDays /><span>{today.replaceAll("-", ".")}</span><strong>{loading ? "正在整理今天的照护" : failedModuleCount === 4 ? "今日概览暂时无法加载" : todayActivityCount ? `今天有 ${todayActivityCount} 项照护动态` : failedModuleCount ? "今日动态尚未完整加载" : "今天还没有照护动态"}</strong><small>{failedModuleCount ? `${failedModuleCount} 个模块暂时无法加载` : "辅食、喂养、生长与疫苗分别记录"}</small></div>
      </header>

      <section className="home-focus-grid" aria-label="今日照护概览">
        <article className="home-focus-card food"><div className="home-card-icon"><Utensils /></div><div><span>今日辅食</span><h2>{mealFailed ? "暂时无法加载" : loading ? "正在整理" : nextMeal ? nextMeal.plannedTime || "时间待定" : "还没有计划"}</h2><p>{mealFailed ? "其他照护模块仍可正常查看。" : loading ? "正在读取今日辅食计划。" : nextMeal ? nextMeal.items.slice(0, 3).map((item) => item.name).join("、") : "提前安排一餐，家人都能看到。"}</p></div><Link href="/food">查看辅食日记 <ArrowRight /></Link></article>
        <article className="home-focus-card feeding"><div className="home-card-icon"><Milk /></div><div><span>今日喂养</span><h2>{feedingFailed ? "暂时无法加载" : feeding ? `${feeding.summary.sessionCount} 次记录` : loading ? "正在整理" : "还没有记录"}</h2><p>{feedingFailed ? "其他照护模块仍可正常查看。" : loading ? "正在读取今日喂养记录。" : feeding?.summary.sessionCount ? `亲喂 ${feeding.summary.directMinutes} 分钟 · 瓶喂 ${feeding.summary.bottleMl} ml${feeding.latest ? ` · 最近 ${feeding.latest.startedTime}` : ""}` : "记录亲喂时长、母乳和配方奶量。"}</p></div><Link href="/feeding">查看喂养记录 <ArrowRight /></Link></article>
        <article className="home-focus-card growth"><div className="home-card-icon"><ChartNoAxesCombined /></div><div><span>最近生长</span><h2>{growthFailed ? "暂时无法加载" : loading ? "正在整理" : latestGrowth?.measuredDate ?? "等待第一次测量"}</h2><p>{growthFailed ? "其他照护模块仍可正常查看。" : loading ? "正在读取最近一次测量。" : metricText(latestGrowth)}</p></div><Link href="/growth">查看生长趋势 <ArrowRight /></Link></article>
        <article className="home-focus-card vaccine"><div className="home-card-icon"><Syringe /></div><div><span>疫苗记录</span><h2>{vaccineFailed ? "暂时无法加载" : loading ? "正在整理" : vaccinesToConfirm ? `${vaccinesToConfirm} 条待确认` : nextVaccine?.plannedDate ?? "暂无计划"}</h2><p>{vaccineFailed ? "其他照护模块仍可正常查看。" : loading ? "正在读取计划与接种事实。" : vaccinesToConfirm ? "计划日期已过，请根据接种事实更新记录。" : nextVaccine ? `${nextVaccine.vaccineName} · 第 ${nextVaccine.doseNumber} 剂${nextVaccine.plannedTime ? ` · ${nextVaccine.plannedTime}` : ""}` : "按家庭已有计划或接种记录自行添加。"}</p></div><Link href="/vaccines">查看疫苗记录 <ArrowRight /></Link></article>
      </section>
    </div>
  );
}
