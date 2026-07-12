import { WHO_GROWTH_DATA_ENCODED } from "@/lib/who-growth-data.generated";

export type WhoGrowthSex = "male" | "female";
export type WhoGrowthMetric = "weightKg" | "heightCm" | "headCircumferenceCm";
export type WhoPercentile = "p3" | "p15" | "p50" | "p85" | "p97";
export type WhoGrowthPoint = { day: number } & Record<WhoPercentile, number>;

export const WHO_GROWTH_STANDARD_VERSION = "WHO Child Growth Standards (2006), birth to 5 years";
export const WHO_GROWTH_MAX_DAY = 1856;
export const WHO_LENGTH_HEIGHT_SWITCH_DAY = 731;
export const WHO_PERCENTILES: WhoPercentile[] = ["p3", "p15", "p50", "p85", "p97"];

const VALUES_PER_DAY = WHO_PERCENTILES.length;
const SCALE = 1000;
const decodedCache = new Map<string, Uint32Array>();

function decodeBase64(value: string) {
  const binary = atob(value);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) bytes[index] = binary.charCodeAt(index);
  return bytes;
}

function decodedValues(sex: WhoGrowthSex, metric: WhoGrowthMetric) {
  const cacheKey = `${sex}:${metric}`;
  const cached = decodedCache.get(cacheKey);
  if (cached) return cached;

  const bytes = decodeBase64(WHO_GROWTH_DATA_ENCODED[sex][metric]);
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const values = new Uint32Array((WHO_GROWTH_MAX_DAY + 1) * VALUES_PER_DAY);
  let offset = 0;
  for (let percentileIndex = 0; percentileIndex < VALUES_PER_DAY; percentileIndex += 1) {
    values[percentileIndex] = view.getUint32(offset, true);
    offset += Uint32Array.BYTES_PER_ELEMENT;
  }
  for (let day = 1; day <= WHO_GROWTH_MAX_DAY; day += 1) {
    for (let percentileIndex = 0; percentileIndex < VALUES_PER_DAY; percentileIndex += 1) {
      const index = day * VALUES_PER_DAY + percentileIndex;
      values[index] = values[index - VALUES_PER_DAY] + view.getInt16(offset, true);
      offset += Int16Array.BYTES_PER_ELEMENT;
    }
  }
  if (offset !== bytes.byteLength) throw new Error("WHO 生长标准数据损坏");
  decodedCache.set(cacheKey, values);
  return values;
}

export function whoGrowthAtDay(sex: WhoGrowthSex, metric: WhoGrowthMetric, day: number): WhoGrowthPoint | null {
  if (!Number.isInteger(day) || day < 0 || day > WHO_GROWTH_MAX_DAY) return null;
  const values = decodedValues(sex, metric);
  const offset = day * VALUES_PER_DAY;
  return {
    day,
    p3: values[offset] / SCALE,
    p15: values[offset + 1] / SCALE,
    p50: values[offset + 2] / SCALE,
    p85: values[offset + 3] / SCALE,
    p97: values[offset + 4] / SCALE,
  };
}

export function whoGrowthSeries(
  sex: WhoGrowthSex,
  metric: WhoGrowthMetric,
  maxDay = WHO_GROWTH_MAX_DAY,
  stepDays = 7,
) {
  if (!Number.isFinite(maxDay) || maxDay < 0 || !Number.isInteger(stepDays) || stepDays < 1) return [];
  const cappedMaxDay = Math.min(Math.floor(maxDay), WHO_GROWTH_MAX_DAY);
  const days = new Set<number>([0, cappedMaxDay]);
  for (let day = stepDays; day < cappedMaxDay; day += stepDays) days.add(day);
  if (metric === "heightCm" && cappedMaxDay >= WHO_LENGTH_HEIGHT_SWITCH_DAY - 1) {
    days.add(WHO_LENGTH_HEIGHT_SWITCH_DAY - 1);
    if (cappedMaxDay >= WHO_LENGTH_HEIGHT_SWITCH_DAY) days.add(WHO_LENGTH_HEIGHT_SWITCH_DAY);
  }
  return [...days]
    .sort((left, right) => left - right)
    .map((day) => whoGrowthAtDay(sex, metric, day))
    .filter((point): point is WhoGrowthPoint => point !== null);
}
