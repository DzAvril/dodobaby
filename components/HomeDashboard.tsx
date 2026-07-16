"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import {
  ArrowRight,
  Baby as BabyIcon,
  BedDouble,
  CalendarDays,
  ChartNoAxesCombined,
  Check,
  CircleDashed,
  CircleDotDashed,
  Clock3,
  Droplets,
  Milk,
  MoonStar,
  Pill,
  Plus,
  Ruler,
  ShieldCheck,
  Sunrise,
  Syringe,
  Utensils,
  X,
} from "lucide-react";
import type { Baby, FoodCatalogItem, Meal } from "@/components/DiaryApp";
import type { FeedingDayResponse } from "@/components/FeedingTracker";
import type { GrowthRecord } from "@/components/GrowthTracker";
import type { VaccinationRecord } from "@/components/VaccinationTracker";
import type { DiaperDayResponse, DiaperType } from "@/components/DiaperTracker";
import type { SleepDayResponse } from "@/components/SleepTracker";
import type { MedicationDayResponse } from "@/components/MedicationTracker";
import { HomeQuickActionDialog, type HomeQuickEditor } from "@/components/HomeQuickActionDialog";
import { jsonRequest } from "@/lib/client-api";
import { currentMinuteInTimezone, todayInTimezone } from "@/lib/dates";
import { elapsedFeedingText, minutesSinceFeeding } from "@/lib/feeding-elapsed";

type QuickCard = "food" | "feeding" | "sleep" | "diaper" | "medication" | "growth" | "vaccine";
type QuickFeedback = { card: QuickCard; message: string; error: boolean };
type MealStatus = "completed" | "partial" | "skipped";

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

function dashboardDate(date: string) {
  return new Intl.DateTimeFormat("zh-CN", {
    year: "numeric",
    month: "long",
    day: "numeric",
    weekday: "long",
    timeZone: "UTC",
  }).format(new Date(`${date}T00:00:00Z`));
}

function medicationDose(amount: number, unit: string) {
  return `${Number.isInteger(amount) ? amount : Number(amount.toFixed(2))}${unit}`;
}

function HomeCardDetailLink({ href, label }: { href: string; label: string }) {
  return <Link className="home-card-detail-link" href={href} aria-label={label} title={label}><ArrowRight /></Link>;
}

export function HomeDashboard({ baby }: { baby: Baby }) {
  const today = todayInTimezone(baby.timezone);
  const [meals, setMeals] = useState<Meal[]>([]);
  const [foods, setFoods] = useState<FoodCatalogItem[]>([]);
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
  const [quickPending, setQuickPending] = useState<string | null>(null);
  const [quickFeedback, setQuickFeedback] = useState<QuickFeedback | null>(null);
  const [editor, setEditor] = useState<HomeQuickEditor | null>(null);
  const [clock, setClock] = useState(() => new Date());
  const openerRef = useRef<HTMLElement | null>(null);

  useEffect(() => {
    const timer = window.setInterval(() => setClock(new Date()), 30_000);
    return () => window.clearInterval(timer);
  }, []);

  useEffect(() => {
    if (!quickFeedback) return;
    const timer = window.setTimeout(() => setQuickFeedback(null), 4_000);
    return () => window.clearTimeout(timer);
  }, [quickFeedback]);

  useEffect(() => {
    let active = true;
    Promise.allSettled([
      jsonRequest<{ meals: Meal[] }>(`/api/meals?month=${today.slice(0, 7)}`),
      jsonRequest<{ records: GrowthRecord[] }>("/api/growth"),
      jsonRequest<FeedingDayResponse>(`/api/feedings?date=${today}`),
      jsonRequest<SleepDayResponse>(`/api/sleeps?date=${today}`),
      jsonRequest<DiaperDayResponse>(`/api/diapers?date=${today}`),
      jsonRequest<{ records: VaccinationRecord[] }>("/api/vaccines"),
      jsonRequest<MedicationDayResponse>(`/api/medications?date=${today}`),
      jsonRequest<{ foods: FoodCatalogItem[] }>("/api/foods"),
    ]).then(([mealResult, growthResult, feedingResult, sleepResult, diaperResult, vaccineResult, medicationResult, foodResult]) => {
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
      if (foodResult.status === "fulfilled") setFoods(foodResult.value.foods);
    }).finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [today]);

  const todayMeals = useMemo(() => meals.filter((meal) => meal.mealDate === today), [meals, today]);
  const nextMeal = todayMeals.find((meal) => meal.actualStatus === "planned") ?? todayMeals[0];
  const latestGrowth = growth.at(-1);
  const vaccineToConfirm = useMemo(() => vaccines
    .filter((record) => record.status === "planned" && record.plannedDate != null && record.plannedDate < today)
    .sort((a, b) => `${a.plannedDate} ${a.plannedTime ?? "23:59"}`.localeCompare(`${b.plannedDate} ${b.plannedTime ?? "23:59"}`))[0], [vaccines, today]);
  const nextVaccine = useMemo(() => vaccines
    .filter((record) => record.status === "planned" && record.plannedDate != null && record.plannedDate >= today)
    .sort((a, b) => `${a.plannedDate} ${a.plannedTime ?? "23:59"}`.localeCompare(`${b.plannedDate} ${b.plannedTime ?? "23:59"}`))[0], [vaccines, today]);
  const vaccinesToConfirm = useMemo(() => vaccines.filter((record) => record.status === "planned" && record.plannedDate != null && record.plannedDate < today).length, [vaccines, today]);
  const medicationOccurrences = useMemo(() => (medications?.duePlans ?? []).flatMap((plan) => plan.scheduledTimes.map((scheduledTime) => ({
    plan,
    scheduledTime,
    record: medications?.records.find((record) => record.planId === plan.id && record.scheduledTime === scheduledTime) ?? null,
  }))), [medications]);
  const completedMedicationItems = medicationOccurrences
    .filter((occurrence) => occurrence.record)
    .map((occurrence) => occurrence.plan.medicationName);
  const pendingMedicationOccurrences = medicationOccurrences.filter((occurrence) => !occurrence.record);
  const pendingMedicationItems = pendingMedicationOccurrences.map((occurrence) => occurrence.plan.medicationName);
  const feedingElapsed = useMemo(() => {
    if (!feeding?.latest) return null;
    try {
      return elapsedFeedingText(minutesSinceFeeding(feeding.latest, baby.timezone, clock));
    } catch {
      return null;
    }
  }, [baby.timezone, clock, feeding]);
  const latestFeedingTime = feeding?.latest
    ? `${feeding.latest.feedingDate === today ? "今天" : feeding.latest.feedingDate.slice(5)} ${feeding.latest.startedTime}`
    : null;
  const feedingSummaryText = feeding?.latest ? [
    `今天 ${feeding.summary.sessionCount} 次`,
    feeding.summary.directMinutes > 0 ? `亲喂 ${feeding.summary.directMinutes} 分钟` : "",
    feeding.summary.bottleMl > 0 ? `瓶喂 ${feeding.summary.bottleMl} ml` : "",
    `最近 ${latestFeedingTime}`,
  ].filter(Boolean).join(" · ") : "记录亲喂时长、母乳和配方奶量。";
  const diaperHeadline = diapers?.summary.totalCount
    ? [
        diapers.summary.wetCount > 0 ? `小便 ${diapers.summary.wetCount}` : "",
        diapers.summary.dirtyCount > 0 ? `大便 ${diapers.summary.dirtyCount}` : "",
      ].filter(Boolean).join(" · ")
    : "还没有记录";
  const medicationHeadline = medicationOccurrences.length
    ? [
        completedMedicationItems.length ? `已服 ${completedMedicationItems.join("、")}` : "",
        pendingMedicationItems.length ? `待服 ${pendingMedicationItems.join("、")}` : "",
      ].filter(Boolean).join(" · ")
    : medications?.records.length
      ? `${medications.records.map((record) => record.medicationName).join("、")} 已服`
      : "没有计划";

  async function refreshMeals() {
    const data = await jsonRequest<{ meals: Meal[] }>(`/api/meals?month=${today.slice(0, 7)}`);
    setMeals(data.meals);
    setMealFailed(false);
  }

  async function refreshFeeding() {
    setFeeding(await jsonRequest<FeedingDayResponse>(`/api/feedings?date=${today}`));
    setFeedingFailed(false);
    setClock(new Date());
  }

  async function refreshSleep() {
    setSleep(await jsonRequest<SleepDayResponse>(`/api/sleeps?date=${today}`));
    setSleepFailed(false);
  }

  async function refreshDiapers() {
    setDiapers(await jsonRequest<DiaperDayResponse>(`/api/diapers?date=${today}`));
    setDiaperFailed(false);
  }

  async function refreshMedications() {
    setMedications(await jsonRequest<MedicationDayResponse>(`/api/medications?date=${today}`));
    setMedicationFailed(false);
  }

  async function refreshGrowth() {
    const data = await jsonRequest<{ records: GrowthRecord[] }>("/api/growth");
    setGrowth(data.records);
    setGrowthFailed(false);
  }

  async function refreshVaccines() {
    const data = await jsonRequest<{ records: VaccinationRecord[] }>("/api/vaccines");
    setVaccines(data.records);
    setVaccineFailed(false);
  }

  function openEditor(nextEditor: HomeQuickEditor) {
    openerRef.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    setQuickFeedback(null);
    setEditor(nextEditor);
  }

  function closeEditor() {
    setEditor(null);
    window.requestAnimationFrame(() => openerRef.current?.focus());
  }

  async function editorSaved(section: HomeQuickEditor["kind"]) {
    const refreshers: Record<HomeQuickEditor["kind"], () => Promise<void>> = {
      meal: refreshMeals,
      feeding: refreshFeeding,
      sleep: refreshSleep,
      diaper: refreshDiapers,
      medication: refreshMedications,
      growth: refreshGrowth,
      vaccine: refreshVaccines,
    };
    const cards: Record<HomeQuickEditor["kind"], QuickCard> = {
      meal: "food",
      feeding: "feeding",
      sleep: "sleep",
      diaper: "diaper",
      medication: "medication",
      growth: "growth",
      vaccine: "vaccine",
    };
    await refreshers[section]();
    setQuickFeedback({ card: cards[section], message: "记录已保存", error: false });
  }

  async function runQuickAction(card: QuickCard, id: string, successMessage: string, action: () => Promise<unknown>, refresh: () => Promise<void>) {
    setQuickPending(id);
    setQuickFeedback(null);
    try {
      await action();
      await refresh();
      setQuickFeedback({ card, message: successMessage, error: false });
    } catch (caught) {
      setQuickFeedback({ card, message: caught instanceof Error ? caught.message : "操作失败，请稍后重试", error: true });
    } finally {
      setQuickPending(null);
    }
  }

  function markMeal(meal: Meal, status: MealStatus) {
    const now = currentMinuteInTimezone(baby.timezone);
    const labels: Record<MealStatus, string> = { completed: "已登记吃完", partial: "已登记部分吃", skipped: "已登记未吃" };
    return runQuickAction("food", `meal-${meal.id}-${status}`, labels[status], () => jsonRequest(`/api/meals/${meal.id}`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        mealDate: meal.mealDate,
        mealType: meal.mealType,
        customMealType: meal.customMealType,
        plannedTime: meal.plannedTime,
        planNote: meal.planNote,
        actualStatus: status,
        actualTime: now.time,
        actualNote: meal.actualNote,
        reactionTags: meal.reactionTags,
        items: meal.items.map((item) => ({
          name: item.name,
          amount: item.amount,
          unit: item.unit,
          preparation: item.preparation,
          isFirstTry: item.isFirstTry,
        })),
      }),
    }), refreshMeals);
  }

  function toggleSleep() {
    const active = sleep?.active;
    const now = currentMinuteInTimezone(baby.timezone);
    return runQuickAction("sleep", "sleep-toggle", active ? "已记录醒来" : "已开始计时", () => active
      ? jsonRequest(`/api/sleeps/${active.id}/end`, { method: "POST" })
      : jsonRequest("/api/sleeps", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ startedDate: now.date, startedTime: now.time, endedDate: null, endedTime: null, note: null }),
        }), refreshSleep);
  }

  function recordDiaper(diaperType: DiaperType) {
    const now = currentMinuteInTimezone(baby.timezone);
    const labels: Record<DiaperType, string> = { wet: "已记录小便", dirty: "已记录大便", both: "已记录小便和大便" };
    return runQuickAction("diaper", `diaper-${diaperType}`, labels[diaperType], () => jsonRequest("/api/diapers", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        diaperDate: now.date,
        changedTime: now.time,
        diaperType,
        urineAmount: null,
        stoolAmount: null,
        stoolColor: null,
        stoolConsistency: null,
        skinObservation: null,
        photoDataUrl: null,
        note: null,
      }),
    }), refreshDiapers);
  }

  function recordMedication(occurrence: (typeof pendingMedicationOccurrences)[number]) {
    const now = currentMinuteInTimezone(baby.timezone);
    return runQuickAction("medication", `medication-${occurrence.plan.id}-${occurrence.scheduledTime}`, `已登记 ${occurrence.plan.medicationName} ${medicationDose(occurrence.plan.doseAmount, occurrence.plan.doseUnit)}`, () => jsonRequest("/api/medications", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        planId: occurrence.plan.id,
        scheduledTime: occurrence.scheduledTime,
        medicationName: null,
        doseAmount: null,
        doseUnit: null,
        takenDate: today,
        takenTime: now.time,
        note: null,
      }),
    }), refreshMedications);
  }

  function feedback(card: QuickCard) {
    if (quickFeedback?.card !== card) return null;
    return <p className={`home-card-feedback${quickFeedback.error ? " error" : ""}`} role={quickFeedback.error ? "alert" : "status"}>{quickFeedback.message}</p>;
  }

  const actionsDisabled = loading || quickPending !== null;
  const vaccineQuickRecord = vaccineToConfirm ?? nextVaccine ?? null;

  return (
    <div className="module-page home-page">
      <header className="home-date-header">
        <CalendarDays aria-hidden="true" />
        <time dateTime={today}>{dashboardDate(today)}</time>
      </header>

      <section className="home-module-section" aria-labelledby="daily-care-title">
        <div className="home-section-heading"><p className="eyebrow">DAILY CARE</p><h2 id="daily-care-title">日常记录</h2><span>高频照护，随手记下</span></div>
        <div className="home-focus-grid daily">
          <article className="home-focus-card food">
            <div className="home-card-icon"><Utensils /></div>
            <div className="home-card-copy"><span>今日辅食</span><h2>{mealFailed ? "暂时无法加载" : loading ? "正在整理" : nextMeal ? nextMeal.plannedTime || "时间待定" : "还没有计划"}</h2><p>{mealFailed ? "其他照护模块仍可正常查看。" : loading ? "正在读取今日辅食计划。" : nextMeal ? nextMeal.items.slice(0, 3).map((item) => item.name).join("、") : "提前安排一餐，家人都能看到。"}</p></div>
            <HomeCardDetailLink href="/food" label="查看辅食日记" />
            <div className="home-card-quick-area"><div className="home-card-quick-actions food-actions">{nextMeal?.actualStatus === "planned" ? <><button type="button" disabled={actionsDisabled || mealFailed} onClick={() => markMeal(nextMeal, "completed")}><Check />{quickPending === `meal-${nextMeal.id}-completed` ? "记录中" : "吃完"}</button><button type="button" disabled={actionsDisabled || mealFailed} onClick={() => markMeal(nextMeal, "partial")}><CircleDashed />{quickPending === `meal-${nextMeal.id}-partial` ? "记录中" : "部分"}</button><button type="button" disabled={actionsDisabled || mealFailed} onClick={() => markMeal(nextMeal, "skipped")}><X />{quickPending === `meal-${nextMeal.id}-skipped` ? "记录中" : "未吃"}</button></> : <button type="button" aria-label={todayMeals.length ? "再记一餐辅食" : "安排辅食"} disabled={actionsDisabled || mealFailed} onClick={() => openEditor({ kind: "meal" })}><Plus />{todayMeals.length ? "再记" : "安排"}</button>}</div>{feedback("food")}</div>
          </article>

          <article className="home-focus-card feeding">
            <div className="home-card-icon"><Milk /></div>
            <div className="home-card-copy"><span>今日喂养</span><h2>{feedingFailed ? "暂时无法加载" : loading ? "正在整理" : feedingElapsed ? `距上次 ${feedingElapsed}` : "还没有记录"}</h2><p>{feedingFailed ? "其他照护模块仍可正常查看。" : loading ? "正在读取今日喂养记录。" : feedingSummaryText}</p></div>
            <HomeCardDetailLink href="/feeding" label="查看喂养记录" />
            <div className="home-card-quick-area"><div className="home-card-quick-actions"><button type="button" aria-label="记录一次喂养" disabled={actionsDisabled || feedingFailed} onClick={() => openEditor({ kind: "feeding" })}><Plus />记录</button></div>{feedback("feeding")}</div>
          </article>

          <article className={`home-focus-card sleep${sleep?.active ? " active" : ""}`}>
            <div className="home-card-icon"><MoonStar /></div>
            <div className="home-card-copy"><span>今日睡眠</span><h2>{sleepFailed ? "暂时无法加载" : sleep?.active ? "正在睡眠" : sleep ? durationText(sleep.summary.totalMinutes) : loading ? "正在整理" : "还没有记录"}</h2><p>{sleepFailed ? "其他照护模块仍可正常查看。" : loading ? "正在读取今日睡眠记录。" : sleep?.active ? `${sleep.active.startedTime} 开始 · 当前仍在睡眠` : sleep?.summary.sessionCount ? `${sleep.summary.sessionCount} 段 · 最长 ${durationText(sleep.summary.longestMinutes)}` : "记录入睡和醒来，跨午夜会按每天实际时长汇总。"}</p></div>
            <HomeCardDetailLink href="/sleep" label="查看睡眠记录" />
            <div className="home-card-quick-area"><div className="home-card-quick-actions"><button type="button" aria-label={sleep?.active ? "记录醒来" : "开始睡眠"} disabled={actionsDisabled || sleepFailed} onClick={toggleSleep}>{sleep?.active ? <Sunrise /> : <BedDouble />}{quickPending === "sleep-toggle" ? "记录中" : sleep?.active ? "醒来" : "入睡"}</button><button type="button" disabled={actionsDisabled || sleepFailed || Boolean(sleep?.active)} onClick={() => openEditor({ kind: "sleep" })}><Clock3 />补录</button></div>{feedback("sleep")}</div>
          </article>

          <article className="home-focus-card diaper">
            <div className="home-card-icon"><BabyIcon /></div>
            <div className="home-card-copy"><span>今日尿布</span><h2>{diaperFailed ? "暂时无法加载" : loading ? "正在整理" : diaperHeadline}</h2><p>{diaperFailed ? "其他照护模块仍可正常查看。" : loading ? "正在读取今日尿布记录。" : diapers?.summary.totalCount ? `共 ${diapers.summary.totalCount} 次换尿布${diapers.latest ? ` · 最近 ${diapers.latest.changedTime}` : ""}` : "记录小便、大便与换尿布时的观察。"}</p></div>
            <HomeCardDetailLink href="/diapers" label="查看尿布记录" />
            <div className="home-card-quick-area"><div className="home-card-quick-actions diaper-actions"><button type="button" className="icon-only" aria-label={quickPending === "diaper-wet" ? "正在记录小便" : "记录小便"} title="记录小便" disabled={actionsDisabled || diaperFailed} onClick={() => recordDiaper("wet")}><Droplets /></button><button type="button" className="icon-only" aria-label={quickPending === "diaper-dirty" ? "正在记录大便" : "记录大便"} title="记录大便" disabled={actionsDisabled || diaperFailed} onClick={() => recordDiaper("dirty")}><CircleDotDashed /></button><button type="button" className="icon-only" aria-label={quickPending === "diaper-both" ? "正在记录小便和大便" : "记录小便和大便"} title="记录小便和大便" disabled={actionsDisabled || diaperFailed} onClick={() => recordDiaper("both")}><BabyIcon /></button><button type="button" className="icon-only" aria-label="详细记录尿布" title="详细记录尿布" disabled={actionsDisabled || diaperFailed} onClick={() => openEditor({ kind: "diaper", preset: "wet" })}><Plus /></button></div>{feedback("diaper")}</div>
          </article>

          <article className="home-focus-card medication">
            <div className="home-card-icon"><Pill /></div>
            <div className="home-card-copy"><span>今日用药</span><h2>{medicationFailed ? "暂时无法加载" : loading ? "正在整理" : medicationHeadline}</h2><p>{medicationFailed ? "其他照护模块仍可正常查看。" : loading ? "正在读取今日用药安排。" : medicationOccurrences.length ? `计划 ${medicationOccurrences.length} 次 · 已服 ${completedMedicationItems.length} 次 · 待服 ${pendingMedicationItems.length} 次` : medications?.records.length ? "今天有临时用药记录。" : "按频率安排并登记实际用药。"}</p></div>
            <HomeCardDetailLink href="/medications" label="查看用药记录" />
            <div className="home-card-quick-area"><div className="home-card-quick-actions medication-actions">{pendingMedicationOccurrences.map((occurrence) => <button key={`${occurrence.plan.id}-${occurrence.scheduledTime}`} type="button" title={`${occurrence.plan.medicationName} ${medicationDose(occurrence.plan.doseAmount, occurrence.plan.doseUnit)}，计划 ${occurrence.scheduledTime}`} disabled={actionsDisabled || medicationFailed} onClick={() => recordMedication(occurrence)}><Check />{quickPending === `medication-${occurrence.plan.id}-${occurrence.scheduledTime}` ? "登记中" : `${occurrence.plan.medicationName} ${medicationDose(occurrence.plan.doseAmount, occurrence.plan.doseUnit)} · ${occurrence.scheduledTime}`}</button>)}<button type="button" aria-label="补记用药" className="quiet" disabled={actionsDisabled || medicationFailed} onClick={() => openEditor({ kind: "medication" })}><Plus />补记</button></div>{feedback("medication")}</div>
          </article>
        </div>
      </section>

      <section className="home-module-section" aria-labelledby="health-records-title">
        <div className="home-section-heading"><p className="eyebrow">HEALTH RECORDS</p><h2 id="health-records-title">成长与健康</h2><span>低频档案，长期留存</span></div>
        <div className="home-focus-grid health">
          <article className="home-focus-card growth">
            <div className="home-card-icon"><ChartNoAxesCombined /></div>
            <div className="home-card-copy"><span>最近生长</span><h2>{growthFailed ? "暂时无法加载" : loading ? "正在整理" : latestGrowth?.measuredDate ?? "等待第一次测量"}</h2><p>{growthFailed ? "其他照护模块仍可正常查看。" : loading ? "正在读取最近一次测量。" : metricText(latestGrowth)}</p></div>
            <HomeCardDetailLink href="/growth" label="查看生长趋势" />
            <div className="home-card-quick-area"><div className="home-card-quick-actions"><button type="button" aria-label="记录测量" disabled={actionsDisabled || growthFailed} onClick={() => openEditor({ kind: "growth" })}><Ruler />测量</button></div>{feedback("growth")}</div>
          </article>
          <article className="home-focus-card vaccine">
            <div className="home-card-icon"><Syringe /></div>
            <div className="home-card-copy"><span>疫苗记录</span><h2>{vaccineFailed ? "暂时无法加载" : loading ? "正在整理" : vaccinesToConfirm ? `${vaccinesToConfirm} 条待确认` : nextVaccine?.plannedDate ?? "暂无计划"}</h2><p>{vaccineFailed ? "其他照护模块仍可正常查看。" : loading ? "正在读取计划与接种事实。" : vaccinesToConfirm ? "计划日期已过，请根据接种事实更新记录。" : nextVaccine ? `${nextVaccine.vaccineName} · 第 ${nextVaccine.doseNumber} 剂${nextVaccine.plannedTime ? ` · ${nextVaccine.plannedTime}` : ""}` : "按家庭已有计划或接种记录自行添加。"}</p></div>
            <HomeCardDetailLink href="/vaccines" label="查看疫苗记录" />
            <div className="home-card-quick-area"><div className="home-card-quick-actions"><button type="button" aria-label={vaccineQuickRecord ? "登记已接种" : "添加疫苗记录"} disabled={actionsDisabled || vaccineFailed} onClick={() => openEditor({ kind: "vaccine", record: vaccineQuickRecord, markCompleted: Boolean(vaccineQuickRecord) })}>{vaccineQuickRecord ? <ShieldCheck /> : <Plus />}{vaccineQuickRecord ? "登记" : "添加"}</button></div>{feedback("vaccine")}</div>
          </article>
        </div>
      </section>

      <HomeQuickActionDialog baby={baby} date={today} editor={editor} foods={foods} onClose={closeEditor} onSaved={editorSaved} />
    </div>
  );
}
