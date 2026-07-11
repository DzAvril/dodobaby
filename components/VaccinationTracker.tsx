"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  CalendarClock,
  Check,
  CircleAlert,
  History,
  Pencil,
  Plus,
  ShieldCheck,
  Syringe,
  Trash2,
  X,
} from "lucide-react";
import type { Baby } from "@/components/DiaryApp";
import { jsonRequest } from "@/lib/client-api";
import { todayInTimezone } from "@/lib/dates";

export type VaccinationCategory = "immunization_program" | "non_immunization_program" | "unknown";
export type VaccinationStatus = "planned" | "completed";

export type VaccinationRecord = {
  id: string;
  babyId?: string;
  vaccineName: string;
  doseNumber: number;
  category: VaccinationCategory;
  status: VaccinationStatus;
  plannedDate: string | null;
  plannedTime: string | null;
  administeredDate: string | null;
  manufacturer: string | null;
  batchNumber: string | null;
  administrationSite: string | null;
  vaccinationUnit: string | null;
  note: string | null;
  createdAt: string;
  updatedAt: string;
};

type EditorState = {
  record: VaccinationRecord | null;
  markCompleted: boolean;
};

const CATEGORY_LABELS: Record<VaccinationCategory, string> = {
  immunization_program: "免疫规划疫苗",
  non_immunization_program: "非免疫规划疫苗",
  unknown: "其他 / 未分类",
};

function nullableText(value: string) {
  return value.trim() || null;
}

function dateLabel(date: string) {
  return new Intl.DateTimeFormat("zh-CN", { year: "numeric", month: "long", day: "numeric", timeZone: "UTC" })
    .format(new Date(`${date}T00:00:00Z`));
}

function dateTimeLabel(record: VaccinationRecord) {
  if (!record.plannedDate) return "计划日期待填写";
  return `${dateLabel(record.plannedDate)}${record.plannedTime ? ` · ${record.plannedTime}` : ""}`;
}

export function vaccinationGroups(records: VaccinationRecord[], today: string) {
  const byPlan = (a: VaccinationRecord, b: VaccinationRecord) =>
    `${a.plannedDate ?? "9999-12-31"} ${a.plannedTime ?? "23:59"}`.localeCompare(`${b.plannedDate ?? "9999-12-31"} ${b.plannedTime ?? "23:59"}`);
  const upcoming = records
    .filter((record) => record.status === "planned" && (!record.plannedDate || record.plannedDate >= today))
    .sort(byPlan);
  const awaitingConfirmation = records
    .filter((record) => record.status === "planned" && record.plannedDate != null && record.plannedDate < today)
    .sort(byPlan);
  const completed = records
    .filter((record) => record.status === "completed")
    .sort((a, b) => (b.administeredDate ?? "").localeCompare(a.administeredDate ?? ""));
  return { upcoming, awaitingConfirmation, completed };
}

export function VaccinationRecordForm({ baby, record, markCompleted, onSaved, onCancel }: {
  baby: Baby;
  record: VaccinationRecord | null;
  markCompleted: boolean;
  onSaved: () => void | Promise<void>;
  onCancel: () => void;
}) {
  const today = todayInTimezone(baby.timezone);
  const initialStatus: VaccinationStatus = markCompleted ? "completed" : record?.status ?? "planned";
  const [status, setStatus] = useState<VaccinationStatus>(initialStatus);
  const [vaccineName, setVaccineName] = useState(record?.vaccineName ?? "");
  const [doseNumber, setDoseNumber] = useState(record?.doseNumber?.toString() ?? "1");
  const [category, setCategory] = useState<VaccinationCategory>(record?.category ?? "unknown");
  const [plannedDate, setPlannedDate] = useState(record?.plannedDate ?? (initialStatus === "planned" ? today : ""));
  const [plannedTime, setPlannedTime] = useState(record?.plannedTime ?? "");
  const [administeredDate, setAdministeredDate] = useState(record?.administeredDate ?? (markCompleted ? today : ""));
  const [manufacturer, setManufacturer] = useState(record?.manufacturer ?? "");
  const [batchNumber, setBatchNumber] = useState(record?.batchNumber ?? "");
  const [administrationSite, setAdministrationSite] = useState(record?.administrationSite ?? "");
  const [vaccinationUnit, setVaccinationUnit] = useState(record?.vaccinationUnit ?? "");
  const [note, setNote] = useState(record?.note ?? "");
  const [error, setError] = useState("");
  const [pending, setPending] = useState(false);
  const parsedDose = Number(doseNumber);
  const doseValid = Number.isInteger(parsedDose) && parsedDose >= 1 && parsedDose <= 99;
  const canSave = Boolean(
    vaccineName.trim()
    && doseValid
    && (status === "planned" ? plannedDate : administeredDate)
    && (!plannedTime || plannedDate),
  ) && !pending;

  function selectStatus(nextStatus: VaccinationStatus) {
    setStatus(nextStatus);
    if (nextStatus === "completed" && !administeredDate) setAdministeredDate(today);
    if (nextStatus === "planned") {
      setAdministeredDate("");
      setManufacturer("");
      setBatchNumber("");
      setAdministrationSite("");
    }
  }

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    if (!canSave) return;
    setPending(true);
    setError("");
    try {
      await jsonRequest(record ? `/api/vaccines/${record.id}` : "/api/vaccines", {
        method: record ? "PATCH" : "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          vaccineName: vaccineName.trim(),
          doseNumber: parsedDose,
          category,
          status,
          plannedDate: nullableText(plannedDate),
          plannedTime: nullableText(plannedTime),
          administeredDate: status === "completed" ? nullableText(administeredDate) : null,
          manufacturer: nullableText(manufacturer),
          batchNumber: nullableText(batchNumber),
          administrationSite: nullableText(administrationSite),
          vaccinationUnit: nullableText(vaccinationUnit),
          note: nullableText(note),
        }),
      });
      await onSaved();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "保存失败，请稍后重试");
    } finally {
      setPending(false);
    }
  }

  return (
    <form className="vaccination-form" onSubmit={submit}>
      <div className="vaccination-form-scroll">
      <fieldset className="vaccination-status-switch">
        <legend>记录类型</legend>
        <button type="button" className={status === "planned" ? "active" : ""} aria-pressed={status === "planned"} onClick={() => selectStatus("planned")}><CalendarClock />计划接种</button>
        <button type="button" className={status === "completed" ? "active" : ""} aria-pressed={status === "completed"} onClick={() => selectStatus("completed")}><ShieldCheck />已接种</button>
      </fieldset>

      <div className="vaccination-field-grid primary-fields">
        <label><span>疫苗名称</span><input autoFocus required maxLength={80} value={vaccineName} onChange={(event) => setVaccineName(event.target.value)} placeholder="按接种记录填写名称" /></label>
        <label><span>剂次</span><input type="number" inputMode="numeric" required min="1" max="99" step="1" value={doseNumber} onChange={(event) => setDoseNumber(event.target.value)} aria-describedby={!doseValid ? "vaccination-dose-hint" : undefined} /></label>
      </div>
      {!doseValid && <p id="vaccination-dose-hint" className="vaccination-form-hint">剂次需填写 1 至 99 的整数。</p>}
      <label><span>分类</span><select value={category} onChange={(event) => setCategory(event.target.value as VaccinationCategory)}>{Object.entries(CATEGORY_LABELS).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label>

      <fieldset className="vaccination-form-section">
        <legend><CalendarClock />计划信息</legend>
        <div className="vaccination-field-grid">
          <label><span>计划日期 {status === "completed" && <small>可选</small>}</span><input type="date" min={baby.birthDate} value={plannedDate} onChange={(event) => setPlannedDate(event.target.value)} required={status === "planned"} /></label>
          <label><span>计划时间 <small>可选</small></span><input type="time" value={plannedTime} onChange={(event) => setPlannedTime(event.target.value)} /></label>
        </div>
      </fieldset>

      {status === "completed" && <fieldset className="vaccination-form-section completed">
        <legend><ShieldCheck />接种事实</legend>
        <label><span>实际接种日期</span><input type="date" min={baby.birthDate} max={today} value={administeredDate} onChange={(event) => setAdministeredDate(event.target.value)} required /></label>
        <div className="vaccination-field-grid">
          <label><span>生产厂家 <small>可选</small></span><input maxLength={80} value={manufacturer} onChange={(event) => setManufacturer(event.target.value)} /></label>
          <label><span>批号 <small>可选</small></span><input maxLength={40} value={batchNumber} onChange={(event) => setBatchNumber(event.target.value)} /></label>
          <label><span>接种部位 <small>可选</small></span><input maxLength={80} value={administrationSite} onChange={(event) => setAdministrationSite(event.target.value)} placeholder="按接种记录填写" /></label>
          <label><span>接种单位 <small>可选</small></span><input maxLength={120} value={vaccinationUnit} onChange={(event) => setVaccinationUnit(event.target.value)} /></label>
        </div>
      </fieldset>}

      {status === "planned" && <label><span>计划接种单位 <small>可选</small></span><input maxLength={120} value={vaccinationUnit} onChange={(event) => setVaccinationUnit(event.target.value)} /></label>}
      <label><span>备注 <small>可选</small></span><textarea rows={3} maxLength={500} value={note} onChange={(event) => setNote(event.target.value)} placeholder="仅记录家庭需要补充的信息" /></label>
      {error && <p className="form-error" role="alert">{error}</p>}
      </div>
      <div className="vaccination-form-actions"><button type="button" className="secondary-button" onClick={onCancel} disabled={pending}>取消</button><button className="primary-button" disabled={!canSave}>{pending ? "保存中…" : markCompleted ? "确认已接种" : record ? "保存修改" : "添加记录"}</button></div>
    </form>
  );
}

function RecordActions({ deleting, onEdit, onComplete, onDelete }: {
  deleting: boolean;
  onEdit: () => void;
  onComplete?: () => void;
  onDelete: () => void;
}) {
  return <div className="vaccination-record-actions">{onComplete && <button type="button" className="complete" onClick={onComplete}><Check />登记已接种</button>}<button type="button" onClick={onEdit}><Pencil />编辑</button><button type="button" className="danger" disabled={deleting} onClick={onDelete}><Trash2 />{deleting ? "删除中…" : "删除"}</button></div>;
}

function VaccineTitle({ record }: { record: VaccinationRecord }) {
  return <div className="vaccination-record-title"><strong title={record.vaccineName}>{record.vaccineName}</strong><span>第 {record.doseNumber} 剂</span><small>{CATEGORY_LABELS[record.category]}</small></div>;
}

export function VaccinationNote({ note }: { note: string | null }) {
  if (!note) return null;
  if (note.length <= 100) return <p>{note}</p>;
  return <details className="vaccination-note"><summary>查看完整备注</summary><p>{note}</p></details>;
}

export function VaccinationTracker({ baby }: { baby: Baby }) {
  const today = todayInTimezone(baby.timezone);
  const [records, setRecords] = useState<VaccinationRecord[]>([]);
  const [editor, setEditor] = useState<EditorState | undefined>(undefined);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const dialogRef = useRef<HTMLDialogElement>(null);
  const openerRef = useRef<HTMLElement | null>(null);

  const loadRecords = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const data = await jsonRequest<{ records: VaccinationRecord[] }>("/api/vaccines");
      setRecords(data.records);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "加载失败，请稍后重试");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    let active = true;
    jsonRequest<{ records: VaccinationRecord[] }>("/api/vaccines")
      .then((data) => { if (active) setRecords(data.records); })
      .catch((caught) => { if (active) setError(caught instanceof Error ? caught.message : "加载失败，请稍后重试"); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, []);

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    if (editor !== undefined && !dialog.open) dialog.showModal();
    if (editor === undefined && dialog.open) {
      dialog.close();
      window.requestAnimationFrame(() => openerRef.current?.focus());
    }
  }, [editor]);

  const groups = useMemo(() => vaccinationGroups(records, today), [records, today]);
  const nextPlan = groups.upcoming[0];
  const firstLoad = loading && records.length === 0;
  const initialFailure = Boolean(error && records.length === 0);
  const empty = !loading && !error && records.length === 0;

  function openEditor(record: VaccinationRecord | null, markCompleted = false) {
    openerRef.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    setEditor({ record, markCompleted });
  }

  function closeEditor() {
    setEditor(undefined);
  }

  function handleDialogClose() {
    setEditor(undefined);
    window.requestAnimationFrame(() => openerRef.current?.focus());
  }

  async function removeRecord(record: VaccinationRecord) {
    if (!window.confirm(`确定删除“${record.vaccineName} 第 ${record.doseNumber} 剂”记录吗？`)) return;
    setDeletingId(record.id);
    setError("");
    try {
      await jsonRequest(`/api/vaccines/${record.id}`, { method: "DELETE" });
      await loadRecords();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "删除失败，请稍后重试");
    } finally {
      setDeletingId(null);
    }
  }

  return (
    <div className="module-page vaccination-page">
      <header className="module-heading"><div><p className="eyebrow">VACCINATION RECORDS</p><h1>{baby.name}的疫苗记录</h1><p>把家庭已有的接种计划和实际接种信息分开记录，查找和交接更清楚。</p></div><button className="primary-button module-primary-action" onClick={() => openEditor(null)}><Plus />添加疫苗记录</button></header>

      <aside className="vaccination-disclaimer" role="note"><CircleAlert /><p>仅保存家庭自行录入的接种计划与接种事实，不提供接种建议；请以接种单位和官方接种记录为准</p></aside>
      {error && <div className="module-error module-error-with-action" role="alert"><span>{error}</span>{initialFailure && <button type="button" className="secondary-button" onClick={loadRecords}>重新加载</button>}</div>}

      {firstLoad && <section className="vaccination-state-card" aria-live="polite"><CalendarClock /><strong>正在整理疫苗记录</strong><span>计划与实际接种事实会分别归入对应区域。</span></section>}

      {empty && <section className="vaccination-state-card onboarding"><Syringe /><strong>从家庭已有记录开始</strong><span>可以添加下一次计划，也可以从官方接种记录中补录已完成的接种事实；这里不会自动生成接种日程。</span><div className="vaccination-state-actions"><button type="button" className="primary-button" onClick={() => openEditor(null)}><Plus />添加计划</button><button type="button" className="secondary-button" onClick={() => openEditor(null, true)}><History />补录已接种</button></div></section>}

      {!firstLoad && !empty && !initialFailure && <>
      <section className="vaccination-summary-grid" aria-label="疫苗记录摘要">
        <article className="next"><div className="vaccination-summary-icon"><CalendarClock /></div><div><span>下一次计划</span><strong>{nextPlan ? nextPlan.plannedDate ? dateLabel(nextPlan.plannedDate) : "日期待定" : "暂无计划"}</strong><small>{nextPlan ? `${nextPlan.vaccineName} · 第 ${nextPlan.doseNumber} 剂${nextPlan.plannedTime ? ` · ${nextPlan.plannedTime}` : ""}` : "可按家庭已有安排添加"}</small></div></article>
        <article className="confirm"><div className="vaccination-summary-icon"><CircleAlert /></div><div><span>待确认</span><strong>{groups.awaitingConfirmation.length ? `${groups.awaitingConfirmation.length} 条` : "暂无"}</strong><small>计划日期已过、尚未登记事实</small></div></article>
        <article className="done"><div className="vaccination-summary-icon"><ShieldCheck /></div><div><span>已记录</span><strong>{groups.completed.length ? `${groups.completed.length} 条` : "暂无"}</strong><small>家庭录入的实际接种记录</small></div></article>
      </section>

      <div className="vaccination-record-sections">
        <section className="vaccination-list-card upcoming">
          <div className="vaccination-card-heading"><div><p className="eyebrow">UPCOMING</p><h2>待接种</h2><p>今天及未来的家庭接种计划</p></div><span>{groups.upcoming.length}</span></div>
          {groups.upcoming.length ? <div className="vaccination-list">{groups.upcoming.map((record) => <article key={record.id}><div className="vaccination-date"><CalendarClock /><time>{dateTimeLabel(record)}</time></div><VaccineTitle record={record} />{record.vaccinationUnit && <p>计划单位：{record.vaccinationUnit}</p>}<VaccinationNote note={record.note} /><RecordActions deleting={deletingId === record.id} onEdit={() => openEditor(record)} onComplete={() => openEditor(record, true)} onDelete={() => removeRecord(record)} /></article>)}</div> : <div className="vaccination-compact-empty">没有待接种计划</div>}
        </section>

        <section className="vaccination-list-card awaiting">
          <div className="vaccination-card-heading"><div><p className="eyebrow">TO CONFIRM</p><h2>待确认</h2><p>计划日期已过，实际接种情况尚未登记</p></div><span>{groups.awaitingConfirmation.length}</span></div>
          {groups.awaitingConfirmation.length ? <div className="vaccination-list">{groups.awaitingConfirmation.map((record) => <article key={record.id}><div className="vaccination-date"><CircleAlert /><time>{dateTimeLabel(record)}</time></div><VaccineTitle record={record} /><VaccinationNote note={record.note} /><RecordActions deleting={deletingId === record.id} onEdit={() => openEditor(record)} onComplete={() => openEditor(record, true)} onDelete={() => removeRecord(record)} /></article>)}</div> : <div className="vaccination-compact-empty">没有需要确认的计划</div>}
        </section>

        <section className="vaccination-list-card history">
          <div className="vaccination-card-heading"><div><p className="eyebrow">HISTORY</p><h2>接种历史</h2><p>家庭录入的实际接种事实</p></div><span>{groups.completed.length}</span></div>
          {groups.completed.length ? <div className="vaccination-list">{groups.completed.map((record) => <article key={record.id}><div className="vaccination-date"><History /><time>{record.administeredDate ? dateLabel(record.administeredDate) : "日期未填写"}</time></div><VaccineTitle record={record} /><div className="vaccination-facts">{record.manufacturer && <span>厂家：{record.manufacturer}</span>}{record.batchNumber && <span>批号：{record.batchNumber}</span>}{record.administrationSite && <span>部位：{record.administrationSite}</span>}{record.vaccinationUnit && <span>单位：{record.vaccinationUnit}</span>}</div><VaccinationNote note={record.note} /><RecordActions deleting={deletingId === record.id} onEdit={() => openEditor(record)} onDelete={() => removeRecord(record)} /></article>)}</div> : <div className="vaccination-empty"><Syringe /><strong>还没有接种历史</strong><span>可以从官方接种记录中逐条补录事实。</span><button className="secondary-button" onClick={() => openEditor(null, true)}><Plus />添加已接种记录</button></div>}
        </section>
      </div>
      </>}

      <dialog ref={dialogRef} className="vaccination-dialog" aria-labelledby="vaccination-dialog-title" onClose={handleDialogClose}>
        <div className="vaccination-dialog-header"><div><p className="eyebrow">VACCINATION ENTRY</p><h2 id="vaccination-dialog-title">{editor?.markCompleted ? "登记已接种" : editor?.record ? "编辑疫苗记录" : "添加疫苗记录"}</h2></div><button type="button" className="icon-button" aria-label="关闭" onClick={closeEditor}><X /></button></div>
        {editor && <VaccinationRecordForm key={`${editor.record?.id ?? "new"}-${editor.markCompleted}`} baby={baby} record={editor.record} markCompleted={editor.markCompleted} onCancel={closeEditor} onSaved={async () => { await loadRecords(); closeEditor(); }} />}
      </dialog>
    </div>
  );
}
