"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ChartNoAxesCombined, Circle, Pencil, Plus, Ruler, Scale, Trash2, X } from "lucide-react";
import type { Baby } from "@/components/DiaryApp";
import { jsonRequest } from "@/lib/client-api";
import { todayInTimezone } from "@/lib/dates";
import { growthChartGeometry, growthSeries, type GrowthMetric } from "@/lib/growth-chart";

export type GrowthRecord = {
  id: string;
  measuredDate: string;
  weightKg: number | null;
  heightCm: number | null;
  headCircumferenceCm: number | null;
  note: string | null;
  createdAt: string;
  updatedAt: string;
};

const METRICS: Array<{ key: GrowthMetric; label: string; unit: string; color: string; icon: typeof Scale }> = [
  { key: "weightKg", label: "体重", unit: "kg", color: "#d68a52", icon: Scale },
  { key: "heightCm", label: "身高", unit: "cm", color: "#6f9273", icon: Ruler },
  { key: "headCircumferenceCm", label: "头围", unit: "cm", color: "#9a7fa8", icon: Circle },
];

function formatNumber(value: number) {
  return Number.isInteger(value) ? String(value) : value.toFixed(1).replace(/\.0$/, "");
}

function latestMetric(records: GrowthRecord[], metric: GrowthMetric) {
  const series = growthSeries(records, metric);
  const latest = series.at(-1);
  const previous = series.at(-2);
  return { latest, delta: latest && previous ? latest.value - previous.value : null };
}

function optionalNumber(value: string) {
  return value.trim() === "" ? null : Number(value);
}

function GrowthRecordForm({ baby, record, onSaved, onCancel }: { baby: Baby; record: GrowthRecord | null; onSaved: () => void; onCancel: () => void }) {
  const [measuredDate, setMeasuredDate] = useState(record?.measuredDate ?? todayInTimezone(baby.timezone));
  const [weightKg, setWeightKg] = useState(record?.weightKg?.toString() ?? "");
  const [heightCm, setHeightCm] = useState(record?.heightCm?.toString() ?? "");
  const [headCircumferenceCm, setHeadCircumferenceCm] = useState(record?.headCircumferenceCm?.toString() ?? "");
  const [note, setNote] = useState(record?.note ?? "");
  const [error, setError] = useState("");
  const [pending, setPending] = useState(false);

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setPending(true);
    setError("");
    try {
      await jsonRequest(record ? `/api/growth/${record.id}` : "/api/growth", {
        method: record ? "PATCH" : "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          measuredDate,
          weightKg: optionalNumber(weightKg),
          heightCm: optionalNumber(heightCm),
          headCircumferenceCm: optionalNumber(headCircumferenceCm),
          note: note || null,
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
    <form className="growth-form" onSubmit={submit}>
      <label><span>测量日期</span><input type="date" value={measuredDate} min={baby.birthDate} max={todayInTimezone(baby.timezone)} onChange={(event) => setMeasuredDate(event.target.value)} required autoFocus /></label>
      <div className="growth-field-grid">
        <label><span>体重 <small>kg</small></span><input type="number" inputMode="decimal" min="0.5" max="50" step="0.01" value={weightKg} onChange={(event) => setWeightKg(event.target.value)} placeholder="例如 7.35" /></label>
        <label><span>身高 <small>cm</small></span><input type="number" inputMode="decimal" min="20" max="150" step="0.1" value={heightCm} onChange={(event) => setHeightCm(event.target.value)} placeholder="例如 68.5" /></label>
        <label><span>头围 <small>cm</small></span><input type="number" inputMode="decimal" min="15" max="80" step="0.1" value={headCircumferenceCm} onChange={(event) => setHeadCircumferenceCm(event.target.value)} placeholder="例如 43.2" /></label>
      </div>
      <p className="growth-form-hint">至少填写一项。这里展示个人变化趋势，不用于医疗判断。</p>
      <label><span>备注</span><textarea rows={3} maxLength={300} value={note} onChange={(event) => setNote(event.target.value)} placeholder="例如：社区体检、饭前测量" /></label>
      {error && <p className="form-error" role="alert">{error}</p>}
      <div className="growth-form-actions"><button type="button" className="secondary-button" onClick={onCancel}>取消</button><button className="primary-button" disabled={pending}>{pending ? "保存中…" : record ? "保存修改" : "添加记录"}</button></div>
    </form>
  );
}

function GrowthChart({ records, metric }: { records: GrowthRecord[]; metric: GrowthMetric }) {
  const config = METRICS.find((item) => item.key === metric)!;
  const chart = growthChartGeometry(records, metric);
  const gridValues = Array.from({ length: 4 }, (_, index) => chart.maxValue - ((chart.maxValue - chart.minValue) * index) / 3);
  if (!chart.points.length) return <div className="growth-chart-empty"><ChartNoAxesCombined /><strong>还没有{config.label}数据</strong><span>添加测量后，这里会形成连续趋势。</span></div>;

  return (
    <div className="growth-chart-scroll">
      <svg className="growth-chart" viewBox="0 0 720 260" role="img" aria-label={`${config.label}变化曲线，共 ${chart.points.length} 个测量点`}>
        {gridValues.map((value, index) => {
          const y = 20 + (202 * index) / 3;
          return <g key={index}><line x1="48" y1={y} x2="698" y2={y} /><text x="42" y={y + 4} textAnchor="end">{formatNumber(value)}</text></g>;
        })}
        {chart.points.length > 1 && <path d={chart.path} fill="none" stroke={config.color} strokeWidth="4" strokeLinecap="round" strokeLinejoin="round" />}
        {chart.points.map((point) => <g key={point.id}><circle cx={point.x} cy={point.y} r="6" fill="#fffdf9" stroke={config.color} strokeWidth="4" /><title>{point.date}：{formatNumber(point.value)}{config.unit}</title></g>)}
        <text x="48" y="250">{chart.points[0].date.slice(5).replace("-", "/")}</text>
        {chart.points.length > 1 && <text x="698" y="250" textAnchor="end">{chart.points.at(-1)!.date.slice(5).replace("-", "/")}</text>}
      </svg>
    </div>
  );
}

export function GrowthTracker({ baby }: { baby: Baby }) {
  const [records, setRecords] = useState<GrowthRecord[]>([]);
  const [metric, setMetric] = useState<GrowthMetric>("weightKg");
  const [editor, setEditor] = useState<GrowthRecord | null | undefined>(undefined);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const dialogRef = useRef<HTMLDialogElement>(null);

  const loadRecords = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const data = await jsonRequest<{ records: GrowthRecord[] }>("/api/growth");
      setRecords(data.records);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "加载失败");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    let active = true;
    jsonRequest<{ records: GrowthRecord[] }>("/api/growth")
      .then((data) => { if (active) setRecords(data.records); })
      .catch((caught) => { if (active) setError(caught instanceof Error ? caught.message : "加载失败"); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, []);
  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    if (editor !== undefined && !dialog.open) dialog.showModal();
    if (editor === undefined && dialog.open) dialog.close();
  }, [editor]);

  const summaries = useMemo(() => METRICS.map((item) => ({ ...item, ...latestMetric(records, item.key) })), [records]);

  async function removeRecord(record: GrowthRecord) {
    if (!window.confirm(`确定删除 ${record.measuredDate} 的生长记录吗？`)) return;
    await jsonRequest(`/api/growth/${record.id}`, { method: "DELETE" });
    await loadRecords();
  }

  return (
    <div className="module-page growth-page">
      <header className="module-heading"><div><p className="eyebrow">GROWTH TRACKER</p><h1>{baby.name}的生长记录</h1><p>把每次测量留在独立的时间线上，直观看到自己的变化趋势。</p></div><button className="primary-button module-primary-action" onClick={() => setEditor(null)}><Plus />添加测量</button></header>
      {error && <p className="module-error" role="alert">{error}</p>}

      <section className="growth-summary-grid" aria-label="最近一次测量">
        {summaries.map(({ key, label, unit, icon: Icon, latest, delta }) => <article key={key}><div className={`metric-icon ${key}`}><Icon /></div><div><span>{label}</span><strong>{latest ? `${formatNumber(latest.value)} ${unit}` : "暂无"}</strong><small>{latest ? `${latest.date}${delta == null ? "" : ` · 较上次 ${delta > 0 ? "+" : ""}${formatNumber(delta)}${unit}`}` : "添加第一次测量"}</small></div></article>)}
      </section>

      <section className="growth-chart-card">
        <div className="growth-card-heading"><div><h2>生长趋势</h2><p>每项指标独立展示，避免不同单位混在同一坐标轴。</p></div><div className="metric-switch" role="group" aria-label="选择生长指标">{METRICS.map((item) => <button key={item.key} type="button" className={metric === item.key ? "active" : ""} aria-pressed={metric === item.key} onClick={() => setMetric(item.key)}>{item.label}</button>)}</div></div>
        <GrowthChart records={records} metric={metric} />
      </section>

      <section className="growth-history-card">
        <div className="growth-card-heading"><div><h2>测量历史</h2><p>{records.length ? `共 ${records.length} 次记录` : "按日期保存每一次变化"}</p></div></div>
        {loading ? <div className="growth-history-empty">正在加载记录…</div> : records.length ? <div className="growth-history-list">{[...records].reverse().map((record) => <article key={record.id}><time>{record.measuredDate}</time><div className="growth-values">{record.weightKg != null && <span><b>{formatNumber(record.weightKg)}</b> kg 体重</span>}{record.heightCm != null && <span><b>{formatNumber(record.heightCm)}</b> cm 身高</span>}{record.headCircumferenceCm != null && <span><b>{formatNumber(record.headCircumferenceCm)}</b> cm 头围</span>}</div>{record.note && <p>{record.note}</p>}<div className="growth-record-actions"><button type="button" onClick={() => setEditor(record)}><Pencil />编辑</button><button type="button" className="danger" onClick={() => removeRecord(record)}><Trash2 />删除</button></div></article>)}</div> : <div className="growth-history-empty"><ChartNoAxesCombined /><strong>还没有生长记录</strong><span>从最近一次体检或家庭测量开始记录吧。</span><button className="secondary-button" onClick={() => setEditor(null)}><Plus />添加第一次测量</button></div>}
      </section>

      <dialog ref={dialogRef} className="growth-dialog" aria-labelledby="growth-dialog-title" onClose={() => setEditor(undefined)}>
        <div className="growth-dialog-header"><div><p className="eyebrow">MEASUREMENT</p><h2 id="growth-dialog-title">{editor ? "编辑测量" : "添加测量"}</h2></div><button className="icon-button" aria-label="关闭" onClick={() => setEditor(undefined)}><X /></button></div>
        {editor !== undefined && <GrowthRecordForm key={editor?.id ?? "new"} baby={baby} record={editor} onCancel={() => setEditor(undefined)} onSaved={async () => { await loadRecords(); setEditor(undefined); }} />}
      </dialog>
    </div>
  );
}
