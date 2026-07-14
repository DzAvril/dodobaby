import { parseDate } from "@/lib/dates";
import {
  WHO_GROWTH_MAX_DAY,
  WHO_LENGTH_HEIGHT_SWITCH_DAY,
  WHO_PERCENTILES,
  whoGrowthAtDay,
  whoGrowthSeries,
  type WhoGrowthSex,
  type WhoPercentile,
} from "@/lib/who-growth-standards";

export type GrowthMetric = "weightKg" | "heightCm" | "headCircumferenceCm";
export type GrowthRangeMonths = 3 | 6 | 12 | 24 | 36 | 60;
export type GrowthRange = GrowthRangeMonths | "all";
export type GrowthPointSource = {
  id: string;
  measuredDate: string;
  weightKg: number | null;
  heightCm: number | null;
  headCircumferenceCm: number | null;
};

export const GROWTH_RANGE_MAX_DAYS: Record<GrowthRangeMonths, number> = {
  3: 91,
  6: 183,
  12: 365,
  24: 731,
  36: 1096,
  60: WHO_GROWTH_MAX_DAY,
};

export function formatGrowthValue(value: number, metric: GrowthMetric) {
  const precision = metric === "weightKg" ? 2 : 1;
  return Number.isInteger(value) ? String(value) : value.toFixed(precision).replace(/\.?0+$/, "");
}

export function growthSeries(records: GrowthPointSource[], metric: GrowthMetric) {
  return records
    .filter((record): record is GrowthPointSource & Record<GrowthMetric, number> => typeof record[metric] === "number")
    .map((record) => ({ id: record.id, date: record.measuredDate, day: parseDate(record.measuredDate).getTime() / 86_400_000, value: record[metric] }))
    .sort((left, right) => left.day - right.day);
}

export function growthAgeInDays(birthDate: string, measuredDate: string) {
  const days = (parseDate(measuredDate).getTime() - parseDate(birthDate).getTime()) / 86_400_000;
  return days < 0 ? null : days;
}

export function recommendedGrowthRange(birthDate: string, onDate: string): GrowthRange {
  const ageDay = growthAgeInDays(birthDate, onDate);
  if (ageDay == null || ageDay <= GROWTH_RANGE_MAX_DAYS[36]) return 36;
  if (ageDay <= WHO_GROWTH_MAX_DAY) return 60;
  return "all";
}

function percentilePath(
  referencePoints: Array<{ day: number; x: number; y: Record<WhoPercentile, number> }>,
  metric: GrowthMetric,
  percentile: WhoPercentile,
) {
  return referencePoints.map((point, index) => {
    const startsHeightSegment = metric === "heightCm" && point.day === WHO_LENGTH_HEIGHT_SWITCH_DAY;
    return `${index === 0 || startsHeightSegment ? "M" : "L"}${point.x.toFixed(2)},${point.y[percentile].toFixed(2)}`;
  }).join(" ");
}

function bandPath(
  referencePoints: Array<{ day: number; x: number; y: Record<WhoPercentile, number> }>,
  metric: GrowthMetric,
  lower: WhoPercentile,
  upper: WhoPercentile,
) {
  const segments = metric === "heightCm"
    ? [
        referencePoints.filter((point) => point.day < WHO_LENGTH_HEIGHT_SWITCH_DAY),
        referencePoints.filter((point) => point.day >= WHO_LENGTH_HEIGHT_SWITCH_DAY),
      ]
    : [referencePoints];
  return segments.filter((segment) => segment.length > 1).map((segment) => {
    const upperEdge = segment.map((point, index) => `${index === 0 ? "M" : "L"}${point.x.toFixed(2)},${point.y[upper].toFixed(2)}`).join(" ");
    const lowerEdge = [...segment].reverse().map((point) => `L${point.x.toFixed(2)},${point.y[lower].toFixed(2)}`).join(" ");
    return `${upperEdge} ${lowerEdge} Z`;
  }).join(" ");
}

function ageTicks(range: GrowthRange, rangeDays: number) {
  const maxMonth = range === "all" ? Math.ceil(rangeDays / 30.4375) : range;
  const step = maxMonth <= 6 ? 1 : maxMonth <= 12 ? 3 : maxMonth <= 36 ? 6 : maxMonth <= 120 ? 12 : 24;
  return Array.from({ length: Math.floor(maxMonth / step) + 1 }, (_, index) => {
    const month = index * step;
    return { month, day: Math.min(Math.round(month * 30.4375), rangeDays) };
  });
}

export function growthComparisonGeometry(
  records: GrowthPointSource[],
  metric: GrowthMetric,
  birthDate: string,
  sex: WhoGrowthSex | null,
  range: GrowthRange,
  width = 720,
  height = 300,
) {
  const allPersonalSeries = growthSeries(records, metric)
    .map((point) => ({ ...point, ageDay: growthAgeInDays(birthDate, point.date) }))
    .filter((point) => point.ageDay != null)
    .map((point) => ({ ...point, ageDay: point.ageDay as number }));
  const latestPersonalDay = allPersonalSeries.at(-1)?.ageDay ?? 0;
  const rangeDays = range === "all" ? Math.max(WHO_GROWTH_MAX_DAY, latestPersonalDay) : GROWTH_RANGE_MAX_DAYS[range];
  const personalSeries = allPersonalSeries.filter((point) => point.ageDay <= rangeDays);
  const referenceSeries = sex ? whoGrowthSeries(sex, metric, Math.min(rangeDays, WHO_GROWTH_MAX_DAY)) : [];
  const padding = { left: 48, right: referenceSeries.length ? 45 : 22, top: 20, bottom: 42 };
  const plotWidth = width - padding.left - padding.right;
  const plotHeight = height - padding.top - padding.bottom;
  const values = [
    ...personalSeries.map((point) => point.value),
    ...referenceSeries.flatMap((point) => WHO_PERCENTILES.map((percentile) => point[percentile])),
  ];
  const rawMin = values.length ? Math.min(...values) : 0;
  const rawMax = values.length ? Math.max(...values) : 0;
  const valuePadding = values.length ? Math.max((rawMax - rawMin) * 0.06, metric === "weightKg" ? 0.25 : 1) : 0;
  const minValue = Math.max(0, rawMin - valuePadding);
  const maxValue = rawMax + valuePadding;
  const valueRange = Math.max(maxValue - minValue, 1);
  const xForDay = (day: number) => padding.left + (day / rangeDays) * plotWidth;
  const yForValue = (value: number) => padding.top + (1 - (value - minValue) / valueRange) * plotHeight;
  const points = personalSeries.map((point) => ({ ...point, x: xForDay(point.ageDay), y: yForValue(point.value) }));
  const referencePoints = referenceSeries.map((point) => ({
    ...point,
    x: xForDay(point.day),
    y: Object.fromEntries(WHO_PERCENTILES.map((percentile) => [percentile, yForValue(point[percentile])])) as Record<WhoPercentile, number>,
  }));
  const percentilePaths = Object.fromEntries(WHO_PERCENTILES.map((percentile) => [
    percentile,
    percentilePath(referencePoints, metric, percentile),
  ])) as Record<WhoPercentile, string>;

  return {
    personalSeries,
    referenceSeries,
    points,
    personalPath: points.map((point, index) => `${index === 0 ? "M" : "L"}${point.x.toFixed(2)},${point.y.toFixed(2)}`).join(" "),
    referencePoints,
    percentilePaths,
    outerBandPath: bandPath(referencePoints, metric, "p3", "p97"),
    innerBandPath: bandPath(referencePoints, metric, "p15", "p85"),
    ageTicks: ageTicks(range, rangeDays),
    rangeDays,
    hiddenPersonalCount: allPersonalSeries.length - personalSeries.length,
    referenceEndsBeforeRange: referenceSeries.length > 0 && rangeDays > WHO_GROWTH_MAX_DAY,
    whoReferenceMaxDay: WHO_GROWTH_MAX_DAY,
    minValue,
    maxValue,
    width,
    height,
    padding,
    plotWidth,
    plotHeight,
    xForDay,
    referenceAtDay: sex ? (day: number) => whoGrowthAtDay(sex, metric, day) : () => null,
  };
}

export function growthChartGeometry(records: GrowthPointSource[], metric: GrowthMetric, width = 720, height = 260) {
  const series = growthSeries(records, metric);
  const padding = { left: 48, right: 22, top: 20, bottom: 38 };
  const plotWidth = width - padding.left - padding.right;
  const plotHeight = height - padding.top - padding.bottom;
  if (!series.length) {
    return { series, points: [], path: "", minValue: 0, maxValue: 0, width, height, padding, plotWidth, plotHeight };
  }
  const days = series.map((point) => point.day);
  const values = series.map((point) => point.value);
  const minDay = Math.min(...days);
  const maxDay = Math.max(...days);
  const rawMin = Math.min(...values);
  const rawMax = Math.max(...values);
  const valuePadding = Math.max((rawMax - rawMin) * 0.18, metric === "weightKg" ? 0.25 : 1);
  const minValue = Math.max(0, rawMin - valuePadding);
  const maxValue = rawMax + valuePadding;
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
    width,
    height,
    padding,
    plotWidth,
    plotHeight,
  };
}
