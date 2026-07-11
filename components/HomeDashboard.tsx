"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { ArrowRight, CalendarDays, ChartNoAxesCombined, Milk, Utensils } from "lucide-react";
import type { Baby } from "@/components/DiaryApp";
import type { FeedingDayResponse } from "@/components/FeedingTracker";
import type { GrowthRecord } from "@/components/GrowthTracker";
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
  const [loading, setLoading] = useState(true);
  const [mealFailed, setMealFailed] = useState(false);
  const [growthFailed, setGrowthFailed] = useState(false);
  const [feedingFailed, setFeedingFailed] = useState(false);

  useEffect(() => {
    let active = true;
    Promise.allSettled([
      jsonRequest<{ meals: MealSummary[] }>(`/api/meals?month=${today.slice(0, 7)}`),
      jsonRequest<{ records: GrowthRecord[] }>("/api/growth"),
      jsonRequest<FeedingDayResponse>(`/api/feedings?date=${today}`),
    ]).then(([mealResult, growthResult, feedingResult]) => {
      if (!active) return;
      if (mealResult.status === "fulfilled") setMeals(mealResult.value.meals);
      else setMealFailed(true);
      if (growthResult.status === "fulfilled") setGrowth(growthResult.value.records);
      else setGrowthFailed(true);
      if (feedingResult.status === "fulfilled") setFeeding(feedingResult.value);
      else setFeedingFailed(true);
    }).finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [today]);

  const todayMeals = useMemo(() => meals.filter((meal) => meal.mealDate === today), [meals, today]);
  const nextMeal = todayMeals.find((meal) => meal.actualStatus === "planned") ?? todayMeals[0];
  const latestGrowth = growth.at(-1);

  return (
    <div className="module-page home-page">
      <header className="home-hero">
        <div><p className="eyebrow">TODAY WITH {baby.name.toUpperCase()}</p><h1>今天也一起，<br />好好照顾每个小变化。</h1><p>{baby.name}现在 {formatAge(baby.birthDate, today)}。首页只提供跨模块概览，详细记录分别留在各自页面。</p></div>
        <div className="home-date-card"><CalendarDays /><span>{today.replaceAll("-", ".")}</span><strong>{loading ? "正在整理今日记录" : mealFailed ? "辅食概览暂时无法加载" : `今天有 ${todayMeals.length} 餐辅食计划`}</strong></div>
      </header>

      <section className="home-focus-grid" aria-label="今日照护概览">
        <article className="home-focus-card food"><div className="home-card-icon"><Utensils /></div><div><span>今日辅食</span><h2>{mealFailed ? "暂时无法加载" : nextMeal ? nextMeal.plannedTime || "时间待定" : "还没有计划"}</h2><p>{mealFailed ? "其他照护模块仍可正常查看。" : nextMeal ? nextMeal.items.slice(0, 3).map((item) => item.name).join("、") : "提前安排一餐，家人都能看到。"}</p></div><Link href="/food">查看辅食日记 <ArrowRight /></Link></article>
        <article className="home-focus-card feeding"><div className="home-card-icon"><Milk /></div><div><span>今日喂养</span><h2>{feedingFailed ? "暂时无法加载" : feeding ? `${feeding.summary.sessionCount} 次记录` : loading ? "正在整理" : "还没有记录"}</h2><p>{feedingFailed ? "其他照护模块仍可正常查看。" : feeding?.summary.sessionCount ? `亲喂 ${feeding.summary.directMinutes} 分钟 · 瓶喂 ${feeding.summary.bottleMl} ml${feeding.latest ? ` · 最近 ${feeding.latest.startedTime}` : ""}` : "记录亲喂时长、母乳和配方奶量。"}</p></div><Link href="/feeding">查看喂养记录 <ArrowRight /></Link></article>
        <article className="home-focus-card growth"><div className="home-card-icon"><ChartNoAxesCombined /></div><div><span>最近生长</span><h2>{growthFailed ? "暂时无法加载" : latestGrowth?.measuredDate ?? "等待第一次测量"}</h2><p>{growthFailed ? "其他照护模块仍可正常查看。" : metricText(latestGrowth)}</p></div><Link href="/growth">查看生长趋势 <ArrowRight /></Link></article>
      </section>

      <section className="home-modules">
        <div className="home-section-heading"><div><p className="eyebrow">CARE MODULES</p><h2>每件事，都有自己的位置</h2></div><p>避免把不同照护记录揉在同一条时间线里，需要时再进入对应模块。</p></div>
        <div className="module-card-grid">
          <Link href="/food" className="module-card"><span className="module-card-icon food"><Utensils /></span><div><strong>辅食日记</strong><p>月历计划、多餐记录、食材与宝宝反应。</p></div><ArrowRight /></Link>
          <Link href="/feeding" className="module-card"><span className="module-card-icon feeding"><Milk /></span><div><strong>喂养记录</strong><p>亲喂时长、瓶喂奶量与每日时间线。</p></div><ArrowRight /></Link>
          <Link href="/growth" className="module-card"><span className="module-card-icon growth"><ChartNoAxesCombined /></span><div><strong>生长记录</strong><p>体重、身高、头围和个人趋势曲线。</p></div><ArrowRight /></Link>
        </div>
      </section>
    </div>
  );
}
