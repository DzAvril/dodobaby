import { parseDate } from "@/lib/dates";

export type GrowthMetric = "weightKg" | "heightCm" | "headCircumferenceCm";
export type GrowthPointSource = {
  id: string;
  measuredDate: string;
  weightKg: number | null;
  heightCm: number | null;
  headCircumferenceCm: number | null;
};

export function growthSeries(records: GrowthPointSource[], metric: GrowthMetric) {
  return records
    .filter((record): record is GrowthPointSource & Record<GrowthMetric, number> => typeof record[metric] === "number")
    .map((record) => ({ id: record.id, date: record.measuredDate, day: parseDate(record.measuredDate).getTime() / 86_400_000, value: record[metric] }))
    .sort((left, right) => left.day - right.day);
}

export function growthChartGeometry(records: GrowthPointSource[], metric: GrowthMetric, width = 720, height = 260) {
  const series = growthSeries(records, metric);
  if (!series.length) return { series, points: [], path: "", minValue: 0, maxValue: 0 };
  const padding = { left: 48, right: 22, top: 20, bottom: 38 };
  const days = series.map((point) => point.day);
  const values = series.map((point) => point.value);
  const minDay = Math.min(...days);
  const maxDay = Math.max(...days);
  const rawMin = Math.min(...values);
  const rawMax = Math.max(...values);
  const valuePadding = Math.max((rawMax - rawMin) * 0.18, metric === "weightKg" ? 0.25 : 1);
  const minValue = Math.max(0, rawMin - valuePadding);
  const maxValue = rawMax + valuePadding;
  const plotWidth = width - padding.left - padding.right;
  const plotHeight = height - padding.top - padding.bottom;
  const points = series.map((point) => ({
    ...point,
    x: minDay === maxDay ? padding.left + plotWidth / 2 : padding.left + ((point.day - minDay) / (maxDay - minDay)) * plotWidth,
    y: padding.top + (1 - (point.value - minValue) / (maxValue - minValue)) * plotHeight,
  }));
  return {
    series,
    points,
    path: points.map((point, index) => `${index === 0 ? "M" : "L"}${point.x.toFixed(2)},${point.y.toFixed(2)}`).join(" "),
    minValue,
    maxValue,
  };
}
