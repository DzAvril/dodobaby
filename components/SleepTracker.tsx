"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { BedDouble, ChevronLeft, ChevronRight, Clock3, MoonStar, Pencil, Plus, Sunrise, TimerReset, Trash2, X } from "lucide-react";
import type { Baby } from "@/components/DiaryApp";
import { jsonRequest } from "@/lib/client-api";
import { addDays, currentMinuteInTimezone, dayBoundsInTimezone, todayInTimezone, zonedDateTimeToDate } from "@/lib/dates";
import { sleepDurationMinutes, sleepMinutesWithinDay, summarizeSleeps } from "@/lib/sleep-summary";
import { trackerViewState } from "@/lib/tracker-view-state";

export type SleepRecord = {
  id: string;
  babyId: string;
  startedAt: string;
  endedAt: string | null;
  startedDate: string;
  startedTime: string;
  endedDate: string | null;
  endedTime: string | null;
  recordTimezone: string;
  note: string | null;
  createdAt: string;
  updatedAt: string;
  durationMinutes: number;
  dayMinutes: number | null;
};

export type SleepDayResponse = {
  date: string;
  records: SleepRecord[];
  active: SleepRecord | null;
  latest: SleepRecord | null;
  summary: {
    sessionCount: number;
    totalMinutes: number;
    longestMinutes: number;
    ongoingCount: number;
  };
};

type EditorState = {
  mode: "start" | "manual" | "edit" | "end";
  record: SleepRecord | null;
};

const EMPTY_SUMMARY: SleepDayResponse["summary"] = {
  sessionCount: 0,
  totalMinutes: 0,
  longestMinutes: 0,
  ongoingCount: 0,
};

function formatDuration(minutes: number) {
  if (minutes < 1) return "不足 1 分钟";
  const hours = Math.floor(minutes / 60);
  const remainder = minutes % 60;
  if (!hours) return `${remainder} 分钟`;
  return remainder ? `${hours} 小时 ${remainder} 分钟` : `${hours} 小时`;
}

function formatDay(date: string) {
  return new Intl.DateTimeFormat("zh-CN", { month: "long", day: "numeric", weekday: "short", timeZone: "UTC" })
    .format(new Date(`${date}T00:00:00Z`));
}

function recordDates(record: SleepRecord) {
  return {
    startedAt: new Date(record.startedAt),
    endedAt: record.endedAt ? new Date(record.endedAt) : null,
  };
}

export function SleepRecordForm({ baby, date, mode, record, onSaved, onCancel }: {
  baby: Baby;
  date: string;
  mode: "start" | "manual" | "edit";
  record: SleepRecord | null;
  onSaved: (record: SleepRecord) => void | Promise<void>;
  onCancel: () => void;
}) {
  const timezone = record?.recordTimezone ?? baby.timezone;
  const current = currentMinuteInTimezone(timezone);
  const completed = mode === "manual" || Boolean(record?.endedAt);
  const [startedDate, setStartedDate] = useState(record?.startedDate ?? (mode === "start" ? current.date : date));
  const [startedTime, setStartedTime] = useState(record?.startedTime ?? (mode === "start" ? current.time : ""));
  const [endedDate, setEndedDate] = useState(record?.endedDate ?? (mode === "manual" ? date : ""));
  const [endedTime, setEndedTime] = useState(record?.endedTime ?? "");
  const [note, setNote] = useState(record?.note ?? "");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");
  const today = todayInTimezone(timezone);

  let intervalHint = "";
  let durationMinutes: number | null = null;
  try {
    if (startedDate && startedTime) {
      const start = zonedDateTimeToDate(startedDate, startedTime, timezone);
      if (startedDate < baby.birthDate) intervalHint = "开始日期不能早于出生日期。";
      else if (start > new Date()) intervalHint = "开始时间不能晚于当前时间。";
      else if (!completed && new Date().getTime() - start.getTime() > 24 * 60 * 60 * 1_000) intervalHint = "新的进行中睡眠不能从 24 小时前开始，请补录完整区间。";
      if (!intervalHint && completed && endedDate && endedTime) {
        const end = zonedDateTimeToDate(endedDate, endedTime, timezone);
        const difference = Math.floor((end.getTime() - start.getTime()) / 60_000);
        if (end > new Date()) intervalHint = "结束时间不能晚于当前时间。";
        else if (difference <= 0) intervalHint = "结束时间必须晚于开始时间。";
        else if (difference > 1_440) intervalHint = "单次睡眠不能超过 24 小时，请检查日期。";
        else durationMinutes = difference;
      }
    }
  } catch (caught) {
    intervalHint = caught instanceof Error ? `${caught.message}。` : "日期时间无效。";
  }

  const requiredFieldsPresent = Boolean(startedDate && startedTime && (!completed || (endedDate && endedTime)));
  const canSave = requiredFieldsPresent && !intervalHint && !pending;

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    if (!canSave) return;
    setPending(true);
    setError("");
    try {
      const response = await jsonRequest<{ record: SleepRecord }>(record ? `/api/sleeps/${record.id}` : "/api/sleeps", {
        method: record ? "PATCH" : "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          startedDate,
          startedTime,
          endedDate: completed ? endedDate : null,
          endedTime: completed ? endedTime : null,
          note: note.trim() || null,
        }),
      });
      await onSaved(response.record);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "保存失败，请稍后重试");
    } finally {
      setPending(false);
    }
  }

  return (
    <form className="sleep-form" onSubmit={submit}>
      <div className="sleep-form-scroll">
        <fieldset className="sleep-form-section start">
          <legend><MoonStar />开始睡眠</legend>
          <div className="sleep-date-time-grid">
            <label><span>开始日期</span><input type="date" min={baby.birthDate} max={today} value={startedDate} onChange={(event) => setStartedDate(event.target.value)} required /></label>
            <label><span>开始时间</span><input type="time" max={startedDate === today ? current.time : undefined} value={startedTime} onChange={(event) => setStartedTime(event.target.value)} required autoFocus /></label>
          </div>
        </fieldset>

        {completed && <fieldset className="sleep-form-section end">
          <legend><Sunrise />结束睡眠</legend>
          <div className="sleep-date-time-grid">
            <label><span>结束日期</span><input type="date" min={startedDate || baby.birthDate} max={today} value={endedDate} onChange={(event) => setEndedDate(event.target.value)} required /></label>
            <label><span>结束时间</span><input type="time" max={endedDate === today ? current.time : undefined} value={endedTime} onChange={(event) => setEndedTime(event.target.value)} required /></label>
          </div>
          {durationMinutes != null && <p className="sleep-duration-preview"><TimerReset />这段睡眠共 {formatDuration(durationMinutes)}</p>}
        </fieldset>}

        <label className="sleep-note-field"><span>备注 <small>可选</small></span><textarea rows={3} maxLength={300} value={note} onChange={(event) => setNote(event.target.value)} placeholder="只记录家庭观察到的事实" /></label>
        {mode === "start" && <p className="sleep-form-help">确认后会显示为“睡眠中”，宝宝醒来时再记录结束。</p>}
        <p className="sleep-fact-note">这里只记录睡眠事实，不评价是否充足、规律或异常。</p>
        {intervalHint && <p className="sleep-form-hint">{intervalHint}</p>}
        {error && <p className="form-error" role="alert">{error}</p>}
      </div>
      <div className="sleep-form-actions"><button type="button" className="secondary-button" disabled={pending} onClick={onCancel}>取消</button><button className="primary-button" disabled={!canSave}>{pending ? "保存中…" : mode === "start" ? "确认开始" : record ? "保存修改" : "保存补录"}</button></div>
    </form>
  );
}

function EndSleepForm({ record, now, onEnded, onCancel }: {
  record: SleepRecord;
  now: number;
  onEnded: () => void | Promise<void>;
  onCancel: () => void;
}) {
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");
  const current = currentMinuteInTimezone(record.recordTimezone, new Date(now));
  const duration = sleepDurationMinutes(recordDates(record), new Date(now));

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setPending(true);
    setError("");
    try {
      await jsonRequest(`/api/sleeps/${record.id}/end`, { method: "POST" });
      await onEnded();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "保存失败，请稍后重试");
    } finally {
      setPending(false);
    }
  }

  return <form className="sleep-end-form" onSubmit={submit}><div className="sleep-end-facts"><div><span>开始</span><strong>{record.startedDate} {record.startedTime}</strong></div><div><span>结束</span><strong>{current.date} {current.time}</strong></div><div><span>截至现在</span><strong>{formatDuration(duration)}</strong></div></div>{duration > 1_440 && <p className="sleep-stale-warning">这段记录已超过 24 小时。仍可先结束，随后请核对开始时间；如时间不准确，可删除后补录。</p>}<p>结束时间以服务器当前时刻为准；如开始时间有误，请先取消并编辑记录。</p>{error && <p className="form-error" role="alert">{error}</p>}<div className="sleep-form-actions"><button type="button" className="secondary-button" disabled={pending} onClick={onCancel}>取消</button><button className="primary-button" disabled={pending}>{pending ? "保存中…" : "确认结束"}</button></div></form>;
}

export function SleepTracker({ baby }: { baby: Baby }) {
  const today = todayInTimezone(baby.timezone);
  const [selectedDate, setSelectedDate] = useState(today);
  const [dayData, setDayData] = useState<SleepDayResponse | null>(null);
  const [editor, setEditor] = useState<EditorState | undefined>(undefined);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [clock, setClock] = useState(() => Date.now());
  const dialogRef = useRef<HTMLDialogElement>(null);
  const openerRef = useRef<HTMLElement | null>(null);
  const selectedDateRef = useRef(today);
  const requestSequenceRef = useRef(0);
  const deleteSequenceRef = useRef(0);

  useEffect(() => {
    const timer = window.setInterval(() => setClock(Date.now()), 30_000);
    return () => window.clearInterval(timer);
  }, []);

  const loadDay = useCallback(async (date: string) => {
    if (date !== selectedDateRef.current) return;
    const requestId = ++requestSequenceRef.current;
    setLoading(true);
    setError("");
    try {
      const data = await jsonRequest<SleepDayResponse>(`/api/sleeps?date=${date}`);
      if (requestId !== requestSequenceRef.current || date !== selectedDateRef.current) return;
      setDayData(data);
      setClock(Date.now());
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
    jsonRequest<SleepDayResponse>(`/api/sleeps?date=${date}`)
      .then((data) => {
        if (requestId !== requestSequenceRef.current || date !== selectedDateRef.current) return;
        setDayData(data);
        setClock(Date.now());
      })
      .catch((caught) => {
        if (requestId === requestSequenceRef.current && date === selectedDateRef.current) {
          setError(caught instanceof Error ? caught.message : "加载失败，请稍后重试");
        }
      })
      .finally(() => {
        if (requestId === requestSequenceRef.current && date === selectedDateRef.current) setLoading(false);
      });
    return () => { requestSequenceRef.current += 1; };
  }, [selectedDate]);

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    if (editor !== undefined && !dialog.open) dialog.showModal();
    if (editor === undefined && dialog.open) dialog.close();
  }, [editor]);

  const hasSelectedDayData = dayData?.date === selectedDate;
  const records = useMemo(() => hasSelectedDayData ? [...dayData.records].sort((left, right) => right.startedAt.localeCompare(left.startedAt)) : [], [dayData, hasSelectedDayData]);
  const bounds = useMemo(() => dayBoundsInTimezone(selectedDate, baby.timezone), [baby.timezone, selectedDate]);
  const summary = useMemo(() => hasSelectedDayData ? summarizeSleeps(records.map(recordDates), bounds.start, bounds.end, new Date(clock)) : EMPTY_SUMMARY, [bounds.end, bounds.start, clock, hasSelectedDayData, records]);
  const active = dayData?.active ?? null;
  const latest = hasSelectedDayData ? dayData.latest : null;
  const selectedLatest = records[0] ?? null;
  const viewState = trackerViewState({ loading, error: Boolean(error), hasCurrentData: hasSelectedDayData, itemCount: records.length });
  const dayWord = selectedDate === today ? "今日" : "当日";

  function openEditor(mode: EditorState["mode"], record: SleepRecord | null = null) {
    openerRef.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    setEditor({ mode, record });
  }

  function closeEditor() {
    setEditor(undefined);
  }

  function changeDate(date: string) {
    closeEditor();
    selectedDateRef.current = date;
    requestSequenceRef.current += 1;
    deleteSequenceRef.current += 1;
    setDeletingId(null);
    setLoading(true);
    setError("");
    setSelectedDate(date);
  }

  async function handleSaved(record: SleepRecord) {
    closeEditor();
    if (!record.endedAt && selectedDateRef.current !== today) changeDate(today);
    else await loadDay(selectedDateRef.current);
  }

  async function handleEnded() {
    closeEditor();
    await loadDay(selectedDateRef.current);
  }

  async function removeRecord(record: SleepRecord) {
    const message = record.endedAt
      ? `确定删除 ${record.startedDate} ${record.startedTime} 的睡眠记录吗？`
      : `这条睡眠仍在进行，确定删除 ${record.startedDate} ${record.startedTime} 的记录吗？`;
    if (!window.confirm(message)) return;
    const deleteRequestId = ++deleteSequenceRef.current;
    setDeletingId(record.id);
    setError("");
    try {
      await jsonRequest(`/api/sleeps/${record.id}`, { method: "DELETE" });
      await loadDay(selectedDateRef.current);
    } catch (caught) {
      if (deleteRequestId === deleteSequenceRef.current) setError(caught instanceof Error ? caught.message : "删除失败，请稍后重试");
    } finally {
      if (deleteRequestId === deleteSequenceRef.current) setDeletingId(null);
    }
  }

  const activeDuration = active ? sleepDurationMinutes(recordDates(active), new Date(clock)) : 0;

  return (
    <div className="module-page sleep-page">
      <header className="module-heading"><div><p className="eyebrow">SLEEP LOG</p><h1>{baby.name}的睡眠记录</h1><p>把入睡和醒来的事实留在独立时间线上，跨午夜也按每天实际重叠时长汇总。</p></div><div className="sleep-heading-actions"><button type="button" className="secondary-button" onClick={() => openEditor("manual")}><Plus />补录睡眠</button>{!active && <button type="button" className="primary-button module-primary-action" disabled={!hasSelectedDayData} onClick={() => openEditor("start")}><MoonStar />开始睡眠</button>}</div></header>

      {active && <section className="sleep-active-card" aria-label={`睡眠进行中，开始于 ${active.startedDate} ${active.startedTime}`}><div className="sleep-active-icon"><MoonStar /></div><div><p className="eyebrow">SLEEP IN PROGRESS</p><h2>宝宝正在睡眠</h2><span>{active.startedDate} {active.startedTime} 开始 · 已持续 {formatDuration(activeDuration)}</span></div><div className="sleep-active-actions"><button type="button" className="secondary-button" onClick={() => openEditor("edit", active)}><Pencil />编辑开始</button><button type="button" className="primary-button" onClick={() => openEditor("end", active)}><Sunrise />结束睡眠</button></div></section>}

      <section className="feeding-date-bar sleep-date-bar" aria-label="选择查看日期"><button type="button" className="icon-button" aria-label="前一天" disabled={selectedDate <= baby.birthDate} onClick={() => changeDate(addDays(selectedDate, -1))}><ChevronLeft /></button><label><span>{selectedDate === today ? "今天" : formatDay(selectedDate)}</span><input type="date" value={selectedDate} min={baby.birthDate} max={today} aria-label="查看睡眠日期" onChange={(event) => { if (event.target.value) changeDate(event.target.value); }} /></label><button type="button" className="icon-button" aria-label="后一天" disabled={selectedDate >= today} onClick={() => changeDate(addDays(selectedDate, 1))}><ChevronRight /></button>{selectedDate !== today && <button type="button" className="feeding-today-button" onClick={() => changeDate(today)}>回到今天</button>}</section>

      {error && <div className="module-error module-error-with-action" role="alert"><span>{error}</span><button type="button" className="secondary-button" onClick={() => loadDay(selectedDate)}>重新加载</button></div>}
      {viewState === "loading" && <section className="module-state-card sleep-state-card" aria-live="polite"><BedDouble /><strong>正在整理{dayWord}睡眠</strong><span>跨午夜记录会按自然日实际重叠时长汇总。</span></section>}
      {viewState === "empty" && <section className="module-state-card sleep-state-card empty"><BedDouble /><strong>{selectedDate === today ? "今天还没有睡眠记录" : "这一天没有睡眠记录"}</strong><span>{latest ? `最近一次从 ${latest.startedDate} ${latest.startedTime} 开始${latest.endedAt ? `，持续 ${formatDuration(latest.durationMinutes)}` : "，目前仍在进行"}。` : "可以从现在开始记录，也可以补录一段已经结束的睡眠。"}</span><div className="module-state-actions">{!active && <button type="button" className="primary-button" onClick={() => openEditor("start")}><MoonStar />开始睡眠</button>}<button type="button" className="secondary-button" onClick={() => openEditor("manual")}><Plus />补录睡眠</button></div></section>}

      {viewState === "content" && <>
        <section className="sleep-summary-grid" aria-label={`${dayWord}睡眠摘要`}><article className="total"><div className="sleep-summary-icon"><MoonStar /></div><div><span>{dayWord}睡眠</span><strong>{formatDuration(summary.totalMinutes)}</strong><small>按自然日实际重叠时长</small></div></article><article className="sessions"><div className="sleep-summary-icon"><BedDouble /></div><div><span>睡眠段数</span><strong>{summary.sessionCount} 段</strong><small>{summary.ongoingCount ? `${summary.ongoingCount} 段仍在进行` : "已结束记录与进行中记录"}</small></div></article><article className="longest"><div className="sleep-summary-icon"><TimerReset /></div><div><span>最长一段</span><strong>{formatDuration(summary.longestMinutes)}</strong><small>只计算本日内的部分</small></div></article><article className="recent"><div className="sleep-summary-icon"><Clock3 /></div><div><span>最近一段</span><strong>{selectedLatest ? (selectedLatest.startedDate === selectedDate ? selectedLatest.startedTime : `${selectedLatest.startedDate.slice(5)} ${selectedLatest.startedTime}`) : "暂无"}</strong><small>{selectedLatest?.endedAt ? `${selectedLatest.endedDate === selectedDate ? selectedLatest.endedTime : `${selectedLatest.endedDate?.slice(5)} ${selectedLatest.endedTime}`} 结束` : selectedLatest ? "仍在进行" : "添加后会显示"}</small></div></article></section>

        <section className="sleep-timeline-card"><div className="sleep-card-heading"><div><p className="eyebrow">DAY TIMELINE</p><h2>{formatDay(selectedDate)}时间线</h2><p>{loading ? "正在更新记录…" : `共 ${summary.sessionCount} 段睡眠`}</p></div></div><div className="sleep-timeline">{records.map((record) => {
          const values = recordDates(record);
          const duration = sleepDurationMinutes(values, new Date(clock));
          const dayMinutes = sleepMinutesWithinDay(values, bounds.start, bounds.end, new Date(clock));
          const startsBeforeDay = values.startedAt < bounds.start;
          const endsAfterDay = record.endedAt == null || (values.endedAt != null && values.endedAt > bounds.end);
          return <article key={record.id}><div className="sleep-time"><time dateTime={record.startedAt}>{startsBeforeDay ? record.startedDate.slice(5) : record.startedTime}</time><span aria-hidden="true" /></div><div className={`sleep-record-card ${record.endedAt ? "completed" : "active"}`}><header><div className="sleep-record-title"><MoonStar /><div><strong>{record.startedTime} → {record.endedTime ? (record.endedDate === record.startedDate ? record.endedTime : `${record.endedDate?.slice(5)} ${record.endedTime}`) : "睡眠中"}</strong><small>{formatDuration(duration)}{dayMinutes !== duration ? ` · 本日计入 ${formatDuration(dayMinutes)}` : ""}</small></div></div><div className="sleep-record-actions"><button type="button" disabled={deletingId !== null} aria-label={`编辑 ${record.startedDate} ${record.startedTime} 的睡眠`} onClick={() => openEditor("edit", record)}><Pencil />编辑</button>{!record.endedAt && <button type="button" disabled={deletingId !== null} aria-label={`结束 ${record.startedDate} ${record.startedTime} 的睡眠`} onClick={() => openEditor("end", record)}><Sunrise />结束</button>}<button type="button" className="danger" disabled={deletingId !== null} aria-label={`删除 ${record.startedDate} ${record.startedTime} 的睡眠`} onClick={() => removeRecord(record)}><Trash2 />{deletingId === record.id ? "删除中…" : "删除"}</button></div></header><div className="sleep-record-badges">{startsBeforeDay && <span>前一日开始</span>}{endsAfterDay && <span>{record.endedAt ? "延续至次日" : "仍在进行"}</span>}{record.recordTimezone !== baby.timezone && <span>记录时区 {record.recordTimezone}</span>}</div>{record.note && (record.note.length > 100 ? <details className="sleep-note"><summary>查看完整备注</summary><p>{record.note}</p></details> : <p className="sleep-note-text">{record.note}</p>)}</div></article>;
        })}</div></section>
      </>}

      <dialog ref={dialogRef} className="sleep-dialog" aria-labelledby="sleep-dialog-title" onClose={() => { setEditor(undefined); window.requestAnimationFrame(() => openerRef.current?.focus()); }}><div className="sleep-dialog-header"><div><p className="eyebrow">SLEEP ENTRY</p><h2 id="sleep-dialog-title">{editor?.mode === "start" ? "开始睡眠" : editor?.mode === "manual" ? "补录睡眠" : editor?.mode === "end" ? "结束睡眠" : "编辑睡眠"}</h2></div><button type="button" className="icon-button" aria-label="关闭" onClick={closeEditor}><X /></button></div>{editor && editor.mode !== "end" && <SleepRecordForm key={`${editor.mode}-${editor.record?.id ?? selectedDate}`} baby={baby} date={selectedDate} mode={editor.mode} record={editor.record} onCancel={closeEditor} onSaved={handleSaved} />}{editor?.mode === "end" && editor.record && <EndSleepForm record={editor.record} now={clock} onCancel={closeEditor} onEnded={handleEnded} />}</dialog>
    </div>
  );
}
