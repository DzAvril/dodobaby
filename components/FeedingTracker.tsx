"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Baby, ChevronLeft, ChevronRight, Clock3, Milk, Pencil, Plus, Trash2, X } from "lucide-react";
import type { Baby as BabyProfile } from "@/components/DiaryApp";
import { jsonRequest } from "@/lib/client-api";
import { addDays, todayInTimezone } from "@/lib/dates";
import { currentMinuteInTimezone } from "@/lib/feeding-validation";
import { trackerViewState } from "@/lib/tracker-view-state";

export type FeedingRecord = {
  id: string;
  babyId: string;
  feedingDate: string;
  startedTime: string;
  leftDurationMinutes: number | null;
  rightDurationMinutes: number | null;
  expressedMilkMl: number | null;
  formulaMl: number | null;
  note: string | null;
  createdAt: string;
  updatedAt: string;
};

export type FeedingDayResponse = {
  date: string;
  records: FeedingRecord[];
  latest: FeedingRecord | null;
  summary: {
    sessionCount: number;
    directMinutes: number;
    expressedMilkMl: number;
    formulaMl: number;
    bottleMl: number;
  };
};

const EMPTY_SUMMARY: FeedingDayResponse["summary"] = {
  sessionCount: 0,
  directMinutes: 0,
  expressedMilkMl: 0,
  formulaMl: 0,
  bottleMl: 0,
};

function optionalNumber(value: string) {
  return value.trim() === "" ? null : Number(value);
}

function isPositiveNumber(value: string) {
  if (!value.trim()) return false;
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0;
}

function isValidDuration(value: string) {
  if (!value.trim()) return true;
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed >= 1 && parsed <= 180;
}

function isValidMilkAmount(value: string) {
  if (!value.trim()) return true;
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 && parsed <= 1000;
}

function formatDay(date: string) {
  return new Intl.DateTimeFormat("zh-CN", { month: "long", day: "numeric", weekday: "short", timeZone: "UTC" })
    .format(new Date(`${date}T00:00:00Z`));
}

function feedingDescription(record: FeedingRecord) {
  const directMinutes = (record.leftDurationMinutes ?? 0) + (record.rightDurationMinutes ?? 0);
  return [
    directMinutes ? `亲喂 ${directMinutes} 分钟` : "",
    record.expressedMilkMl ? `母乳 ${record.expressedMilkMl} ml` : "",
    record.formulaMl ? `配方奶 ${record.formulaMl} ml` : "",
  ].filter(Boolean).join(" · ");
}

export function FeedingRecordForm({ baby, date, record, onSaved, onCancel }: {
  baby: BabyProfile;
  date: string;
  record: FeedingRecord | null;
  onSaved: (savedDate: string) => void | Promise<void>;
  onCancel: () => void;
}) {
  const currentMinute = currentMinuteInTimezone(baby.timezone);
  const [feedingDate, setFeedingDate] = useState(record?.feedingDate ?? date);
  const [startedTime, setStartedTime] = useState(record?.startedTime ?? currentMinute.time);
  const [leftDurationMinutes, setLeftDurationMinutes] = useState(record?.leftDurationMinutes?.toString() ?? "");
  const [rightDurationMinutes, setRightDurationMinutes] = useState(record?.rightDurationMinutes?.toString() ?? "");
  const [expressedMilkMl, setExpressedMilkMl] = useState(record?.expressedMilkMl?.toString() ?? "");
  const [formulaMl, setFormulaMl] = useState(record?.formulaMl?.toString() ?? "");
  const [note, setNote] = useState(record?.note ?? "");
  const [error, setError] = useState("");
  const [pending, setPending] = useState(false);
  const today = todayInTimezone(baby.timezone);
  const hasAmount = [leftDurationMinutes, rightDurationMinutes, expressedMilkMl, formulaMl].some(isPositiveNumber);
  const directMinutes = (optionalNumber(leftDurationMinutes) ?? 0) + (optionalNumber(rightDurationMinutes) ?? 0);
  const amountsValid = isValidDuration(leftDurationMinutes)
    && isValidDuration(rightDurationMinutes)
    && directMinutes <= 240
    && isValidMilkAmount(expressedMilkMl)
    && isValidMilkAmount(formulaMl);
  const canSave = Boolean(feedingDate && startedTime && hasAmount && amountsValid) && !pending;
  const amountHint = !hasAmount
    ? "至少填写一项亲喂时长或瓶喂奶量。"
    : !isValidDuration(leftDurationMinutes) || !isValidDuration(rightDurationMinutes)
      ? "单侧亲喂时长需填写 1 至 180 的整数。"
      : directMinutes > 240
        ? "左右两侧总时长不能超过 240 分钟。"
        : !isValidMilkAmount(expressedMilkMl) || !isValidMilkAmount(formulaMl)
          ? "单项瓶喂奶量需大于 0，且不能超过 1000 ml。"
          : "";

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    if (!canSave) return;
    setPending(true);
    setError("");
    try {
      await jsonRequest(record ? `/api/feedings/${record.id}` : "/api/feedings", {
        method: record ? "PATCH" : "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          feedingDate,
          startedTime,
          leftDurationMinutes: optionalNumber(leftDurationMinutes),
          rightDurationMinutes: optionalNumber(rightDurationMinutes),
          expressedMilkMl: optionalNumber(expressedMilkMl),
          formulaMl: optionalNumber(formulaMl),
          note: note.trim() || null,
        }),
      });
      await onSaved(feedingDate);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "保存失败，请稍后重试");
    } finally {
      setPending(false);
    }
  }

  return (
    <form className="feeding-form" onSubmit={submit}>
      <div className="feeding-basics">
        <label><span>日期</span><input type="date" value={feedingDate} min={baby.birthDate} max={today} onChange={(event) => setFeedingDate(event.target.value)} required /></label>
        <label><span>开始时间</span><input type="time" value={startedTime} max={feedingDate === today ? currentMinute.time : undefined} onChange={(event) => setStartedTime(event.target.value)} required autoFocus /></label>
      </div>

      <fieldset className="feeding-form-section direct">
        <legend><Baby />亲喂时长</legend>
        <p>可以只记一侧，也可以把左右两侧记在同一次喂养中。</p>
        <div>
          <label><span>左侧 <small>分钟</small></span><input type="number" inputMode="numeric" min="1" max="180" step="1" value={leftDurationMinutes} onChange={(event) => setLeftDurationMinutes(event.target.value)} placeholder="例如 12" /></label>
          <label><span>右侧 <small>分钟</small></span><input type="number" inputMode="numeric" min="1" max="180" step="1" value={rightDurationMinutes} onChange={(event) => setRightDurationMinutes(event.target.value)} placeholder="例如 10" /></label>
        </div>
      </fieldset>

      <fieldset className="feeding-form-section bottle">
        <legend><Milk />瓶喂奶量</legend>
        <p>同一会话里混合喂养时，可以与亲喂时长一起填写。</p>
        <div>
          <label><span>母乳 <small>ml</small></span><input type="number" inputMode="numeric" min="1" max="1000" step="1" value={expressedMilkMl} onChange={(event) => setExpressedMilkMl(event.target.value)} placeholder="例如 60" /></label>
          <label><span>配方奶 <small>ml</small></span><input type="number" inputMode="numeric" min="1" max="1000" step="1" value={formulaMl} onChange={(event) => setFormulaMl(event.target.value)} placeholder="例如 90" /></label>
        </div>
      </fieldset>

      <label className="feeding-note-field"><span>备注 <small>可选</small></span><textarea rows={3} maxLength={300} value={note} onChange={(event) => setNote(event.target.value)} placeholder="例如：先亲喂，再补充瓶喂" /></label>
      {amountHint && <p className="feeding-form-hint">{amountHint}</p>}
      {error && <p className="form-error" role="alert">{error}</p>}
      <div className="feeding-form-actions"><button type="button" className="secondary-button" onClick={onCancel} disabled={pending}>取消</button><button className="primary-button" disabled={!canSave}>{pending ? "保存中…" : record ? "保存修改" : "添加记录"}</button></div>
    </form>
  );
}

export function FeedingTracker({ baby }: { baby: BabyProfile }) {
  const today = todayInTimezone(baby.timezone);
  const [selectedDate, setSelectedDate] = useState(today);
  const [dayData, setDayData] = useState<FeedingDayResponse | null>(null);
  const [editor, setEditor] = useState<FeedingRecord | null | undefined>(undefined);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const dialogRef = useRef<HTMLDialogElement>(null);
  const selectedDateRef = useRef(today);
  const requestSequenceRef = useRef(0);

  const loadDay = useCallback(async (date: string) => {
    if (date !== selectedDateRef.current) return;
    const requestId = ++requestSequenceRef.current;
    setLoading(true);
    setError("");
    try {
      const data = await jsonRequest<FeedingDayResponse>(`/api/feedings?date=${date}`);
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
    jsonRequest<FeedingDayResponse>(`/api/feedings?date=${date}`)
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
    const dialog = dialogRef.current;
    if (!dialog) return;
    if (editor !== undefined && !dialog.open) dialog.showModal();
    if (editor === undefined && dialog.open) dialog.close();
  }, [editor]);

  const records = useMemo(() => {
    if (dayData?.date !== selectedDate) return [];
    return [...dayData.records].sort((a, b) => a.startedTime.localeCompare(b.startedTime));
  }, [dayData, selectedDate]);
  const hasSelectedDayData = dayData?.date === selectedDate;
  const summary = hasSelectedDayData ? dayData.summary : EMPTY_SUMMARY;
  const latest = hasSelectedDayData ? dayData.latest : null;
  const dayWord = selectedDate === today ? "今日" : "当日";
  const viewState = trackerViewState({ loading, error: Boolean(error), hasCurrentData: hasSelectedDayData, itemCount: records.length });

  function changeDate(date: string) {
    setEditor(undefined);
    selectedDateRef.current = date;
    requestSequenceRef.current += 1;
    setLoading(true);
    setError("");
    setSelectedDate(date);
  }

  async function handleSaved(savedDate: string) {
    setEditor(undefined);
    if (savedDate === selectedDateRef.current) await loadDay(savedDate);
    else changeDate(savedDate);
  }

  async function removeRecord(record: FeedingRecord) {
    if (!window.confirm(`确定删除 ${record.startedTime} 的喂养记录吗？`)) return;
    setDeletingId(record.id);
    setError("");
    try {
      await jsonRequest(`/api/feedings/${record.id}`, { method: "DELETE" });
      if (selectedDateRef.current === record.feedingDate) await loadDay(record.feedingDate);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "删除失败，请稍后重试");
    } finally {
      setDeletingId(null);
    }
  }

  return (
    <div className="module-page feeding-page">
      <header className="module-heading"><div><p className="eyebrow">FEEDING LOG</p><h1>{baby.name}的喂养记录</h1><p>把亲喂时长、母乳和配方奶量记录在独立时间线上，交接照护时更清楚。</p></div><button className="primary-button module-primary-action" onClick={() => setEditor(null)}><Plus />添加喂养</button></header>

      <section className="feeding-date-bar" aria-label="选择查看日期">
        <button type="button" className="icon-button" aria-label="前一天" disabled={selectedDate <= baby.birthDate} onClick={() => changeDate(addDays(selectedDate, -1))}><ChevronLeft /></button>
        <label><span>{selectedDate === today ? "今天" : formatDay(selectedDate)}</span><input type="date" value={selectedDate} min={baby.birthDate} max={today} aria-label="查看日期" onChange={(event) => { if (event.target.value) changeDate(event.target.value); }} /></label>
        <button type="button" className="icon-button" aria-label="后一天" disabled={selectedDate >= today} onClick={() => changeDate(addDays(selectedDate, 1))}><ChevronRight /></button>
        {selectedDate !== today && <button type="button" className="feeding-today-button" onClick={() => changeDate(today)}>回到今天</button>}
      </section>

      {error && <div className="module-error module-error-with-action" role="alert"><span>{error}</span><button type="button" className="secondary-button" onClick={() => loadDay(selectedDate)}>重新加载</button></div>}

      {viewState === "loading" && <section className="module-state-card feeding-state-card" aria-live="polite"><Milk /><strong>正在整理{dayWord}喂养</strong><span>亲喂时长、母乳和配方奶会汇总在同一天内。</span></section>}

      {viewState === "empty" && <section className="module-state-card feeding-state-card empty"><Milk /><strong>{selectedDate === today ? "今天还没有喂养记录" : "这一天没有喂养记录"}</strong><span>{latest ? `最近一次记录是 ${latest.feedingDate} ${latest.startedTime}，${feedingDescription(latest)}。` : "从一次亲喂或瓶喂开始，也可以在同一会话中记录混合喂养。"}</span><div className="module-state-actions"><button type="button" className="primary-button" onClick={() => setEditor(null)}><Plus />添加第一次喂养</button></div></section>}

      {viewState === "content" && <>
      <section className="feeding-summary-grid" aria-label={`${dayWord}喂养摘要`}>
        <article className="latest"><div className="feeding-summary-icon"><Clock3 /></div><div><span>最近一次</span><strong>{latest ? `${latest.startedTime}` : "暂无记录"}</strong><small>{latest ? `${latest.feedingDate === selectedDate ? dayWord : latest.feedingDate} · ${feedingDescription(latest)}` : "添加后会显示最近记录"}</small></div></article>
        <article className="direct"><div className="feeding-summary-icon"><Baby /></div><div><span>{dayWord}亲喂</span><strong>{summary.directMinutes ? `${summary.directMinutes} 分钟` : "暂无"}</strong><small>{summary.sessionCount ? `${summary.sessionCount} 次喂养会话` : "还没有喂养记录"}</small></div></article>
        <article className="bottle"><div className="feeding-summary-icon"><Milk /></div><div><span>{dayWord}瓶喂</span><strong>{summary.bottleMl ? `${summary.bottleMl} ml` : "暂无"}</strong><small>{summary.bottleMl ? `母乳 ${summary.expressedMilkMl} ml · 配方奶 ${summary.formulaMl} ml` : "母乳与配方奶合计"}</small></div></article>
      </section>

      <section className="feeding-timeline-card">
        <div className="feeding-card-heading"><div><p className="eyebrow">DAY TIMELINE</p><h2>{formatDay(selectedDate)}时间线</h2><p>{loading ? "正在更新记录…" : `共 ${records.length} 次喂养会话`}</p></div></div>
        <div className="feeding-timeline">{records.map((record) => <article key={record.id}>
          <div className="feeding-time"><time>{record.startedTime}</time><span aria-hidden="true" /></div>
          <div className="feeding-record-card"><header><div><strong>{feedingDescription(record)}</strong><small>一次喂养会话</small></div><div className="feeding-record-actions"><button type="button" onClick={() => setEditor(record)}><Pencil />编辑</button><button type="button" className="danger" disabled={deletingId === record.id} onClick={() => removeRecord(record)}><Trash2 />{deletingId === record.id ? "删除中…" : "删除"}</button></div></header>
            <div className="feeding-record-values">{record.leftDurationMinutes != null && <span className="direct">左侧 {record.leftDurationMinutes} 分钟</span>}{record.rightDurationMinutes != null && <span className="direct">右侧 {record.rightDurationMinutes} 分钟</span>}{record.expressedMilkMl != null && <span className="bottle">母乳 {record.expressedMilkMl} ml</span>}{record.formulaMl != null && <span className="formula">配方奶 {record.formulaMl} ml</span>}</div>
            {record.note && <p>{record.note}</p>}
          </div>
        </article>)}</div>
      </section>
      </>}

      <dialog ref={dialogRef} className="feeding-dialog" aria-labelledby="feeding-dialog-title" onClose={() => setEditor(undefined)}>
        <div className="feeding-dialog-header"><div><p className="eyebrow">FEEDING SESSION</p><h2 id="feeding-dialog-title">{editor ? "编辑喂养" : "添加喂养"}</h2></div><button type="button" className="icon-button" aria-label="关闭" onClick={() => setEditor(undefined)}><X /></button></div>
        {editor !== undefined && <FeedingRecordForm key={editor?.id ?? `new-${selectedDate}`} baby={baby} date={selectedDate} record={editor} onCancel={() => setEditor(undefined)} onSaved={handleSaved} />}
      </dialog>
    </div>
  );
}
