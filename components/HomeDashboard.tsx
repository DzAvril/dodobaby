"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { ArrowRight, Baby as BabyIcon, CalendarDays, ChartNoAxesCombined, Milk, MoonStar, Pill, Syringe, Utensils } from "lucide-react";
import type { Baby } from "@/components/DiaryApp";
import type { FeedingDayResponse } from "@/components/FeedingTracker";
import type { GrowthRecord } from "@/components/GrowthTracker";
import type { VaccinationRecord } from "@/components/VaccinationTracker";
import type { DiaperDayResponse } from "@/components/DiaperTracker";
import type { SleepDayResponse } from "@/components/SleepTracker";
import type { MedicationDayResponse } from "@/components/MedicationTracker";
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

function durationText(minutes: number) {
  if (minutes < 1) return "不足 1 分钟";
  const hours = Math.floor(minutes / 60);
  const remainder = minutes % 60;
  return hours ? `${hours}小时${remainder ? `${remainder}分` : ""}` : `${remainder}分钟`;
}

export function HomeDashboard({ baby }: { baby: Baby }) {
  const today = todayInTimezone(baby.timezone);
  const [meals, setMeals] = useState<MealSummary[]>([]);
  const [growth, setGrowth] = useState<GrowthRecord[]>([]);
  const [feeding, setFeeding] = useState<FeedingDayResponse | null>(null);
  const [vaccines, setVaccines] = useState<VaccinationRecord[]>([]);
  const [diapers, setDiapers] = useState<DiaperDayResponse | null>(null);
  const [sleep, setSleep] = useState<SleepDayResponse | null>(null);
  const [medications, setMedications] = useState<MedicationDayResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [mealFailed, setMealFailed] = useState(false);
  const [growthFailed, setGrowthFailed] = useState(false);
  const [feedingFailed, setFeedingFailed] = useState(false);
  const [vaccineFailed, setVaccineFailed] = useState(false);
  const [diaperFailed, setDiaperFailed] = useState(false);
  const [sleepFailed, setSleepFailed] = useState(false);
  const [medicationFailed, setMedicationFailed] = useState(false);

  useEffect(() => {
    let active = true;
    Promise.allSettled([
      jsonRequest<{ meals: MealSummary[] }>(`/api/meals?month=${today.slice(0, 7)}`),
      jsonRequest<{ records: GrowthRecord[] }>("/api/growth"),
      jsonRequest<FeedingDayResponse>(`/api/feedings?date=${today}`),
      jsonRequest<SleepDayResponse>(`/api/sleeps?date=${today}`),
      jsonRequest<DiaperDayResponse>(`/api/diapers?date=${today}`),
      jsonRequest<{ records: VaccinationRecord[] }>("/api/vaccines"),
      jsonRequest<MedicationDayResponse>(`/api/medications?date=${today}`),
    ]).then(([mealResult, growthResult, feedingResult, sleepResult, diaperResult, vaccineResult, medicationResult]) => {
      if (!active) return;
      if (mealResult.status === "fulfilled") setMeals(mealResult.value.meals);
      else setMealFailed(true);
      if (growthResult.status === "fulfilled") setGrowth(growthResult.value.records);
      else setGrowthFailed(true);
      if (feedingResult.status === "fulfilled") setFeeding(feedingResult.value);
      else setFeedingFailed(true);
      if (sleepResult.status === "fulfilled") setSleep(sleepResult.value);
      else setSleepFailed(true);
      if (diaperResult.status === "fulfilled") setDiapers(diaperResult.value);
      else setDiaperFailed(true);
      if (vaccineResult.status === "fulfilled") setVaccines(vaccineResult.value.records);
      else setVaccineFailed(true);
      if (medicationResult.status === "fulfilled") setMedications(medicationResult.value);
      else setMedicationFailed(true);
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
    + (sleep?.summary.sessionCount ?? 0)
    + (diapers?.summary.totalCount ?? 0)
    + (medications?.records.length ?? 0)
    + growth.filter((record) => record.measuredDate === today).length
    + vaccines.filter((record) => record.plannedDate === today || record.administeredDate === today).length;
  const failedModuleCount = [mealFailed, feedingFailed, sleepFailed, diaperFailed, medicationFailed, growthFailed, vaccineFailed].filter(Boolean).length;
  const dueMedicationCount = medications?.duePlans.reduce((count, plan) => count + plan.scheduledTimes.length, 0) ?? 0;
  const completedMedicationCount = medications?.records.filter((record) => record.planId && record.scheduledTime).length ?? 0;

  return (
    <div className="module-page home-page">
      <header className="home-hero">
        <div><p className="eyebrow">TODAY WITH {baby.name.toUpperCase()}</p><h1>今天也一起，<br />好好照顾每个小变化。</h1><p>{baby.name}现在 {formatAge(baby.birthDate, today)}。首页只提供跨模块概览，详细记录分别留在各自页面。</p></div>
        <div className="home-date-card"><CalendarDays /><span>{today.replaceAll("-", ".")}</span><strong>{loading ? "正在整理今天的照护" : failedModuleCount === 7 ? "今日概览暂时无法加载" : todayActivityCount ? `今天有 ${todayActivityCount} 项照护动态` : failedModuleCount ? "今日动态尚未完整加载" : "今天还没有照护动态"}</strong><small>{failedModuleCount ? `${failedModuleCount} 个模块暂时无法加载` : "七类照护各自在独立页面记录"}</small></div>
      </header>

      <section className="home-module-section" aria-labelledby="daily-care-title"><div className="home-section-heading"><p className="eyebrow">DAILY CARE</p><h2 id="daily-care-title">日常记录</h2><span>高频照护，随手记下</span></div><div className="home-focus-grid daily">
        <article className="home-focus-card food"><div className="home-card-icon"><Utensils /></div><div><span>今日辅食</span><h2>{mealFailed ? "暂时无法加载" : loading ? "正在整理" : nextMeal ? nextMeal.plannedTime || "时间待定" : "还没有计划"}</h2><p>{mealFailed ? "其他照护模块仍可正常查看。" : loading ? "正在读取今日辅食计划。" : nextMeal ? nextMeal.items.slice(0, 3).map((item) => item.name).join("、") : "提前安排一餐，家人都能看到。"}</p></div><Link href="/food">查看辅食日记 <ArrowRight /></Link></article>
        <article className="home-focus-card feeding"><div className="home-card-icon"><Milk /></div><div><span>今日喂养</span><h2>{feedingFailed ? "暂时无法加载" : feeding ? `${feeding.summary.sessionCount} 次记录` : loading ? "正在整理" : "还没有记录"}</h2><p>{feedingFailed ? "其他照护模块仍可正常查看。" : loading ? "正在读取今日喂养记录。" : feeding?.summary.sessionCount ? `亲喂 ${feeding.summary.directMinutes} 分钟 · 瓶喂 ${feeding.summary.bottleMl} ml${feeding.latest ? ` · 最近 ${feeding.latest.startedTime}` : ""}` : "记录亲喂时长、母乳和配方奶量。"}</p></div><Link href="/feeding">查看喂养记录 <ArrowRight /></Link></article>
        <article className={`home-focus-card sleep${sleep?.active ? " active" : ""}`}><div className="home-card-icon"><MoonStar /></div><div><span>今日睡眠</span><h2>{sleepFailed ? "暂时无法加载" : sleep?.active ? "正在睡眠" : sleep ? durationText(sleep.summary.totalMinutes) : loading ? "正在整理" : "还没有记录"}</h2><p>{sleepFailed ? "其他照护模块仍可正常查看。" : loading ? "正在读取今日睡眠记录。" : sleep?.active ? `${sleep.active.startedTime} 开始 · 当前仍在睡眠` : sleep?.summary.sessionCount ? `${sleep.summary.sessionCount} 段 · 最长 ${durationText(sleep.summary.longestMinutes)}` : "记录入睡和醒来，跨午夜会按每天实际时长汇总。"}</p></div><Link href="/sleep">查看睡眠记录 <ArrowRight /></Link></article>
        <article className="home-focus-card diaper"><div className="home-card-icon"><BabyIcon /></div><div><span>今日尿布</span><h2>{diaperFailed ? "暂时无法加载" : diapers ? `${diapers.summary.totalCount} 次记录` : loading ? "正在整理" : "还没有记录"}</h2><p>{diaperFailed ? "其他照护模块仍可正常查看。" : loading ? "正在读取今日尿布记录。" : diapers?.summary.totalCount ? `小便 ${diapers.summary.wetCount} 次 · 大便 ${diapers.summary.dirtyCount} 次${diapers.latest ? ` · 最近 ${diapers.latest.changedTime}` : ""}` : "记录小便、大便与换尿布时的观察。"}</p></div><Link href="/diapers">查看尿布记录 <ArrowRight /></Link></article>
        <article className="home-focus-card medication"><div className="home-card-icon"><Pill /></div><div><span>今日用药</span><h2>{medicationFailed ? "暂时无法加载" : loading ? "正在整理" : dueMedicationCount ? `${completedMedicationCount}/${dueMedicationCount} 已登记` : medications?.records.length ? `${medications.records.length} 次记录` : "没有计划"}</h2><p>{medicationFailed ? "其他照护模块仍可正常查看。" : loading ? "正在读取今日用药安排。" : dueMedicationCount ? `今天有 ${dueMedicationCount} 个计划时间点。` : medications?.records.length ? "今天有临时用药记录。" : "按频率安排并登记实际用药。"}</p></div><Link href="/medications">查看用药记录 <ArrowRight /></Link></article>
      </div></section>

      <section className="home-module-section" aria-labelledby="health-records-title"><div className="home-section-heading"><p className="eyebrow">HEALTH RECORDS</p><h2 id="health-records-title">成长与健康</h2><span>低频档案，长期留存</span></div><div className="home-focus-grid health">
        <article className="home-focus-card growth"><div className="home-card-icon"><ChartNoAxesCombined /></div><div><span>最近生长</span><h2>{growthFailed ? "暂时无法加载" : loading ? "正在整理" : latestGrowth?.measuredDate ?? "等待第一次测量"}</h2><p>{growthFailed ? "其他照护模块仍可正常查看。" : loading ? "正在读取最近一次测量。" : metricText(latestGrowth)}</p></div><Link href="/growth">查看生长趋势 <ArrowRight /></Link></article>
        <article className="home-focus-card vaccine"><div className="home-card-icon"><Syringe /></div><div><span>疫苗记录</span><h2>{vaccineFailed ? "暂时无法加载" : loading ? "正在整理" : vaccinesToConfirm ? `${vaccinesToConfirm} 条待确认` : nextVaccine?.plannedDate ?? "暂无计划"}</h2><p>{vaccineFailed ? "其他照护模块仍可正常查看。" : loading ? "正在读取计划与接种事实。" : vaccinesToConfirm ? "计划日期已过，请根据接种事实更新记录。" : nextVaccine ? `${nextVaccine.vaccineName} · 第 ${nextVaccine.doseNumber} 剂${nextVaccine.plannedTime ? ` · ${nextVaccine.plannedTime}` : ""}` : "按家庭已有计划或接种记录自行添加。"}</p></div><Link href="/vaccines">查看疫苗记录 <ArrowRight /></Link></article>
      </div></section>
    </div>
  );
}
