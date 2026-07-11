"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Baby, BadgeAlert, ChevronLeft, ChevronRight, CircleDotDashed, Clock3, Droplets, Layers, Pencil, Plus, Trash2, X } from "lucide-react";
import type { Baby as BabyProfile } from "@/components/DiaryApp";
import { jsonRequest } from "@/lib/client-api";
import { addDays, currentMinuteInTimezone, todayInTimezone } from "@/lib/dates";
import { trackerViewState } from "@/lib/tracker-view-state";

export type DiaperType = "wet" | "dirty" | "both";
export type DiaperAmount = "small" | "medium" | "large";
export type StoolColor = "yellow" | "green" | "brown" | "black" | "red" | "white" | "other";
export type StoolConsistency = "watery" | "loose" | "soft" | "formed" | "hard" | "other";
export type SkinObservation = "clear" | "red" | "broken";

export type DiaperRecord = {
  id: string;
  babyId: string;
  diaperDate: string;
  changedTime: string;
  diaperType: DiaperType;
  urineAmount: DiaperAmount | null;
  stoolAmount: DiaperAmount | null;
  stoolColor: StoolColor | null;
  stoolConsistency: StoolConsistency | null;
  skinObservation: SkinObservation | null;
  note: string | null;
  createdAt: string;
  updatedAt: string;
};

export type DiaperDayResponse = {
  date: string;
  records: DiaperRecord[];
  latest: DiaperRecord | null;
  summary: {
    totalCount: number;
    wetCount: number;
    dirtyCount: number;
    skinObservedCount: number;
    skinConcernCount: number;
  };
};

type EditorState = { record: DiaperRecord | null; preset: DiaperType };

const TYPE_LABELS: Record<DiaperType, string> = { wet: "小便", dirty: "大便", both: "两者都有" };
const AMOUNT_LABELS: Record<DiaperAmount, string> = { small: "少", medium: "中", large: "多" };
const COLOR_LABELS: Record<StoolColor, string> = { yellow: "黄色", green: "绿色", brown: "棕色", black: "黑色", red: "红色", white: "灰白色", other: "其他" };
const CONSISTENCY_LABELS: Record<StoolConsistency, string> = { watery: "水样", loose: "稀软", soft: "糊状", formed: "成形", hard: "干硬", other: "其他" };
const SKIN_LABELS: Record<SkinObservation, string> = { clear: "未见明显发红", red: "观察到发红", broken: "观察到破损或水疱" };
const EMPTY_SUMMARY: DiaperDayResponse["summary"] = { totalCount: 0, wetCount: 0, dirtyCount: 0, skinObservedCount: 0, skinConcernCount: 0 };

function nullableValue<T extends string>(value: T | "") {
  return value || null;
}

function formatDay(date: string) {
  return new Intl.DateTimeFormat("zh-CN", { month: "long", day: "numeric", weekday: "short", timeZone: "UTC" })
    .format(new Date(`${date}T00:00:00Z`));
}

function typeIcon(type: DiaperType) {
  if (type === "wet") return Droplets;
  if (type === "dirty") return CircleDotDashed;
  return Layers;
}

function observationText(record: DiaperRecord) {
  const values = [];
  if (record.urineAmount) values.push(`小便 ${AMOUNT_LABELS[record.urineAmount]}`);
  if (record.stoolAmount) values.push(`大便 ${AMOUNT_LABELS[record.stoolAmount]}`);
  if (record.stoolColor) values.push(COLOR_LABELS[record.stoolColor]);
  if (record.stoolConsistency) values.push(CONSISTENCY_LABELS[record.stoolConsistency]);
  return values;
}

function OptionalSelect<T extends string>({ label, value, options, onChange }: {
  label: string;
  value: T | "";
  options: Record<T, string>;
  onChange: (value: T | "") => void;
}) {
  return <label><span>{label} <small>可选</small></span><select value={value} onChange={(event) => onChange(event.target.value as T | "")}><option value="">未记录</option>{Object.entries(options).map(([optionValue, optionLabel]) => <option key={optionValue} value={optionValue}>{String(optionLabel)}</option>)}</select></label>;
}

export function DiaperRecordForm({ baby, date, record, preset, onSaved, onCancel }: {
  baby: BabyProfile;
  date: string;
  record: DiaperRecord | null;
  preset: DiaperType;
  onSaved: (savedDate: string) => void | Promise<void>;
  onCancel: () => void;
}) {
  const currentMinute = currentMinuteInTimezone(baby.timezone);
  const [diaperDate, setDiaperDate] = useState(record?.diaperDate ?? date);
  const [changedTime, setChangedTime] = useState(record?.changedTime ?? currentMinute.time);
  const [diaperType, setDiaperType] = useState<DiaperType>(record?.diaperType ?? preset);
  const [urineAmount, setUrineAmount] = useState<DiaperAmount | "">(record?.urineAmount ?? "");
  const [stoolAmount, setStoolAmount] = useState<DiaperAmount | "">(record?.stoolAmount ?? "");
  const [stoolColor, setStoolColor] = useState<StoolColor | "">(record?.stoolColor ?? "");
  const [stoolConsistency, setStoolConsistency] = useState<StoolConsistency | "">(record?.stoolConsistency ?? "");
  const [skinObservation, setSkinObservation] = useState<SkinObservation | "">(record?.skinObservation ?? "");
  const [note, setNote] = useState(record?.note ?? "");
  const [error, setError] = useState("");
  const [pending, setPending] = useState(false);
  const today = todayInTimezone(baby.timezone);
  const includesUrine = diaperType === "wet" || diaperType === "both";
  const includesStool = diaperType === "dirty" || diaperType === "both";
  const canSave = Boolean(diaperDate && changedTime) && !pending;

  function selectType(nextType: DiaperType) {
    setDiaperType(nextType);
    if (nextType === "dirty") setUrineAmount("");
    if (nextType === "wet") {
      setStoolAmount("");
      setStoolColor("");
      setStoolConsistency("");
    }
  }

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    if (!canSave) return;
    setPending(true);
    setError("");
    try {
      await jsonRequest(record ? `/api/diapers/${record.id}` : "/api/diapers", {
        method: record ? "PATCH" : "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          diaperDate,
          changedTime,
          diaperType,
          urineAmount: includesUrine ? nullableValue(urineAmount) : null,
          stoolAmount: includesStool ? nullableValue(stoolAmount) : null,
          stoolColor: includesStool ? nullableValue(stoolColor) : null,
          stoolConsistency: includesStool ? nullableValue(stoolConsistency) : null,
          skinObservation: nullableValue(skinObservation),
          note: note.trim() || null,
        }),
      });
      await onSaved(diaperDate);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "保存失败，请稍后重试");
    } finally {
      setPending(false);
    }
  }

  return (
    <form className="diaper-form" onSubmit={submit}>
      <div className="diaper-form-scroll">
        <fieldset className="diaper-type-switch">
          <legend>尿布类型</legend>
          {(["wet", "dirty", "both"] as const).map((type) => {
            const Icon = typeIcon(type);
            return <button key={type} type="button" className={diaperType === type ? "active" : ""} aria-pressed={diaperType === type} onClick={() => selectType(type)}><Icon />{TYPE_LABELS[type]}</button>;
          })}
        </fieldset>

        <div className="diaper-basics">
          <label><span>日期</span><input type="date" value={diaperDate} min={baby.birthDate} max={today} onChange={(event) => setDiaperDate(event.target.value)} required /></label>
          <label><span>更换时间</span><input type="time" value={changedTime} max={diaperDate === today ? currentMinute.time : undefined} onChange={(event) => setChangedTime(event.target.value)} required autoFocus /></label>
        </div>

        {includesUrine && <fieldset className="diaper-form-section wet"><legend><Droplets />小便观察</legend><OptionalSelect label="小便量" value={urineAmount} options={AMOUNT_LABELS} onChange={setUrineAmount} /></fieldset>}

        {includesStool && <fieldset className="diaper-form-section dirty"><legend><CircleDotDashed />大便观察</legend><div className="diaper-detail-grid"><OptionalSelect label="大便量" value={stoolAmount} options={AMOUNT_LABELS} onChange={setStoolAmount} /><OptionalSelect label="颜色" value={stoolColor} options={COLOR_LABELS} onChange={setStoolColor} /><OptionalSelect label="性状" value={stoolConsistency} options={CONSISTENCY_LABELS} onChange={setStoolConsistency} /></div></fieldset>}

        <fieldset className="diaper-form-section skin"><legend><BadgeAlert />皮肤观察 <small>可选</small></legend><div className="diaper-skin-options"><label className={!skinObservation ? "active" : ""}><input type="radio" name="skin-observation" checked={!skinObservation} onChange={() => setSkinObservation("")} /><span>未记录</span></label>{Object.entries(SKIN_LABELS).map(([value, label]) => <label key={value} className={skinObservation === value ? "active" : ""}><input type="radio" name="skin-observation" checked={skinObservation === value} onChange={() => setSkinObservation(value as SkinObservation)} /><span>{label}</span></label>)}</div></fieldset>

        <label className="diaper-note-field"><span>备注 <small>可选</small></span><textarea rows={3} maxLength={300} value={note} onChange={(event) => setNote(event.target.value)} placeholder="只记录家庭观察到的事实" /></label>
        <p className="diaper-medical-note">这里只保存家庭观察，不作医疗判断。若情况持续、令你担心，或宝宝同时明显不适，请联系专业医护人员。</p>
        {error && <p className="form-error" role="alert">{error}</p>}
      </div>
      <div className="diaper-form-actions"><button type="button" className="secondary-button" onClick={onCancel} disabled={pending}>取消</button><button className="primary-button" disabled={!canSave}>{pending ? "保存中…" : record ? "保存修改" : "保存记录"}</button></div>
    </form>
  );
}

export function DiaperTracker({ baby }: { baby: BabyProfile }) {
  const today = todayInTimezone(baby.timezone);
  const [selectedDate, setSelectedDate] = useState(today);
  const [dayData, setDayData] = useState<DiaperDayResponse | null>(null);
  const [editor, setEditor] = useState<EditorState | undefined>(undefined);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const dialogRef = useRef<HTMLDialogElement>(null);
  const openerRef = useRef<HTMLElement | null>(null);
  const selectedDateRef = useRef(today);
  const requestSequenceRef = useRef(0);
  const deleteSequenceRef = useRef(0);

  const loadDay = useCallback(async (date: string) => {
    if (date !== selectedDateRef.current) return;
    const requestId = ++requestSequenceRef.current;
    setLoading(true);
    setError("");
    try {
      const data = await jsonRequest<DiaperDayResponse>(`/api/diapers?date=${date}`);
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
    jsonRequest<DiaperDayResponse>(`/api/diapers?date=${date}`)
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
    if (editor === undefined && dialog.open) {
      dialog.close();
      window.requestAnimationFrame(() => openerRef.current?.focus());
    }
  }, [editor]);

  const records = useMemo(() => {
    if (dayData?.date !== selectedDate) return [];
    return [...dayData.records].sort((a, b) => b.changedTime.localeCompare(a.changedTime));
  }, [dayData, selectedDate]);
  const hasSelectedDayData = dayData?.date === selectedDate;
  const summary = hasSelectedDayData ? dayData.summary : EMPTY_SUMMARY;
  const latest = hasSelectedDayData ? dayData.latest : null;
  const viewState = trackerViewState({ loading, error: Boolean(error), hasCurrentData: hasSelectedDayData, itemCount: records.length });
  const dayWord = selectedDate === today ? "今日" : "当日";

  function openEditor(record: DiaperRecord | null, preset: DiaperType = record?.diaperType ?? "wet") {
    openerRef.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    setEditor({ record, preset });
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

  async function handleSaved(savedDate: string) {
    closeEditor();
    if (savedDate === selectedDateRef.current) await loadDay(savedDate);
    else changeDate(savedDate);
  }

  async function removeRecord(record: DiaperRecord) {
    if (!window.confirm(`确定删除 ${record.changedTime} 的${TYPE_LABELS[record.diaperType]}记录吗？`)) return;
    const deleteRequestId = ++deleteSequenceRef.current;
    setDeletingId(record.id);
    setError("");
    try {
      await jsonRequest(`/api/diapers/${record.id}`, { method: "DELETE" });
      if (selectedDateRef.current === record.diaperDate) await loadDay(record.diaperDate);
    } catch (caught) {
      if (deleteRequestId === deleteSequenceRef.current && selectedDateRef.current === record.diaperDate) {
        setError(caught instanceof Error ? caught.message : "删除失败，请稍后重试");
      }
    } finally {
      if (deleteRequestId === deleteSequenceRef.current) setDeletingId(null);
    }
  }

  return (
    <div className="module-page diaper-page">
      <header className="module-heading"><div><p className="eyebrow">DIAPER LOG</p><h1>{baby.name}的尿布记录</h1><p>把小便、大便和换尿布时的观察留在独立时间线上，家人交接时更清楚。</p></div><button className="primary-button module-primary-action" onClick={() => openEditor(null)}><Plus />记录尿布</button></header>

      <section className="diaper-quick-actions" aria-label="快速选择尿布类型">
        {(["wet", "dirty", "both"] as const).map((type) => {
          const Icon = typeIcon(type);
          return <button key={type} type="button" className={type} onClick={() => openEditor(null, type)}><Icon /><span><strong>{TYPE_LABELS[type]}</strong><small>预选类型并填写</small></span></button>;
        })}
      </section>

      <section className="feeding-date-bar diaper-date-bar" aria-label="选择查看日期">
        <button type="button" className="icon-button" aria-label="前一天" disabled={selectedDate <= baby.birthDate} onClick={() => changeDate(addDays(selectedDate, -1))}><ChevronLeft /></button>
        <label><span>{selectedDate === today ? "今天" : formatDay(selectedDate)}</span><input type="date" value={selectedDate} min={baby.birthDate} max={today} aria-label="查看尿布日期" onChange={(event) => { if (event.target.value) changeDate(event.target.value); }} /></label>
        <button type="button" className="icon-button" aria-label="后一天" disabled={selectedDate >= today} onClick={() => changeDate(addDays(selectedDate, 1))}><ChevronRight /></button>
        {selectedDate !== today && <button type="button" className="feeding-today-button" onClick={() => changeDate(today)}>回到今天</button>}
      </section>

      {error && <div className="module-error module-error-with-action" role="alert"><span>{error}</span><button type="button" className="secondary-button" onClick={() => loadDay(selectedDate)}>重新加载</button></div>}
      {viewState === "loading" && <section className="module-state-card diaper-state-card" aria-live="polite"><Baby /><strong>正在整理{dayWord}尿布记录</strong><span>小便、大便和皮肤观察会分别汇总。</span></section>}
      {viewState === "empty" && <section className="module-state-card diaper-state-card empty"><Baby /><strong>{selectedDate === today ? "记录今天第一次换尿布" : "这一天没有尿布记录"}</strong><span>{latest ? `最近一次记录是 ${latest.diaperDate} ${latest.changedTime}，${TYPE_LABELS[latest.diaperType]}。` : "选择小便、大便或两者，时间会自动带入宝宝所在时区的当前分钟。"}</span><div className="module-state-actions"><button type="button" className="primary-button" onClick={() => openEditor(null)}><Plus />添加第一条记录</button></div></section>}

      {viewState === "content" && <>
        <section className="diaper-summary-grid" aria-label={`${dayWord}尿布摘要`}>
          <article className="latest"><div className="diaper-summary-icon"><Clock3 /></div><div><span>最近一次</span><strong>{latest ? latest.changedTime : "暂无"}</strong><small>{latest ? `${latest.diaperDate === selectedDate ? dayWord : latest.diaperDate} · ${TYPE_LABELS[latest.diaperType]}` : "添加后会显示"}</small></div></article>
          <article className="wet"><div className="diaper-summary-icon"><Droplets /></div><div><span>{dayWord}小便</span><strong>{summary.wetCount} 次</strong><small>含“两者都有”记录</small></div></article>
          <article className="dirty"><div className="diaper-summary-icon"><CircleDotDashed /></div><div><span>{dayWord}大便</span><strong>{summary.dirtyCount} 次</strong><small>含“两者都有”记录</small></div></article>
          <article className="skin"><div className="diaper-summary-icon"><BadgeAlert /></div><div><span>皮肤观察</span><strong>{summary.skinObservedCount ? `${summary.skinObservedCount} 次` : "未记录"}</strong><small>{summary.skinConcernCount ? `其中 ${summary.skinConcernCount} 次记录发红或破损` : summary.skinObservedCount ? "均记录为未见明显发红" : "不把未观察当作正常"}</small></div></article>
        </section>

        <section className="diaper-timeline-card">
          <div className="diaper-card-heading"><div><p className="eyebrow">DAY TIMELINE</p><h2>{formatDay(selectedDate)}时间线</h2><p>{loading ? "正在更新记录…" : `共 ${summary.totalCount} 次更换记录`}</p></div></div>
          <div className="diaper-timeline">{records.map((record) => {
            const Icon = typeIcon(record.diaperType);
            const values = observationText(record);
            return <article key={record.id}><div className="diaper-time"><time dateTime={`${record.diaperDate}T${record.changedTime}`}>{record.changedTime}</time><span aria-hidden="true" /></div><div className={`diaper-record-card ${record.diaperType}`}><header><div className="diaper-record-title"><Icon /><div><strong>{TYPE_LABELS[record.diaperType]}</strong><small>一次换尿布记录</small></div></div><div className="diaper-record-actions"><button type="button" disabled={deletingId !== null} onClick={() => openEditor(record)}><Pencil />编辑</button><button type="button" className="danger" disabled={deletingId !== null} onClick={() => removeRecord(record)}><Trash2 />{deletingId === record.id ? "删除中…" : "删除"}</button></div></header>{values.length > 0 && <div className="diaper-record-values">{values.map((value, index) => <span key={`${index}-${value}`}>{value}</span>)}</div>}{record.skinObservation && <p className={`diaper-skin-note ${record.skinObservation}`}><BadgeAlert />{SKIN_LABELS[record.skinObservation]}</p>}{record.note && (record.note.length > 100 ? <details className="diaper-note"><summary>查看完整备注</summary><p>{record.note}</p></details> : <p className="diaper-note-text">{record.note}</p>)}</div></article>;
          })}</div>
        </section>
      </>}

      <dialog ref={dialogRef} className="diaper-dialog" aria-labelledby="diaper-dialog-title" onClose={() => { setEditor(undefined); window.requestAnimationFrame(() => openerRef.current?.focus()); }}>
        <div className="diaper-dialog-header"><div><p className="eyebrow">DIAPER ENTRY</p><h2 id="diaper-dialog-title">{editor?.record ? "编辑尿布记录" : `记录${editor ? TYPE_LABELS[editor.preset] : "尿布"}`}</h2></div><button type="button" className="icon-button" aria-label="关闭" onClick={closeEditor}><X /></button></div>
        {editor && <DiaperRecordForm key={`${editor.record?.id ?? "new"}-${editor.preset}-${selectedDate}`} baby={baby} date={selectedDate} record={editor.record} preset={editor.preset} onCancel={closeEditor} onSaved={handleSaved} />}
      </dialog>
    </div>
  );
}
