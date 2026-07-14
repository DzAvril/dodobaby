"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { ChartNoAxesCombined, ChevronLeft, ChevronRight, Circle, Info, Pencil, Plus, Ruler, Scale, Trash2, X, ZoomIn, ZoomOut } from "lucide-react";
import type { Baby } from "@/components/DiaryApp";
import { jsonRequest } from "@/lib/client-api";
import { formatAge, todayInTimezone } from "@/lib/dates";
import { formatGrowthValue, growthComparisonGeometry, growthSeries, recommendedGrowthRange, type GrowthMetric, type GrowthRange } from "@/lib/growth-chart";
import { trackerViewState } from "@/lib/tracker-view-state";
import type { WhoGrowthSex, WhoPercentile } from "@/lib/who-growth-standards";

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
  { key: "heightCm", label: "身长/身高", unit: "cm", color: "#6f9273", icon: Ruler },
  { key: "headCircumferenceCm", label: "头围", unit: "cm", color: "#9a7fa8", icon: Circle },
];

function latestMetric(records: GrowthRecord[], metric: GrowthMetric) {
  const series = growthSeries(records, metric);
  const latest = series.at(-1);
  const previous = series.at(-2);
  return { latest, delta: latest && previous ? latest.value - previous.value : null };
}

function optionalNumber(value: string) {
  return value.trim() === "" ? null : Number(value);
}

function GrowthRecordForm({ baby, record, onSaved, onCancel }: { baby: Baby; record: GrowthRecord | null; onSaved: (record: GrowthRecord) => void | Promise<void>; onCancel: () => void }) {
  const [measuredDate, setMeasuredDate] = useState(record?.measuredDate ?? todayInTimezone(baby.timezone));
  const [weightKg, setWeightKg] = useState(record?.weightKg?.toString() ?? "");
  const [heightCm, setHeightCm] = useState(record?.heightCm?.toString() ?? "");
  const [headCircumferenceCm, setHeadCircumferenceCm] = useState(record?.headCircumferenceCm?.toString() ?? "");
  const [note, setNote] = useState(record?.note ?? "");
  const [error, setError] = useState("");
  const [pending, setPending] = useState(false);
  const hasMetric = [weightKg, heightCm, headCircumferenceCm].some((value) => value.trim() !== "");

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    if (!hasMetric) {
      setError("请至少填写体重、身高或头围中的一项");
      return;
    }
    setPending(true);
    setError("");
    try {
      const data = await jsonRequest<{ record: GrowthRecord }>(record ? `/api/growth/${record.id}` : "/api/growth", {
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
      await onSaved(data.record);
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
        <label><span>身长/身高 <small>cm</small></span><input type="number" inputMode="decimal" min="20" max="150" step="0.1" value={heightCm} onChange={(event) => setHeightCm(event.target.value)} placeholder="例如 68.5" /></label>
        <label><span>头围 <small>cm</small></span><input type="number" inputMode="decimal" min="15" max="80" step="0.1" value={headCircumferenceCm} onChange={(event) => setHeadCircumferenceCm(event.target.value)} placeholder="例如 43.2" /></label>
      </div>
      <p className="growth-form-hint">至少填写一项。WHO 对比默认 0–23 月使用卧位身长、24 月起使用立位身高；这里不作医疗判断。</p>
      <label><span>备注</span><textarea rows={3} maxLength={300} value={note} onChange={(event) => setNote(event.target.value)} placeholder="例如：社区体检、饭前测量" /></label>
      {error && <p className="form-error" role="alert">{error}</p>}
      <div className="growth-form-actions"><button type="button" className="secondary-button" onClick={onCancel}>取消</button><button className="primary-button" disabled={pending || !hasMetric}>{pending ? "保存中…" : record ? "保存修改" : "添加记录"}</button></div>
    </form>
  );
}

const WHO_CURVES: Array<{ key: WhoPercentile; label: string }> = [
  { key: "p3", label: "P3" },
  { key: "p15", label: "P15" },
  { key: "p50", label: "P50" },
  { key: "p85", label: "P85" },
  { key: "p97", label: "P97" },
];
const GROWTH_ZOOM_LEVELS: GrowthRange[] = [3, 6, 12, 24, 36, 60, "all"];

function monthTickLabel(month: number) {
  if (month === 0) return "出生";
  return month % 12 === 0 ? `${month / 12}岁` : `${month}月`;
}

function GrowthChart({ records, metric, birthDate, sex, rangeMonths }: {
  records: GrowthRecord[];
  metric: GrowthMetric;
  birthDate: string;
  sex: WhoGrowthSex | null;
  rangeMonths: GrowthRange;
}) {
  const config = METRICS.find((item) => item.key === metric)!;
  const containerRef = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(720);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [hoveredId, setHoveredId] = useState<string | null>(null);

  useEffect(() => {
    const element = containerRef.current;
    if (!element) return;
    const update = (nextWidth: number) => setWidth(Math.max(280, Math.round(nextWidth)));
    update(element.getBoundingClientRect().width);
    const observer = new ResizeObserver((entries) => update(entries[0]?.contentRect.width ?? element.clientWidth));
    observer.observe(element);
    return () => observer.disconnect();
  }, []);

  const height = width < 520 ? 300 : 320;
  const chart = growthComparisonGeometry(records, metric, birthDate, sex, rangeMonths, width, height);
  const gridValues = Array.from({ length: 5 }, (_, index) => chart.maxValue - ((chart.maxValue - chart.minValue) * index) / 4);
  const selectedIndex = Math.max(0, chart.points.findIndex((point) => point.id === selectedId));
  const effectiveIndex = selectedId && chart.points[selectedIndex]?.id === selectedId ? selectedIndex : chart.points.length - 1;
  const selected = chart.points[effectiveIndex];
  const previous = effectiveIndex > 0 ? chart.points[effectiveIndex - 1] : null;
  const delta = selected && previous ? selected.value - previous.value : null;
  const selectedReference = selected ? chart.referenceAtDay(selected.ageDay) : null;
  const hoveredIndex = chart.points.findIndex((point) => point.id === hoveredId);
  const tooltipPoint = hoveredIndex >= 0 ? chart.points[hoveredIndex] : null;
  const tooltipReference = tooltipPoint ? chart.referenceAtDay(tooltipPoint.ageDay) : null;
  const tooltipLeft = tooltipPoint ? Math.min(Math.max(tooltipPoint.x, 128), Math.max(128, chart.width - 128)) : 0;
  const tooltipTop = tooltipPoint ? Math.max(tooltipPoint.y - 12, chart.padding.top + 4) : 0;

  if (!chart.points.length && !chart.referencePoints.length) return <div ref={containerRef} className="growth-chart-empty"><ChartNoAxesCombined /><strong>还没有{config.label}数据</strong><span>添加测量后，这里会形成连续趋势。</span></div>;

  function choose(index: number) {
    const point = chart.points[index];
    if (point) setSelectedId(point.id);
  }

  return (
    <div className="growth-chart-area">
      {sex && <div className="growth-chart-legend" aria-label="曲线图例"><span className="personal"><i style={{ backgroundColor: config.color }} />宝宝记录</span>{WHO_CURVES.map(({ key, label }) => <span key={key} className={key}><i />WHO {label}</span>)}</div>}
      <p id="growth-chart-help" className="growth-chart-help">横轴为月龄。悬停、点按或触摸宝宝曲线圆点可查看实际值与同日龄 WHO 百分位参考。</p>
      <div ref={containerRef} className="growth-chart-scroll">
      <svg className="growth-chart" viewBox={`0 0 ${chart.width} ${chart.height}`} width="100%" height={chart.height} role="img" aria-label={`${config.label}按月龄变化曲线，共 ${chart.points.length} 个宝宝测量点${sex ? `，叠加 WHO ${sex === "female" ? "女童" : "男童"}标准` : ""}`} aria-describedby="growth-chart-help">
        {chart.ageTicks.map(({ month, day }) => <g key={month} className="growth-month-grid"><line x1={chart.xForDay(day)} y1={chart.padding.top} x2={chart.xForDay(day)} y2={chart.height - chart.padding.bottom} /><text x={chart.xForDay(day)} y={chart.height - 10} textAnchor={month === 0 ? "start" : day === chart.rangeDays ? "end" : "middle"}>{monthTickLabel(month)}</text></g>)}
        {chart.outerBandPath && <path className="who-band outer" d={chart.outerBandPath} />}
        {chart.innerBandPath && <path className="who-band inner" d={chart.innerBandPath} />}
        {gridValues.map((value, index) => {
          const y = chart.padding.top + (chart.plotHeight * index) / 4;
          return <g key={index}><line x1={chart.padding.left} y1={y} x2={chart.width - chart.padding.right} y2={y} /><text x={chart.padding.left - 6} y={y + 4} textAnchor="end">{formatGrowthValue(value, metric)}</text></g>;
        })}
        {WHO_CURVES.map(({ key, label }) => chart.percentilePaths[key] && <path key={key} className={`who-percentile ${key}`} data-percentile={label} d={chart.percentilePaths[key]} />)}
        {chart.referencePoints.length > 0 && WHO_CURVES.map(({ key, label }) => { const last = chart.referencePoints.at(-1)!; return <text key={key} className={`who-percentile-label ${key}`} x={last.x + 5} y={last.y[key] + 3}>{label}</text>; })}
        {chart.points.length > 1 && <path className="growth-personal-path" d={chart.personalPath} fill="none" stroke={config.color} strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" />}
        {chart.points.map((point, index) => <g key={point.id} className={index === effectiveIndex || point.id === hoveredId ? "selected" : ""} role="button" tabIndex={0} aria-label={`${point.date}，${formatAge(birthDate, point.date)}，${formatGrowthValue(point.value, metric)}${config.unit}`} onClick={() => choose(index)} onPointerEnter={() => setHoveredId(point.id)} onPointerLeave={() => setHoveredId((current) => current === point.id ? null : current)} onPointerDown={() => setHoveredId(point.id)} onFocus={() => setHoveredId(point.id)} onBlur={() => setHoveredId((current) => current === point.id ? null : current)} onKeyDown={(event) => { if (event.key === "Enter" || event.key === " ") { event.preventDefault(); choose(index); } }}><circle className="growth-point-hit" cx={point.x} cy={point.y} r="22" /><circle className="growth-point-dot" cx={point.x} cy={point.y} r={index === effectiveIndex || point.id === hoveredId ? 5 : 3.5} fill="#fffdf9" stroke={config.color} strokeWidth="2.5" /><title>{point.date}（{formatAge(birthDate, point.date)}）：{formatGrowthValue(point.value, metric)}{config.unit}</title></g>)}
      </svg>
      {tooltipPoint && <div className="growth-point-tooltip" aria-hidden="true" style={{ left: tooltipLeft, top: tooltipTop }}>
        <strong>{tooltipPoint.date}</strong>
        <span>{formatAge(birthDate, tooltipPoint.date)}</span>
        <b>实际 {formatGrowthValue(tooltipPoint.value, metric)} {config.unit}</b>
        {tooltipReference ? <div>{WHO_CURVES.map(({ key, label }) => <span key={key}>{label} {formatGrowthValue(tooltipReference[key], metric)}</span>)}</div> : <small>设置宝宝性别后显示 WHO Pxx 参考</small>}
      </div>}
      </div>
      {chart.referenceEndsBeforeRange && <p className="growth-who-limit">WHO 0–5 岁标准曲线在第 1856 天结束，之后仍会继续显示宝宝自己的测量趋势。</p>}
      {chart.hiddenPersonalCount > 0 && <p className="growth-range-note">有 {chart.hiddenPersonalCount} 个测量点超出当前查看范围；选择“全部记录”即可显示。</p>}
      {selected ? <div className="growth-chart-inspector">
        <button type="button" className="icon-button" aria-label={`查看上一个${config.label}测量点`} disabled={effectiveIndex <= 0} onClick={() => choose(effectiveIndex - 1)}><ChevronLeft /></button>
        <div aria-live="polite"><time dateTime={selected.date}>{selected.date}</time><strong>{formatGrowthValue(selected.value, metric)} {config.unit}</strong><span>{formatAge(birthDate, selected.date)} · 第 {effectiveIndex + 1}/{chart.points.length} 个测量点{delta == null ? "" : delta === 0 ? " · 与上次相同" : ` · 较上次 ${delta > 0 ? "+" : ""}${formatGrowthValue(delta, metric)} ${config.unit}`}</span>{selectedReference && <span className="who-reference-readout">同年龄 WHO 参考：P3–P97 {formatGrowthValue(selectedReference.p3, metric)}–{formatGrowthValue(selectedReference.p97, metric)} {config.unit} · P50 {formatGrowthValue(selectedReference.p50, metric)} {config.unit}</span>}</div>
        <button type="button" className="icon-button" aria-label={`查看下一个${config.label}测量点`} disabled={effectiveIndex >= chart.points.length - 1} onClick={() => choose(effectiveIndex + 1)}><ChevronRight /></button>
      </div> : <div className="growth-standard-no-personal"><strong>WHO 标准曲线已显示</strong><span>添加{config.label}测量后，宝宝的个人曲线会叠加在最上层。</span></div>}
    </div>
  );
}

export function GrowthTracker({ baby }: { baby: Baby }) {
  const [records, setRecords] = useState<GrowthRecord[]>([]);
  const [metric, setMetric] = useState<GrowthMetric>("weightKg");
  const [rangeMonths, setRangeMonths] = useState<GrowthRange>(() => recommendedGrowthRange(baby.birthDate, todayInTimezone(baby.timezone)));
  const [editor, setEditor] = useState<GrowthRecord | null | undefined>(undefined);
  const [loading, setLoading] = useState(true);
  const [hasLoaded, setHasLoaded] = useState(false);
  const [error, setError] = useState("");
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [recordError, setRecordError] = useState<{ id: string; message: string } | null>(null);
  const dialogRef = useRef<HTMLDialogElement>(null);
  const requestSequenceRef = useRef(0);

  const loadRecords = useCallback(async () => {
    const requestId = ++requestSequenceRef.current;
    setLoading(true);
    setError("");
    try {
      const data = await jsonRequest<{ records: GrowthRecord[] }>("/api/growth");
      if (requestId !== requestSequenceRef.current) return;
      setRecords(data.records);
      setHasLoaded(true);
    } catch (caught) {
      if (requestId !== requestSequenceRef.current) return;
      setError(caught instanceof Error ? caught.message : "加载失败");
    } finally {
      if (requestId === requestSequenceRef.current) setLoading(false);
    }
  }, []);

  useEffect(() => {
    const requestId = ++requestSequenceRef.current;
    jsonRequest<{ records: GrowthRecord[] }>("/api/growth")
      .then((data) => {
        if (requestId !== requestSequenceRef.current) return;
        setRecords(data.records);
        setHasLoaded(true);
      })
      .catch((caught) => {
        if (requestId === requestSequenceRef.current) setError(caught instanceof Error ? caught.message : "加载失败");
      })
      .finally(() => {
        if (requestId === requestSequenceRef.current) setLoading(false);
      });
    return () => { requestSequenceRef.current += 1; };
  }, []);
  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    if (editor !== undefined && !dialog.open) dialog.showModal();
    if (editor === undefined && dialog.open) dialog.close();
  }, [editor]);

  const summaries = useMemo(() => METRICS.map((item) => ({ ...item, ...latestMetric(records, item.key) })), [records]);
  const viewState = trackerViewState({ loading, error: Boolean(error), hasCurrentData: hasLoaded, itemCount: records.length });
  const whoSex: WhoGrowthSex | null = baby.sex === "male" || baby.sex === "female" ? baby.sex : null;
  const zoomIndex = GROWTH_ZOOM_LEVELS.indexOf(rangeMonths);

  function changeZoom(direction: -1 | 1) {
    const next = GROWTH_ZOOM_LEVELS[zoomIndex + direction];
    if (next != null) setRangeMonths(next);
  }

  async function removeRecord(record: GrowthRecord) {
    if (!window.confirm(`确定删除 ${record.measuredDate} 的生长记录吗？`)) return;
    setDeletingId(record.id);
    setRecordError(null);
    try {
      await jsonRequest(`/api/growth/${record.id}`, { method: "DELETE" });
      await loadRecords();
    } catch (caught) {
      setRecordError({ id: record.id, message: caught instanceof Error ? caught.message : "删除失败，请稍后重试" });
    } finally {
      setDeletingId(null);
    }
  }

  return (
    <div className="module-page growth-page">
      <header className="module-heading"><div><p className="eyebrow">GROWTH TRACKER</p><h1>{baby.name}的生长记录</h1><p>按年龄整理体重、身长/身高与头围，并与 WHO 同年龄标准曲线放在一起查看。</p></div><button className="primary-button module-primary-action" onClick={() => setEditor(null)}><Plus />添加测量</button></header>
      {error && <div className="module-error module-error-with-action" role="alert"><span>{error}</span><button type="button" className="secondary-button" onClick={loadRecords}>重新加载</button></div>}

      {viewState === "loading" && <section className="module-state-card growth-state-card" aria-live="polite"><ChartNoAxesCombined /><strong>正在整理生长记录</strong><span>体重、身高和头围会分别归入自己的趋势。</span></section>}

      {viewState === "empty" && <section className="module-state-card growth-state-card empty"><ChartNoAxesCombined /><strong>记录第一次测量</strong><span>从最近一次体检或家庭测量开始，体重、身长/身高和头围会分别展示，不混用坐标轴。</span><div className="module-state-actions"><button type="button" className="primary-button" onClick={() => setEditor(null)}><Plus />添加第一次测量</button></div></section>}

      {viewState === "content" && <section className="growth-summary-grid" aria-label="最近一次测量">
        {summaries.map(({ key, label, unit, icon: Icon, latest, delta }) => <article key={key}><div className={`metric-icon ${key}`}><Icon /></div><div><span>{label}</span><strong>{latest ? `${formatGrowthValue(latest.value, key)} ${unit}` : "暂无"}</strong><small>{latest ? `${latest.date} · ${formatAge(baby.birthDate, latest.date)}${delta == null ? "" : ` · 较上次 ${delta > 0 ? "+" : ""}${formatGrowthValue(delta, key)} ${unit}`}` : "添加第一次测量"}</small></div></article>)}
      </section>}

      {(viewState === "empty" || viewState === "content") &&
      <section className="growth-chart-card">
        <div className="growth-card-heading"><div><h2>标准生长曲线</h2><p>宝宝的测量点叠加在 WHO 同年龄、同性别儿童的百分位曲线上。</p></div><div className="metric-switch" role="group" aria-label="选择生长指标">{METRICS.map((item) => <button key={item.key} type="button" className={metric === item.key ? "active" : ""} aria-pressed={metric === item.key} onClick={() => setMetric(item.key)}>{item.label}</button>)}</div></div>
        <div className="growth-chart-controls">
          {whoSex ? <div className="growth-standard-status"><Info /><span><strong>WHO {whoSex === "female" ? "女童" : "男童"}标准</strong><small>已按宝宝资料匹配</small></span><Link href="/settings#baby-profile">更改</Link></div> : <div className="growth-standard-gate"><Info /><span><strong>设置性别后显示 WHO 标准曲线</strong><small>不设置也不影响个人记录；系统不会猜测或混用男女标准。</small></span><Link href="/settings#baby-profile">补充宝宝资料</Link></div>}
          <div className="growth-range-control">
            <label className="growth-range-select"><span>查看范围</span><select aria-label="选择生长曲线年龄范围" value={rangeMonths} onChange={(event) => setRangeMonths(event.target.value === "all" ? "all" : Number(event.target.value) as GrowthRange)}><option value="3">出生至 3 个月</option><option value="6">出生至 6 个月</option><option value="12">出生至 1 岁</option><option value="24">出生至 2 岁</option><option value="36">出生至 3 岁</option><option value="60">WHO 全范围（0–60 月）</option><option value="all">全部记录（WHO 至 60 月）</option></select></label>
            <div className="growth-zoom-buttons" role="group" aria-label="缩放生长曲线">
              <button type="button" className="icon-button" aria-label="缩小生长曲线" title="缩小生长曲线" disabled={zoomIndex === GROWTH_ZOOM_LEVELS.length - 1} onClick={() => changeZoom(1)}><ZoomOut /></button>
              <button type="button" className="icon-button" aria-label="放大生长曲线" title="放大生长曲线" disabled={zoomIndex === 0} onClick={() => changeZoom(-1)}><ZoomIn /></button>
            </div>
          </div>
        </div>
        <GrowthChart records={records} metric={metric} birthDate={baby.birthDate} sex={whoSex} rangeMonths={rangeMonths} />
        <p className="growth-standard-disclaimer">WHO 百分位曲线用于展示同年龄、同性别儿童的生长分布参考，不表示正常或异常，也不能替代儿童保健或医生评估。</p>
        <details className="growth-standard-details"><summary>数据与测量说明</summary><p>使用 WHO Child Growth Standards（2006）官方逐日扩展表，覆盖出生第 0–1856 天。身长/身高标准在第 0–730 天使用卧位身长，第 731 天起使用立位身高，并保留两种测量方式的标准切换；当前不会自动换算测量体位或早产儿矫正年龄。</p><a href="https://www.who.int/tools/child-growth-standards/standards" target="_blank" rel="noreferrer">查看 WHO 官方数据来源</a></details>
      </section>}

      {viewState === "content" && <section className="growth-history-card">
        <div className="growth-card-heading"><div><h2>测量历史</h2><p>{loading ? "正在更新记录…" : `共 ${records.length} 次记录`}</p></div></div>
        <div className="growth-history-list">{[...records].reverse().map((record) => <article key={record.id}><time dateTime={record.measuredDate}><strong>{record.measuredDate}</strong><span>{formatAge(baby.birthDate, record.measuredDate)}</span></time><div className="growth-values">{record.weightKg != null && <span><b>{formatGrowthValue(record.weightKg, "weightKg")}</b> kg 体重</span>}{record.heightCm != null && <span><b>{formatGrowthValue(record.heightCm, "heightCm")}</b> cm 身长/身高</span>}{record.headCircumferenceCm != null && <span><b>{formatGrowthValue(record.headCircumferenceCm, "headCircumferenceCm")}</b> cm 头围</span>}</div>{record.note && <p>{record.note}</p>}{recordError?.id === record.id && <p className="growth-record-error" role="alert">{recordError.message}</p>}<div className="growth-record-actions"><button type="button" onClick={() => setEditor(record)}><Pencil />编辑</button><button type="button" className="danger" disabled={deletingId === record.id} onClick={() => removeRecord(record)}><Trash2 />{deletingId === record.id ? "删除中…" : "删除"}</button></div></article>)}</div>
      </section>}

      <dialog ref={dialogRef} className="growth-dialog" aria-labelledby="growth-dialog-title" onClose={() => setEditor(undefined)}>
        <div className="growth-dialog-header"><div><p className="eyebrow">MEASUREMENT</p><h2 id="growth-dialog-title">{editor ? "编辑测量" : "添加测量"}</h2></div><button className="icon-button" aria-label="关闭" onClick={() => setEditor(undefined)}><X /></button></div>
        {editor !== undefined && <GrowthRecordForm key={editor?.id ?? "new"} baby={baby} record={editor} onCancel={() => setEditor(undefined)} onSaved={(saved) => { setRecords((current) => [...current.filter((item) => item.id !== saved.id), saved].sort((left, right) => left.measuredDate.localeCompare(right.measuredDate) || left.createdAt.localeCompare(right.createdAt))); setHasLoaded(true); setEditor(undefined); }} />}
      </dialog>
    </div>
  );
}
