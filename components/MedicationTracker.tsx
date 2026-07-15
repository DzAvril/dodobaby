"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  CalendarClock,
  Check,
  ChevronLeft,
  ChevronRight,
  Clock3,
  Pencil,
  Pill,
  Plus,
  Trash2,
  X,
} from "lucide-react";
import type { Baby } from "@/components/DiaryApp";
import { jsonRequest } from "@/lib/client-api";
import { addDays, currentMinuteInTimezone, todayInTimezone } from "@/lib/dates";
import { medicationFrequencyText } from "@/lib/medication-schedule";

export type MedicationPlan = {
  id: string;
  babyId: string;
  medicationName: string;
  doseAmount: number;
  doseUnit: string;
  intervalDays: number;
  scheduledTimes: string[];
  startDate: string;
  endDate: string | null;
  note: string | null;
  createdAt: string;
  updatedAt: string;
};

export type MedicationRecord = {
  id: string;
  babyId: string;
  planId: string | null;
  medicationName: string;
  doseAmount: number;
  doseUnit: string;
  takenDate: string;
  scheduledTime: string | null;
  takenTime: string;
  note: string | null;
  createdAt: string;
  updatedAt: string;
};

export type MedicationDayResponse = {
  date: string;
  plans: MedicationPlan[];
  duePlans: MedicationPlan[];
  records: MedicationRecord[];
};

type IntakeEditor = { plan: MedicationPlan | null; scheduledTime: string | null };
const EMPTY_PLANS: MedicationPlan[] = [];
const EMPTY_RECORDS: MedicationRecord[] = [];

function formatDay(date: string) {
  return new Intl.DateTimeFormat("zh-CN", { month: "long", day: "numeric", weekday: "short", timeZone: "UTC" })
    .format(new Date(`${date}T00:00:00Z`));
}

function formatDose(amount: number, unit: string) {
  return `${Number.isInteger(amount) ? amount : Number(amount.toFixed(2))} ${unit}`;
}

function optionalNumber(value: string) {
  const parsed = Number(value);
  return value.trim() && Number.isFinite(parsed) ? parsed : null;
}

function nextPlanTime(times: string[]) {
  return ["08:00", "12:00", "18:00", "20:00", "22:00"].find((time) => !times.includes(time)) ?? "09:00";
}

export function MedicationPlanForm({ baby, date, plan, onSaved, onCancel }: {
  baby: Baby;
  date: string;
  plan: MedicationPlan | null;
  onSaved: () => void | Promise<void>;
  onCancel: () => void;
}) {
  const [medicationName, setMedicationName] = useState(plan?.medicationName ?? "");
  const [doseAmount, setDoseAmount] = useState(plan?.doseAmount.toString() ?? "");
  const [doseUnit, setDoseUnit] = useState(plan?.doseUnit ?? "滴");
  const [intervalDays, setIntervalDays] = useState(plan?.intervalDays.toString() ?? "1");
  const [scheduledTimes, setScheduledTimes] = useState(plan?.scheduledTimes ?? ["08:00"]);
  const [startDate, setStartDate] = useState(plan?.startDate ?? date);
  const [endDate, setEndDate] = useState(plan?.endDate ?? "");
  const [note, setNote] = useState(plan?.note ?? "");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");
  const amount = optionalNumber(doseAmount);
  const interval = optionalNumber(intervalDays);
  const timesValid = scheduledTimes.length > 0 && scheduledTimes.every(Boolean) && new Set(scheduledTimes).size === scheduledTimes.length;
  const canSave = Boolean(
    medicationName.trim()
    && amount != null && amount > 0 && amount <= 100000
    && doseUnit.trim()
    && interval != null && Number.isInteger(interval) && interval >= 1 && interval <= 30
    && timesValid
    && startDate
    && (!endDate || endDate >= startDate),
  ) && !pending;

  function changeTime(index: number, value: string) {
    setScheduledTimes((current) => current.map((time, currentIndex) => currentIndex === index ? value : time));
  }

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    if (!canSave || amount == null || interval == null) return;
    setPending(true);
    setError("");
    try {
      await jsonRequest(plan ? `/api/medications/plans/${plan.id}` : "/api/medications/plans", {
        method: plan ? "PATCH" : "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          medicationName,
          doseAmount: amount,
          doseUnit,
          intervalDays: interval,
          scheduledTimes,
          startDate,
          endDate: endDate || null,
          note: note || null,
        }),
      });
      await onSaved();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "保存失败，请稍后重试");
    } finally {
      setPending(false);
    }
  }

  return <form className="medication-form" onSubmit={submit}><div className="medication-form-scroll"><div className="medication-field-grid primary"><label><span>药品名称</span><input value={medicationName} onChange={(event) => setMedicationName(event.target.value)} maxLength={80} placeholder="例如：维生素 D3" required autoFocus /></label><label><span>用药量</span><input type="number" inputMode="decimal" min="0.01" max="100000" step="any" value={doseAmount} onChange={(event) => setDoseAmount(event.target.value)} placeholder="例如 1" required /></label><label><span>单位</span><input value={doseUnit} onChange={(event) => setDoseUnit(event.target.value)} maxLength={20} list="medication-units" required /><datalist id="medication-units"><option value="滴" /><option value="ml" /><option value="mg" /><option value="片" /><option value="粒" /><option value="包" /><option value="揿" /></datalist></label></div><fieldset className="medication-schedule-fields"><legend><CalendarClock />用药频率</legend><div className="medication-frequency-row"><span>每</span><input type="number" inputMode="numeric" min="1" max="30" step="1" value={intervalDays} onChange={(event) => setIntervalDays(event.target.value)} aria-label="间隔天数" /><span>天安排一轮</span></div><div className="medication-date-grid"><label><span>开始日期</span><input type="date" min={baby.birthDate} value={startDate} onChange={(event) => setStartDate(event.target.value)} required /></label><label><span>结束日期 <small>可选</small></span><input type="date" min={startDate || baby.birthDate} value={endDate} onChange={(event) => setEndDate(event.target.value)} /></label></div><div className="medication-time-heading"><span>每轮用药时间</span><button type="button" className="secondary-button" disabled={scheduledTimes.length >= 6} onClick={() => setScheduledTimes((current) => [...current, nextPlanTime(current)])}><Plus />添加时间</button></div><div className="medication-time-list">{scheduledTimes.map((time, index) => <div key={index}><Clock3 /><input type="time" value={time} onChange={(event) => changeTime(index, event.target.value)} required aria-label={`第 ${index + 1} 次用药时间`} /><button type="button" className="icon-button danger" disabled={scheduledTimes.length === 1} onClick={() => setScheduledTimes((current) => current.filter((_, currentIndex) => currentIndex !== index))} aria-label={`删除 ${time} 用药时间`}><Trash2 /></button></div>)}</div>{interval != null && interval >= 1 && timesValid && <p className="medication-frequency-preview">{medicationFrequencyText(interval, [...scheduledTimes].sort())}</p>}</fieldset><label className="medication-note-field"><span>备注 <small>可选</small></span><textarea rows={3} maxLength={500} value={note} onChange={(event) => setNote(event.target.value)} placeholder="记录医嘱来源或其他注意事项" /></label>{!timesValid && <p className="form-error">用药时间不能为空或重复。</p>}{error && <p className="form-error" role="alert">{error}</p>}</div><div className="medication-form-actions"><button type="button" className="secondary-button" onClick={onCancel} disabled={pending}>取消</button><button type="submit" className="primary-button" disabled={!canSave}>{pending ? "保存中…" : plan ? "保存修改" : "创建计划"}</button></div></form>;
}

export function MedicationRecordForm({ baby, date, editor, onSaved, onCancel }: {
  baby: Baby;
  date: string;
  editor: IntakeEditor;
  onSaved: (savedDate: string) => void | Promise<void>;
  onCancel: () => void;
}) {
  const now = currentMinuteInTimezone(baby.timezone);
  const [medicationName, setMedicationName] = useState(editor.plan?.medicationName ?? "");
  const [doseAmount, setDoseAmount] = useState(editor.plan?.doseAmount.toString() ?? "");
  const [doseUnit, setDoseUnit] = useState(editor.plan?.doseUnit ?? "滴");
  const [takenDate, setTakenDate] = useState(date);
  const [takenTime, setTakenTime] = useState(editor.scheduledTime ?? now.time);
  const [note, setNote] = useState("");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");
  const amount = optionalNumber(doseAmount);
  const canSave = Boolean(editor.plan || (medicationName.trim() && amount != null && amount > 0 && doseUnit.trim()))
    && Boolean(takenDate && takenTime) && !pending;

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    if (!canSave) return;
    setPending(true);
    setError("");
    try {
      await jsonRequest("/api/medications", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          planId: editor.plan?.id ?? null,
          scheduledTime: editor.scheduledTime,
          medicationName: editor.plan ? null : medicationName,
          doseAmount: editor.plan ? null : amount,
          doseUnit: editor.plan ? null : doseUnit,
          takenDate,
          takenTime,
          note: note || null,
        }),
      });
      await onSaved(takenDate);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "保存失败，请稍后重试");
    } finally {
      setPending(false);
    }
  }

  return <form className="medication-form" onSubmit={submit}><div className="medication-form-scroll">{editor.plan ? <div className="medication-intake-plan"><Pill /><div><strong>{editor.plan.medicationName}</strong><span>{formatDose(editor.plan.doseAmount, editor.plan.doseUnit)} · 计划 {editor.scheduledTime}</span></div></div> : <div className="medication-field-grid primary"><label><span>药品名称</span><input value={medicationName} onChange={(event) => setMedicationName(event.target.value)} maxLength={80} required autoFocus /></label><label><span>实际用药量</span><input type="number" inputMode="decimal" min="0.01" max="100000" step="any" value={doseAmount} onChange={(event) => setDoseAmount(event.target.value)} required /></label><label><span>单位</span><input value={doseUnit} onChange={(event) => setDoseUnit(event.target.value)} maxLength={20} required /></label></div>}<div className="medication-date-grid"><label><span>实际日期</span><input type="date" min={baby.birthDate} max={todayInTimezone(baby.timezone)} value={takenDate} onChange={(event) => setTakenDate(event.target.value)} required /></label><label><span>实际时间</span><input type="time" max={takenDate === now.date ? now.time : undefined} value={takenTime} onChange={(event) => setTakenTime(event.target.value)} required autoFocus={Boolean(editor.plan)} /></label></div><label className="medication-note-field"><span>备注 <small>可选</small></span><textarea rows={3} maxLength={500} value={note} onChange={(event) => setNote(event.target.value)} placeholder="例如：随奶服用" /></label>{error && <p className="form-error" role="alert">{error}</p>}</div><div className="medication-form-actions"><button type="button" className="secondary-button" onClick={onCancel} disabled={pending}>取消</button><button type="submit" className="primary-button" disabled={!canSave}>{pending ? "保存中…" : "登记已服"}</button></div></form>;
}

export function MedicationTracker({ baby }: { baby: Baby }) {
  const today = todayInTimezone(baby.timezone);
  const [selectedDate, setSelectedDate] = useState(today);
  const [dayData, setDayData] = useState<MedicationDayResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [planEditor, setPlanEditor] = useState<MedicationPlan | null | undefined>(undefined);
  const [intakeEditor, setIntakeEditor] = useState<IntakeEditor | undefined>(undefined);
  const planDialogRef = useRef<HTMLDialogElement>(null);
  const intakeDialogRef = useRef<HTMLDialogElement>(null);
  const selectedDateRef = useRef(today);
  const requestSequenceRef = useRef(0);

  const loadDay = useCallback(async (date: string) => {
    const requestId = ++requestSequenceRef.current;
    setLoading(true);
    setError("");
    try {
      const data = await jsonRequest<MedicationDayResponse>(`/api/medications?date=${date}`);
      if (requestId !== requestSequenceRef.current || date !== selectedDateRef.current) return;
      setDayData(data);
    } catch (caught) {
      if (requestId !== requestSequenceRef.current || date !== selectedDateRef.current) return;
      setError(caught instanceof Error ? caught.message : "加载失败，请稍后重试");
    } finally {
      if (requestId === requestSequenceRef.current && date === selectedDateRef.current) setLoading(false);
    }
  }, []);

  useEffect(() => {
    const date = selectedDate;
    const requestId = ++requestSequenceRef.current;
    jsonRequest<MedicationDayResponse>(`/api/medications?date=${date}`)
      .then((data) => {
        if (requestId === requestSequenceRef.current && date === selectedDateRef.current) setDayData(data);
      })
      .catch((caught) => {
        if (requestId === requestSequenceRef.current && date === selectedDateRef.current) setError(caught instanceof Error ? caught.message : "加载失败，请稍后重试");
      })
      .finally(() => {
        if (requestId === requestSequenceRef.current && date === selectedDateRef.current) setLoading(false);
      });
    return () => { requestSequenceRef.current += 1; };
  }, [selectedDate]);
  useEffect(() => {
    const dialog = planDialogRef.current;
    if (!dialog) return;
    if (planEditor !== undefined && !dialog.open) dialog.showModal();
    if (planEditor === undefined && dialog.open) dialog.close();
  }, [planEditor]);
  useEffect(() => {
    const dialog = intakeDialogRef.current;
    if (!dialog) return;
    if (intakeEditor !== undefined && !dialog.open) dialog.showModal();
    if (intakeEditor === undefined && dialog.open) dialog.close();
  }, [intakeEditor]);

  const currentData = dayData?.date === selectedDate ? dayData : null;
  const plans = currentData?.plans ?? EMPTY_PLANS;
  const records = currentData?.records ?? EMPTY_RECORDS;
  const occurrences = useMemo(() => (currentData?.duePlans ?? EMPTY_PLANS).flatMap((plan) => plan.scheduledTimes.map((scheduledTime) => ({
    plan,
    scheduledTime,
    record: records.find((record) => record.planId === plan.id && record.scheduledTime === scheduledTime) ?? null,
  }))).sort((left, right) => left.scheduledTime.localeCompare(right.scheduledTime)), [currentData, records]);
  const completedCount = occurrences.filter((occurrence) => occurrence.record).length;
  const supplementalRecords = records.filter((record) => !occurrences.some((occurrence) => occurrence.record?.id === record.id));
  const dayWord = selectedDate === today ? "今日" : "当日";

  function changeDate(date: string) {
    selectedDateRef.current = date;
    requestSequenceRef.current += 1;
    setSelectedDate(date);
    setError("");
    setLoading(true);
  }

  async function handleRecordSaved(savedDate: string) {
    setIntakeEditor(undefined);
    if (savedDate === selectedDateRef.current) await loadDay(savedDate);
    else changeDate(savedDate);
  }

  async function removeRecord(record: MedicationRecord) {
    if (!window.confirm(`确定删除 ${record.takenTime} 的 ${record.medicationName} 用药记录吗？`)) return;
    setDeletingId(record.id);
    setError("");
    try {
      await jsonRequest(`/api/medications/${record.id}`, { method: "DELETE" });
      await loadDay(selectedDateRef.current);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "删除失败，请稍后重试");
    } finally {
      setDeletingId(null);
    }
  }

  async function removePlan(plan: MedicationPlan) {
    if (!window.confirm(`确定删除 ${plan.medicationName} 的用药计划吗？已有实际用药记录会保留。`)) return;
    setDeletingId(plan.id);
    setError("");
    try {
      await jsonRequest(`/api/medications/plans/${plan.id}`, { method: "DELETE" });
      await loadDay(selectedDateRef.current);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "删除失败，请稍后重试");
    } finally {
      setDeletingId(null);
    }
  }

  return (
    <div className="module-page medication-page">
      <header className="module-heading">
        <div>
          <p className="eyebrow">MEDICATION LOG</p>
          <h1>{baby.name}的用药记录</h1>
          <p>按计划核对当天用药，并保存每一次实际用药的时间和剂量。</p>
        </div>
        <div className="medication-heading-actions">
          <button type="button" className="secondary-button" onClick={() => setIntakeEditor({ plan: null, scheduledTime: null })}><Plus />补录用药</button>
          <button type="button" className="primary-button" onClick={() => setPlanEditor(null)}><CalendarClock />新建计划</button>
        </div>
      </header>

      <section className="feeding-date-bar" aria-label="选择查看日期">
        <button type="button" className="icon-button" aria-label="前一天" disabled={selectedDate <= baby.birthDate} onClick={() => changeDate(addDays(selectedDate, -1))}><ChevronLeft /></button>
        <label>
          <span>{selectedDate === today ? "今天" : formatDay(selectedDate)}</span>
          <input type="date" value={selectedDate} min={baby.birthDate} max={today} aria-label="查看用药日期" onChange={(event) => { if (event.target.value) changeDate(event.target.value); }} />
        </label>
        <button type="button" className="icon-button" aria-label="后一天" disabled={selectedDate >= today} onClick={() => changeDate(addDays(selectedDate, 1))}><ChevronRight /></button>
        {selectedDate !== today && <button type="button" className="feeding-today-button" onClick={() => changeDate(today)}>回到今天</button>}
      </section>

      {error && <div className="module-error module-error-with-action" role="alert"><span>{error}</span><button type="button" className="secondary-button" onClick={() => loadDay(selectedDate)}>重新加载</button></div>}
      {loading && !currentData ? (
        <section className="module-state-card" aria-live="polite"><Pill /><strong>正在整理{dayWord}用药</strong><span>计划和实际结果会在同一清单中核对。</span></section>
      ) : (
        <>
          <section className="medication-summary-grid" aria-label={`${dayWord}用药摘要`}>
            <article><CalendarClock /><span>计划用药</span><strong>{occurrences.length}</strong><small>个时间点</small></article>
            <article><Check /><span>已服</span><strong>{completedCount + supplementalRecords.length}</strong><small>实际用药</small></article>
            <article><Clock3 /><span>待服</span><strong>{Math.max(0, occurrences.length - completedCount)}</strong><small>尚未登记</small></article>
          </section>

          <section className="medication-panel medication-today-panel">
            <div className="medication-panel-heading">
              <div><p className="eyebrow">DAILY MEDICATION</p><h2>{dayWord}用药</h2></div>
              <span>{formatDay(selectedDate)} · {records.length} 条实际记录</span>
            </div>
            {occurrences.length || supplementalRecords.length ? (
              <div className="medication-occurrence-list">
                {occurrences.map(({ plan, scheduledTime, record }) => (
                  <article key={`${plan.id}-${scheduledTime}`} className={record ? "completed" : "pending"}>
                    <time>{scheduledTime}</time>
                    <div>
                      <strong>{plan.medicationName}</strong>
                      <span>{formatDose(plan.doseAmount, plan.doseUnit)} · 计划用药</span>
                      {record?.note && <p>{record.note}</p>}
                    </div>
                    {record ? (
                      <div className="medication-occurrence-actions">
                        <div className="medication-occurrence-status"><Check /><span>已服 {record.takenTime}</span></div>
                        <button type="button" className="icon-button danger" disabled={deletingId !== null} onClick={() => removeRecord(record)} aria-label={`删除 ${record.medicationName} 用药记录`}><Trash2 /></button>
                      </div>
                    ) : (
                      <button type="button" className="primary-button" onClick={() => setIntakeEditor({ plan, scheduledTime })}><Check />登记已服</button>
                    )}
                  </article>
                ))}
                {supplementalRecords.map((record) => (
                  <article key={record.id} className="completed supplemental">
                    <time>{record.takenTime}</time>
                    <div>
                      <strong>{record.medicationName}</strong>
                      <span>{formatDose(record.doseAmount, record.doseUnit)} · 临时补录</span>
                      {record.note && <p>{record.note}</p>}
                    </div>
                    <div className="medication-occurrence-actions">
                      <div className="medication-occurrence-status"><Check /><span>已服</span></div>
                      <button type="button" className="icon-button danger" disabled={deletingId !== null} onClick={() => removeRecord(record)} aria-label={`删除 ${record.medicationName} 用药记录`}><Trash2 /></button>
                    </div>
                  </article>
                ))}
              </div>
            ) : (
              <div className="medication-empty"><Pill /><strong>{dayWord}没有用药安排</strong><span>可补录临时用药，或新建一个按频率重复的计划。</span></div>
            )}
          </section>

          <section className="medication-panel medication-plans-panel">
            <div className="medication-panel-heading">
              <div><p className="eyebrow">MEDICATION PLANS</p><h2>用药计划</h2></div>
              <button type="button" className="secondary-button" onClick={() => setPlanEditor(null)}><Plus />添加</button>
            </div>
            {plans.length ? (
              <div className="medication-plan-list">
                {plans.map((plan) => (
                  <article key={plan.id}>
                    <div className="medication-plan-icon"><Pill /></div>
                    <div>
                      <strong>{plan.medicationName}</strong>
                      <span>{formatDose(plan.doseAmount, plan.doseUnit)} · {medicationFrequencyText(plan.intervalDays, plan.scheduledTimes)}</span>
                      <small>{plan.startDate} 起{plan.endDate ? ` · 至 ${plan.endDate}` : " · 长期"}</small>
                      {plan.note && <p>{plan.note}</p>}
                    </div>
                    <div className="medication-plan-actions">
                      <button type="button" onClick={() => setPlanEditor(plan)}><Pencil />编辑</button>
                      <button type="button" className="danger" disabled={deletingId !== null} onClick={() => removePlan(plan)}><Trash2 />删除</button>
                    </div>
                  </article>
                ))}
              </div>
            ) : (
              <div className="medication-empty"><CalendarClock /><strong>还没有用药计划</strong><span>创建计划后，会按开始日期和间隔天数生成每天的安排。</span></div>
            )}
          </section>
        </>
      )}

      <dialog ref={planDialogRef} className="medication-dialog" aria-labelledby="medication-plan-dialog-title" onClose={() => setPlanEditor(undefined)}>
        {planEditor !== undefined && <>
          <div className="medication-dialog-header">
            <div><p className="eyebrow">MEDICATION PLAN</p><h2 id="medication-plan-dialog-title">{planEditor ? "编辑用药计划" : "新建用药计划"}</h2></div>
            <button type="button" className="icon-button" aria-label="关闭" onClick={() => setPlanEditor(undefined)}><X /></button>
          </div>
          <MedicationPlanForm baby={baby} date={selectedDate} plan={planEditor} onSaved={async () => { setPlanEditor(undefined); await loadDay(selectedDateRef.current); }} onCancel={() => setPlanEditor(undefined)} />
        </>}
      </dialog>
      <dialog ref={intakeDialogRef} className="medication-dialog" aria-labelledby="medication-record-dialog-title" onClose={() => setIntakeEditor(undefined)}>
        {intakeEditor && <>
          <div className="medication-dialog-header">
            <div><p className="eyebrow">ACTUAL INTAKE</p><h2 id="medication-record-dialog-title">登记实际用药</h2></div>
            <button type="button" className="icon-button" aria-label="关闭" onClick={() => setIntakeEditor(undefined)}><X /></button>
          </div>
          <MedicationRecordForm baby={baby} date={selectedDate} editor={intakeEditor} onSaved={handleRecordSaved} onCancel={() => setIntakeEditor(undefined)} />
        </>}
      </dialog>
    </div>
  );
}
