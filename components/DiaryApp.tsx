"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Baby as BabyIcon,
  CalendarDays,
  Check,
  ChevronLeft,
  ChevronRight,
  CirclePlus,
  ClipboardCopy,
  Download,
  FileImage,
  FileJson,
  FileSpreadsheet,
  FileText,
  Pencil,
  Plus,
  Search,
  SlidersHorizontal,
  Trash2,
  X,
} from "lucide-react";
import { addDays, formatAge, getMonthGrid, getWeekDates, todayInTimezone } from "@/lib/dates";
import { jsonRequest } from "@/lib/client-api";

export type BabySex = "male" | "female" | "unknown";
export type Baby = { id: string; name: string; birthDate: string; sex?: BabySex; timezone: string };
export type FoodCatalogItem = { id: string; name: string; defaultUnit: string | null };
export type MealItem = {
  id?: string;
  name: string;
  amount: number | null;
  unit: string | null;
  preparation: string | null;
  isFirstTry: boolean;
};
export type Meal = {
  id: string;
  mealDate: string;
  mealType: string;
  customMealType: string | null;
  plannedTime: string | null;
  planNote: string | null;
  actualStatus: string;
  actualTime: string | null;
  actualNote: string | null;
  items: MealItem[];
  reactionTags: string[];
};

const MEAL_TYPES = [
  ["breakfast", "早餐"],
  ["morning_snack", "上午加餐"],
  ["lunch", "午餐"],
  ["afternoon_snack", "下午加餐"],
  ["dinner", "晚餐"],
  ["custom", "自定义"],
] as const;
const MEAL_LABELS = Object.fromEntries(MEAL_TYPES);
const STATUS_OPTIONS = [
  ["planned", "待记录"],
  ["completed", "吃完"],
  ["partial", "部分吃"],
  ["skipped", "未吃"],
] as const;
const STATUS_LABELS = Object.fromEntries(STATUS_OPTIONS);
const REACTION_OPTIONS = [
  ["normal", "无异常"],
  ["liked", "喜欢"],
  ["disliked", "不喜欢"],
  ["rash", "皮疹"],
  ["vomit", "呕吐"],
  ["diarrhea", "腹泻"],
  ["constipation", "便秘"],
  ["other", "其他"],
] as const;
const REACTION_LABELS = Object.fromEntries(REACTION_OPTIONS);
const WEEKDAYS = ["周一", "周二", "周三", "周四", "周五", "周六", "周日"];
const UNITS = ["g", "ml", "勺", "滴", "块", "个", "份"];
type CalendarView = "month" | "week" | "day";
const CALENDAR_VIEW_LABELS: Record<CalendarView, string> = { month: "月", week: "周", day: "天" };

function shiftMonth(month: string, amount: number) {
  const [year, monthNumber] = month.split("-").map(Number);
  const date = new Date(Date.UTC(year, monthNumber - 1 + amount, 1));
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, "0")}`;
}

function monthTitle(month: string) {
  const [year, monthNumber] = month.split("-");
  return `${year}年 ${Number(monthNumber)}月`;
}

function dateTitle(date: string) {
  const parsed = new Date(`${date}T00:00:00Z`);
  return `${parsed.getUTCMonth() + 1}月${parsed.getUTCDate()}日 ${WEEKDAYS[(parsed.getUTCDay() + 6) % 7]}`;
}

function calendarPeriodTitle(view: CalendarView, anchorDate: string) {
  if (view === "month") return monthTitle(anchorDate.slice(0, 7));
  if (view === "day") {
    const parsed = new Date(`${anchorDate}T00:00:00Z`);
    return `${parsed.getUTCFullYear()}年${parsed.getUTCMonth() + 1}月${parsed.getUTCDate()}日`;
  }
  const dates = getWeekDates(anchorDate);
  const start = new Date(`${dates[0]}T00:00:00Z`);
  const end = new Date(`${dates[6]}T00:00:00Z`);
  const endLabel = start.getUTCFullYear() === end.getUTCFullYear() && start.getUTCMonth() === end.getUTCMonth()
    ? `${end.getUTCDate()}日`
    : start.getUTCFullYear() === end.getUTCFullYear()
      ? `${end.getUTCMonth() + 1}月${end.getUTCDate()}日`
      : `${end.getUTCFullYear()}年${end.getUTCMonth() + 1}月${end.getUTCDate()}日`;
  return `${start.getUTCFullYear()}年${start.getUTCMonth() + 1}月${start.getUTCDate()}日 - ${endLabel}`;
}

function mealLabel(meal: Meal) {
  return meal.customMealType || MEAL_LABELS[meal.mealType] || "辅食";
}

function itemText(item: MealItem) {
  const amount = item.amount == null ? "" : Number.isInteger(item.amount) ? String(item.amount) : String(Number(item.amount.toFixed(2)));
  return `${item.name}${amount}${item.unit || ""}`;
}

async function fetchMealsForMonths(monthsKey: string) {
  const responses = await Promise.all(monthsKey.split(",").map((month) => jsonRequest<{ meals: Meal[] }>(`/api/meals?month=${month}`)));
  return responses.flatMap((response) => response.meals);
}

export function BabyForm({ baby, onSaved }: { baby?: Baby | null; onSaved: (baby: Baby) => void }) {
  const [name, setName] = useState(baby?.name ?? "");
  const [birthDate, setBirthDate] = useState(baby?.birthDate ?? "");
  const [sex, setSex] = useState<BabySex>(baby?.sex ?? "unknown");
  const [error, setError] = useState("");
  const [pending, setPending] = useState(false);

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setPending(true);
    setError("");
    try {
      const data = await jsonRequest<{ baby: Baby }>("/api/baby", {
        method: baby ? "PATCH" : "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ name, birthDate, sex, timezone: "Asia/Shanghai" }),
      });
      onSaved(data.baby);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "保存失败");
    } finally {
      setPending(false);
    }
  }

  return (
    <form className="baby-form" onSubmit={submit}>
      <div className="form-heading">
        <div className="soft-icon"><BabyIcon size={22} /></div>
        <div><p className="eyebrow">BABY PROFILE</p><h2>{baby ? "宝宝资料" : "先认识一下宝宝"}</h2></div>
      </div>
      <p className="form-help">出生日期只用于自动计算月龄，不会显示在公开页面。</p>
      <div className="field-grid two-columns">
        <label><span>宝宝姓名</span><input value={name} onChange={(event) => setName(event.target.value)} maxLength={40} placeholder="例如：朵朵" required autoFocus={!baby} /></label>
        <label><span>出生日期</span><input type="date" value={birthDate} onChange={(event) => setBirthDate(event.target.value)} max={todayInTimezone()} required /></label>
      </div>
      <fieldset className="baby-sex-field"><legend>宝宝性别 <small>用于匹配 WHO 标准生长曲线，可暂不设置</small></legend><div className="baby-sex-options">{([['female', '女宝'], ['male', '男宝'], ['unknown', '暂不设置']] as const).map(([value, label]) => <label key={value}><input type="radio" name="baby-sex" value={value} checked={sex === value} onChange={() => setSex(value)} /><span>{label}</span></label>)}</div></fieldset>
      {error && <p className="form-error" role="alert">{error}</p>}
      <button className="primary-button" disabled={pending}>{pending ? "保存中…" : baby ? "保存资料" : "开始记录"}</button>
    </form>
  );
}

export function FoodCatalogManager({ foods, onChanged }: { foods: FoodCatalogItem[]; onChanged: (foods: FoodCatalogItem[]) => void }) {
  const [name, setName] = useState("");
  const [defaultUnit, setDefaultUnit] = useState("g");
  const [error, setError] = useState("");
  const [pending, setPending] = useState(false);

  async function addFood(event: React.FormEvent) {
    event.preventDefault();
    setPending(true);
    setError("");
    try {
      const data = await jsonRequest<{ food: FoodCatalogItem }>("/api/foods", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ name, defaultUnit: defaultUnit || null }),
      });
      onChanged([...foods, data.food].sort((left, right) => left.name.localeCompare(right.name, "zh-CN")));
      setName("");
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "添加失败");
    } finally {
      setPending(false);
    }
  }

  async function removeFood(food: FoodCatalogItem) {
    if (!window.confirm(`确定从辅食库删除“${food.name}”吗？已有餐次记录不会受影响。`)) return;
    try {
      await jsonRequest(`/api/foods/${food.id}`, { method: "DELETE" });
      onChanged(foods.filter((item) => item.id !== food.id));
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "删除失败");
    }
  }

  return (
    <section className="settings-section">
      <div className="settings-heading"><p className="eyebrow">FOOD LIBRARY</p><h3>辅食库</h3><p>维护常用食材，添加计划时可直接选择并带出默认单位。</p></div>
      <form className="catalog-form" onSubmit={addFood}>
        <label><span>辅食名称</span><input value={name} onChange={(event) => setName(event.target.value)} maxLength={80} placeholder="例如：胡萝卜泥" required /></label>
        <label><span>默认单位</span><select value={defaultUnit} onChange={(event) => setDefaultUnit(event.target.value)}><option value="">不设置</option>{UNITS.map((unit) => <option key={unit} value={unit}>{unit}</option>)}</select></label>
        <button className="secondary-button" disabled={pending}><Plus size={16} />{pending ? "添加中…" : "添加"}</button>
      </form>
      {error && <p className="form-error" role="alert">{error}</p>}
      {foods.length > 0 ? <div className="catalog-list">{foods.map((food) => <div key={food.id}><span>{food.name}</span><small>{food.defaultUnit || "无默认单位"}</small><button type="button" className="icon-button" aria-label={`删除 ${food.name}`} onClick={() => removeFood(food)}><Trash2 size={15} /></button></div>)}</div> : <p className="settings-empty">还没有辅食，先添加一种常用食材吧。</p>}
    </section>
  );
}

export function PasswordForm() {
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [pending, setPending] = useState(false);

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setError("");
    setSuccess("");
    if (newPassword !== confirmPassword) {
      setError("两次输入的新密码不一致");
      return;
    }
    setPending(true);
    try {
      await jsonRequest("/api/auth/password", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ currentPassword, newPassword }),
      });
      setCurrentPassword("");
      setNewPassword("");
      setConfirmPassword("");
      setSuccess("家庭密码已更新，下次登录请使用新密码。");
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "修改失败");
    } finally {
      setPending(false);
    }
  }

  return (
    <form className="settings-section" onSubmit={submit}>
      <div className="settings-heading"><p className="eyebrow">FAMILY PASSWORD</p><h3>修改家庭密码</h3><p>新密码至少 8 个字符，修改后不会影响当前登录。</p></div>
      <div className="password-grid">
        <label><span>当前密码</span><input type="password" value={currentPassword} onChange={(event) => setCurrentPassword(event.target.value)} autoComplete="current-password" required /></label>
        <label><span>新密码</span><input type="password" value={newPassword} onChange={(event) => setNewPassword(event.target.value)} minLength={8} maxLength={128} autoComplete="new-password" required /></label>
        <label><span>确认新密码</span><input type="password" value={confirmPassword} onChange={(event) => setConfirmPassword(event.target.value)} minLength={8} maxLength={128} autoComplete="new-password" required /></label>
      </div>
      {error && <p className="form-error" role="alert">{error}</p>}
      {success && <p className="form-success" role="status">{success}</p>}
      <button className="secondary-button" disabled={pending}>{pending ? "修改中…" : "更新密码"}</button>
    </form>
  );
}

export function MealEditor({ date, meal, foods, onSaved, onCancel }: { date: string; meal: Meal | null; foods: FoodCatalogItem[]; onSaved: () => void; onCancel: () => void }) {
  const [mealType, setMealType] = useState(meal?.mealType ?? "lunch");
  const [customMealType, setCustomMealType] = useState(meal?.customMealType ?? "");
  const [plannedTime, setPlannedTime] = useState(meal?.plannedTime ?? "11:30");
  const [planNote, setPlanNote] = useState(meal?.planNote ?? "");
  const [actualStatus, setActualStatus] = useState(meal?.actualStatus ?? "planned");
  const [actualTime, setActualTime] = useState(meal?.actualTime ?? "");
  const [actualNote, setActualNote] = useState(meal?.actualNote ?? "");
  const [reactionTags, setReactionTags] = useState<string[]>(meal?.reactionTags ?? []);
  const [items, setItems] = useState<MealItem[]>(
    meal?.items?.length ? meal.items.map((item) => ({ ...item })) : [{ name: "", amount: null, unit: "g", preparation: "", isFirstTry: false }],
  );
  const [error, setError] = useState("");
  const [pending, setPending] = useState(false);

  function updateItem(index: number, patch: Partial<MealItem>) {
    setItems((current) => current.map((item, itemIndex) => (itemIndex === index ? { ...item, ...patch } : item)));
  }

  function updateItemName(index: number, name: string) {
    const catalogItem = foods.find((food) => food.name === name);
    updateItem(index, { name, ...(catalogItem?.defaultUnit ? { unit: catalogItem.defaultUnit } : {}) });
  }

  function toggleReaction(tag: string) {
    setReactionTags((current) => (current.includes(tag) ? current.filter((item) => item !== tag) : [...current, tag]));
  }

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setPending(true);
    setError("");
    const editing = Boolean(meal?.id);
    try {
      await jsonRequest(editing ? `/api/meals/${meal!.id}` : "/api/meals", {
        method: editing ? "PATCH" : "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          mealDate: date,
          mealType,
          customMealType: mealType === "custom" ? customMealType : null,
          plannedTime,
          planNote,
          actualStatus,
          actualTime: actualStatus === "planned" ? "" : actualTime,
          actualNote: actualStatus === "planned" ? "" : actualNote,
          reactionTags: actualStatus === "planned" ? [] : reactionTags,
          items: items.map((item) => ({
            name: item.name,
            amount: item.amount,
            unit: item.unit || null,
            preparation: item.preparation || null,
            isFirstTry: item.isFirstTry,
          })),
        }),
      });
      onSaved();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "保存失败");
    } finally {
      setPending(false);
    }
  }

  return (
    <form className="meal-editor" onSubmit={submit}>
      <div className="editor-section">
        <h3>计划吃什么</h3>
        <div className="field-grid two-columns">
          <label><span>餐次</span><select value={mealType} onChange={(event) => setMealType(event.target.value)}>{MEAL_TYPES.map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label>
          <label><span>计划时间</span><input type="time" value={plannedTime} onChange={(event) => setPlannedTime(event.target.value)} /></label>
        </div>
        {mealType === "custom" && <label><span>自定义餐次</span><input value={customMealType} onChange={(event) => setCustomMealType(event.target.value)} placeholder="例如：睡前加餐" required /></label>}
        <div className="ingredient-list">
          {items.map((item, index) => (
            <div className="ingredient-row" key={index}>
              <div className="ingredient-name">
                <label htmlFor={`food-catalog-${index}`}>食材 {index + 1}</label>
                <select id={`food-catalog-${index}`} value={foods.some((food) => food.name === item.name) ? item.name : ""} onChange={(event) => updateItemName(index, event.target.value)} disabled={foods.length === 0}>
                  <option value="">{foods.length ? "从辅食库选择" : "辅食库暂无内容"}</option>
                  {foods.map((food) => <option key={food.id} value={food.name}>{food.name}{food.defaultUnit ? `（${food.defaultUnit}）` : ""}</option>)}
                </select>
                <input value={item.name} onChange={(event) => updateItemName(index, event.target.value)} aria-label={`手动输入食材 ${index + 1}`} placeholder={foods.length ? "也可手动输入" : "例如：胡萝卜泥"} required />
              </div>
              <label className="ingredient-amount"><span>数量</span><input type="number" min="0" step="0.1" value={item.amount ?? ""} onChange={(event) => updateItem(index, { amount: event.target.value === "" ? null : Number(event.target.value) })} placeholder="10" /></label>
              <label className="ingredient-unit"><span>单位</span><input list="food-units" value={item.unit ?? ""} onChange={(event) => updateItem(index, { unit: event.target.value })} placeholder="g" /></label>
              <label className="ingredient-preparation"><span>做法</span><input value={item.preparation ?? ""} onChange={(event) => updateItem(index, { preparation: event.target.value })} placeholder="蒸熟打泥（可选）" /></label>
              <label className="check-field"><input type="checkbox" checked={item.isFirstTry} onChange={(event) => updateItem(index, { isFirstTry: event.target.checked })} /><span>首次尝试</span></label>
              <button type="button" className="icon-button danger-quiet" aria-label={`删除食材 ${index + 1}`} disabled={items.length === 1} onClick={() => setItems((current) => current.filter((_, itemIndex) => itemIndex !== index))}><Trash2 size={17} /></button>
            </div>
          ))}
        </div>
        <datalist id="food-units">{UNITS.map((unit) => <option key={unit} value={unit} />)}</datalist>
        <button className="text-button" type="button" onClick={() => setItems((current) => [...current, { name: "", amount: null, unit: "g", preparation: "", isFirstTry: false }])}><Plus size={16} />添加食材</button>
        <label><span>计划备注</span><textarea value={planNote} onChange={(event) => setPlanNote(event.target.value)} maxLength={500} rows={2} placeholder="例如：米粉先用温水冲开" /></label>
      </div>

      <div className="editor-section actual-section">
        <h3>实际吃得怎么样</h3>
        <div className="status-options">{STATUS_OPTIONS.map(([value, label]) => <button type="button" className={actualStatus === value ? "selected" : ""} aria-pressed={actualStatus === value} key={value} onClick={() => setActualStatus(value)}>{actualStatus === value && <Check size={14} />}{label}</button>)}</div>
        {actualStatus !== "planned" && <>
          <label className="actual-time"><span>实际时间</span><input type="time" value={actualTime} onChange={(event) => setActualTime(event.target.value)} /></label>
          <fieldset className="reaction-fields"><legend>宝宝反应</legend><div>{REACTION_OPTIONS.map(([value, label]) => <label key={value}><input type="checkbox" checked={reactionTags.includes(value)} onChange={() => toggleReaction(value)} /><span>{label}</span></label>)}</div></fieldset>
          <label><span>实际备注</span><textarea value={actualNote} onChange={(event) => setActualNote(event.target.value)} maxLength={500} rows={2} placeholder="记录接受程度、身体反应等" /></label>
        </>}
      </div>
      {error && <p className="form-error" role="alert">{error}</p>}
      <div className="form-actions"><button type="button" className="secondary-button" onClick={onCancel}>取消</button><button className="primary-button" disabled={pending}>{pending ? "保存中…" : meal?.id ? "保存修改" : "添加这餐"}</button></div>
    </form>
  );
}

export function DiaryApp({ baby }: { baby: Baby }) {
  const [calendarView, setCalendarView] = useState<CalendarView>("month");
  const [anchorDate, setAnchorDate] = useState(() => todayInTimezone());
  const [meals, setMeals] = useState<Meal[]>([]);
  const [foods, setFoods] = useState<FoodCatalogItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedDate, setSelectedDate] = useState(() => todayInTimezone());
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [formMeal, setFormMeal] = useState<Meal | null | undefined>(undefined);
  const [ingredientFilter, setIngredientFilter] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [reactionFilter, setReactionFilter] = useState("");
  const drawerRef = useRef<HTMLDialogElement>(null);
  const requestSequenceRef = useRef(0);
  const swipeStartRef = useRef<{ pointerId: number; x: number; y: number } | null>(null);
  const suppressDayClickRef = useRef(false);
  const today = todayInTimezone(baby.timezone);
  const month = anchorDate.slice(0, 7);
  const gridDates = useMemo(() => {
    if (calendarView === "month") return getMonthGrid(month);
    if (calendarView === "week") return getWeekDates(anchorDate);
    return [anchorDate];
  }, [anchorDate, calendarView, month]);
  const periodDates = useMemo(
    () => calendarView === "month" ? gridDates.filter((date) => date.startsWith(month)) : gridDates,
    [calendarView, gridDates, month],
  );
  const visibleMonthsKey = useMemo(() => [...new Set(gridDates.map((date) => date.slice(0, 7)))].join(","), [gridDates]);

  const loadMeals = useCallback(async () => {
    const requestId = ++requestSequenceRef.current;
    setLoading(true);
    try {
      const nextMeals = await fetchMealsForMonths(visibleMonthsKey);
      if (requestId === requestSequenceRef.current) setMeals(nextMeals);
    } catch {
      if (requestId === requestSequenceRef.current) setMeals([]);
    } finally {
      if (requestId === requestSequenceRef.current) setLoading(false);
    }
  }, [visibleMonthsKey]);

  useEffect(() => {
    const requestId = ++requestSequenceRef.current;
    Promise.resolve().then(() => { if (requestId === requestSequenceRef.current) setLoading(true); });
    fetchMealsForMonths(visibleMonthsKey)
      .then((nextMeals) => { if (requestId === requestSequenceRef.current) setMeals(nextMeals); })
      .catch(() => { if (requestId === requestSequenceRef.current) setMeals([]); })
      .finally(() => { if (requestId === requestSequenceRef.current) setLoading(false); });
    return () => { requestSequenceRef.current += 1; };
  }, [baby.id, visibleMonthsKey]);
  useEffect(() => {
    let active = true;
    jsonRequest<{ foods: FoodCatalogItem[] }>("/api/foods")
      .then((data) => { if (active) setFoods(data.foods); })
      .catch(() => { if (active) setFoods([]); });
    return () => { active = false; };
  }, [baby]);
  useEffect(() => {
    const dialog = drawerRef.current;
    if (!dialog) return;
    if (drawerOpen && !dialog.open) dialog.showModal();
    if (!drawerOpen && dialog.open) dialog.close();
  }, [drawerOpen]);
  const filteredMeals = useMemo(() => meals.filter((meal) => {
    const matchesIngredient = !ingredientFilter.trim() || meal.items.some((item) => item.name.toLowerCase().includes(ingredientFilter.trim().toLowerCase()));
    const matchesStatus = !statusFilter || meal.actualStatus === statusFilter;
    const matchesReaction = !reactionFilter || meal.reactionTags.includes(reactionFilter);
    return matchesIngredient && matchesStatus && matchesReaction;
  }), [meals, ingredientFilter, statusFilter, reactionFilter]);

  const selectedMeals = filteredMeals.filter((meal) => meal.mealDate === selectedDate);
  const filteredByDate = useMemo(() => new Map(gridDates.map((date) => [date, filteredMeals.filter((meal) => meal.mealDate === date)])), [gridDates, filteredMeals]);
  const periodDateSet = useMemo(() => new Set(periodDates), [periodDates]);
  const periodMeals = useMemo(() => meals.filter((meal) => periodDateSet.has(meal.mealDate)), [meals, periodDateSet]);
  const completedCount = periodMeals.filter((meal) => meal.actualStatus === "completed").length;
  const uniqueFoods = new Set(periodMeals.flatMap((meal) => meal.items.map((item) => item.name.trim()).filter(Boolean))).size;
  const activeFilterCount = [statusFilter, reactionFilter].filter(Boolean).length;

  function openDay(date: string) {
    if (calendarView === "month" && !date.startsWith(month)) {
      setAnchorDate(date);
    }
    setSelectedDate(date);
    setFormMeal(undefined);
    setDrawerOpen(true);
  }

  function changePeriod(amount: -1 | 1) {
    const nextDate = calendarView === "month"
      ? `${shiftMonth(month, amount)}-01`
      : addDays(anchorDate, amount * (calendarView === "week" ? 7 : 1));
    setAnchorDate(nextDate);
    setSelectedDate(nextDate);
  }

  function changeCalendarView(nextView: CalendarView) {
    setCalendarView(nextView);
    setAnchorDate(selectedDate);
  }

  function returnToToday() {
    setAnchorDate(today);
    setSelectedDate(today);
  }

  function startSwipe(event: React.PointerEvent<HTMLDivElement>) {
    if (calendarView === "month" || event.pointerType === "mouse") return;
    swipeStartRef.current = { pointerId: event.pointerId, x: event.clientX, y: event.clientY };
  }

  function finishSwipe(event: React.PointerEvent<HTMLDivElement>) {
    const start = swipeStartRef.current;
    swipeStartRef.current = null;
    if (!start || start.pointerId !== event.pointerId) return;
    const deltaX = event.clientX - start.x;
    const deltaY = event.clientY - start.y;
    if (Math.abs(deltaX) < 52 || Math.abs(deltaX) <= Math.abs(deltaY) * 1.2) return;
    suppressDayClickRef.current = true;
    changePeriod(deltaX < 0 ? 1 : -1);
    window.setTimeout(() => { suppressDayClickRef.current = false; }, 0);
  }

  function suppressClickAfterSwipe(event: React.MouseEvent<HTMLDivElement>) {
    if (!suppressDayClickRef.current) return;
    event.preventDefault();
    event.stopPropagation();
    suppressDayClickRef.current = false;
  }

  async function removeMeal(meal: Meal) {
    if (!window.confirm(`确定删除 ${meal.plannedTime || "这餐"} 的${mealLabel(meal)}记录吗？`)) return;
    await jsonRequest(`/api/meals/${meal.id}`, { method: "DELETE" });
    await loadMeals();
  }

  async function copyPrevious() {
    const data = await jsonRequest<{ meal: Meal | null }>(`/api/meals/previous?before=${selectedDate}`);
    if (!data.meal) {
      window.alert("还没有更早的辅食记录可以复制。");
      return;
    }
    setFormMeal({ ...data.meal, id: "", mealDate: selectedDate, actualStatus: "planned", actualTime: null, actualNote: null, reactionTags: [] });
  }

  return (
    <section className="food-module">
      <header className="food-page-heading">
        <div><p className="eyebrow">FOOD CALENDAR</p><h1>{baby.name}的辅食日历</h1><p>计划好每一餐，也留下宝宝真实的接受和反应。</p></div>
        <div className="food-period-summary" aria-label={`${CALENDAR_VIEW_LABELS[calendarView]}视图概览`}>
          <span><strong>{periodMeals.length}</strong> 餐</span>
          <span><strong>{completedCount}</strong> 次吃完</span>
          <span><strong>{uniqueFoods}</strong> 种食材</span>
        </div>
      </header>

      <section className="calendar-card">
        <div className="calendar-toolbar">
          <div className="month-switcher">
            <button className="icon-button" aria-label={calendarView === "month" ? "上个月" : calendarView === "week" ? "上一周" : "前一天"} onClick={() => changePeriod(-1)}><ChevronLeft /></button>
            <h2>{calendarPeriodTitle(calendarView, anchorDate)}</h2>
            <button className="icon-button" aria-label={calendarView === "month" ? "下个月" : calendarView === "week" ? "下一周" : "后一天"} onClick={() => changePeriod(1)}><ChevronRight /></button>
          </div>
          <div className="calendar-toolbar-controls">
            <div className="calendar-view-switch" role="group" aria-label="辅食日历查看粒度">{(["month", "week", "day"] as const).map((view) => <button key={view} type="button" className={calendarView === view ? "active" : ""} aria-pressed={calendarView === view} onClick={() => changeCalendarView(view)}>{CALENDAR_VIEW_LABELS[view]}</button>)}</div>
            <button className="today-button" onClick={returnToToday}>今天</button>
            <details className="export-menu"><summary className="secondary-button"><Download size={17} />导出</summary><div className="export-popover">
              <p>打印与分享</p>
              <a href={`/api/exports/month?month=${month}&format=pdf&scope=plan`}><FileText />计划菜单 PDF</a>
              <a href={`/api/exports/month?month=${month}&format=pdf&scope=full`}><FileText />计划与实际 PDF</a>
              <a href={`/api/exports/month?month=${month}&format=png&scope=plan`}><FileImage />计划菜单高清图</a>
              <a href={`/api/exports/month?month=${month}&format=png&scope=full`}><FileImage />计划与实际高清图</a>
              <hr /><p>原始数据</p>
              <a href={`/api/exports/data?month=${month}&format=json`}><FileJson />JSON 月度辅食数据</a>
              <a href={`/api/exports/data?month=${month}&format=csv`}><FileSpreadsheet />CSV 表格</a>
            </div></details>
            <button className="primary-button" onClick={() => openDay(periodDateSet.has(today) ? today : calendarView === "month" ? `${month}-01` : anchorDate)}><CirclePlus size={18} />添加辅食</button>
          </div>
        </div>

        <div className="food-filter-bar">
          <label className="food-search-field"><Search size={18} /><input value={ingredientFilter} onChange={(event) => setIngredientFilter(event.target.value)} placeholder="搜索食材" aria-label="搜索食材" />{ingredientFilter && <button type="button" className="icon-button" aria-label="清除食材搜索" onClick={() => setIngredientFilter("")}><X /></button>}</label>
          <details className="food-filter-menu">
            <summary className="secondary-button"><SlidersHorizontal size={17} />筛选{activeFilterCount > 0 && <span>{activeFilterCount}</span>}</summary>
            <div className="food-filter-popover">
              <label><span>记录状态</span><select value={statusFilter} onChange={(event) => setStatusFilter(event.target.value)} aria-label="按实际状态筛选"><option value="">全部状态</option>{STATUS_OPTIONS.map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label>
              <label><span>宝宝反应</span><select value={reactionFilter} onChange={(event) => setReactionFilter(event.target.value)} aria-label="按宝宝反应筛选"><option value="">全部反应</option>{REACTION_OPTIONS.map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label>
              {activeFilterCount > 0 && <button type="button" className="clear-filter" onClick={() => { setStatusFilter(""); setReactionFilter(""); }}><X size={14} />清除筛选</button>}
            </div>
          </details>
        </div>

        {calendarView !== "day" && <div className={`weekday-row view-${calendarView}`}>{WEEKDAYS.map((day) => <div key={day}>{day}</div>)}</div>}
        <div className={`month-grid calendar-grid view-${calendarView} ${loading ? "is-loading" : ""}`} aria-label={`${CALENDAR_VIEW_LABELS[calendarView]}视图`} aria-busy={loading} onPointerDown={startSwipe} onPointerUp={finishSwipe} onPointerCancel={() => { swipeStartRef.current = null; }} onClickCapture={suppressClickAfterSwipe}>
          {gridDates.map((date) => {
            const dateMeals = filteredByDate.get(date) ?? [];
            const inPeriod = calendarView !== "month" || date.startsWith(month);
            const mealLimit = calendarView === "month" ? 2 : calendarView === "week" ? 4 : 8;
            return <button key={date} className={`calendar-day ${inPeriod ? "" : "outside"} ${date === today ? "today" : ""} ${date === selectedDate ? "selected" : ""}`} onClick={() => openDay(date)} aria-label={`${dateTitle(date)}，${dateMeals.length}餐`}>
              <div className="calendar-day-content">
                <div className="day-number"><span>{Number(date.slice(8))}</span>{calendarView !== "month" && <b>{dateTitle(date)}</b>}<small>{formatAge(baby.birthDate, date)}</small></div>
                <div className="day-meals">{dateMeals.slice(0, mealLimit).map((meal) => <div className="calendar-meal" key={meal.id}><div><b>{meal.plannedTime || mealLabel(meal)}</b><span className={`status-dot ${meal.actualStatus}`} title={STATUS_LABELS[meal.actualStatus]} /></div><p>{meal.items.slice(0, 3).map(itemText).join(" · ")}</p></div>)}{dateMeals.length > mealLimit && <span className="more-meals">还有 {dateMeals.length - mealLimit} 餐</span>}</div>
                <div className="mobile-day-summary">{dateMeals.length > 0 && <><span className={`meal-count ${dateMeals.some((meal) => meal.actualStatus === "completed") ? "done" : ""}`}>{dateMeals.length}</span><i /></>}</div>
              </div>
            </button>;
          })}
        </div>
      </section>

      <dialog ref={drawerRef} className="day-drawer" aria-labelledby="food-day-title" onClose={() => setDrawerOpen(false)}>
        <div className="drawer-header"><div><p className="eyebrow">DAILY MENU</p><h2 id="food-day-title">{dateTitle(selectedDate)}</h2><span>{formatAge(baby.birthDate, selectedDate)}</span></div><button className="icon-button" aria-label="关闭" onClick={() => setDrawerOpen(false)}><X /></button></div>
        <div className="drawer-body">
          {formMeal !== undefined ? <MealEditor key={`${formMeal?.id ?? "new"}-${selectedDate}`} date={selectedDate} meal={formMeal} foods={foods} onCancel={() => setFormMeal(undefined)} onSaved={async () => { await loadMeals(); setFormMeal(undefined); }} /> : <>
            <div className="drawer-actions"><button className="primary-button" onClick={() => setFormMeal(null)}><Plus size={17} />添加一餐</button><button className="secondary-button" onClick={copyPrevious}><ClipboardCopy size={17} />复制上一餐</button></div>
            {selectedMeals.length ? <div className="meal-card-list">{selectedMeals.map((meal) => <article className="meal-card" key={meal.id}>
              <header><div><span>{meal.plannedTime || "未定时间"}</span><h3>{mealLabel(meal)}</h3></div><span className={`status-badge ${meal.actualStatus}`}>{STATUS_LABELS[meal.actualStatus]}</span></header>
              <ul>{meal.items.map((item, index) => <li key={item.id || index}><span>{item.name}{item.isFirstTry && <b>首次</b>}</span><em>{item.amount ?? ""}{item.unit || ""}{item.preparation ? ` · ${item.preparation}` : ""}</em></li>)}</ul>
              {meal.planNote && <p className="meal-note">计划：{meal.planNote}</p>}
              {meal.reactionTags.length > 0 && <div className="reaction-tags">{meal.reactionTags.map((tag) => <span key={tag}>{REACTION_LABELS[tag] || tag}</span>)}</div>}
              {meal.actualNote && <p className="meal-note actual">实际：{meal.actualNote}</p>}
              <footer><button onClick={() => setFormMeal(meal)}><Pencil size={15} />编辑</button><button onClick={() => setFormMeal({ ...meal, id: "", mealDate: selectedDate, actualStatus: "planned", actualTime: null, actualNote: null, reactionTags: [] })}><ClipboardCopy size={15} />复制</button><button className="danger" onClick={() => removeMeal(meal)}><Trash2 size={15} />删除</button></footer>
            </article>)}</div> : <div className="empty-day"><div><CalendarDays /></div><h3>这一天还没有辅食计划</h3><p>添加一餐，或从之前的记录快速复制。</p></div>}
          </>}
        </div>
      </dialog>

    </section>
  );
}
