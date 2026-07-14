import assert from "node:assert/strict";
import test from "node:test";
import {
  GROWTH_RANGE_MAX_DAYS,
  formatGrowthValue,
  growthAgeInDays,
  growthChartGeometry,
  growthComparisonGeometry,
  growthSeries,
  recommendedGrowthRange,
} from "../lib/growth-chart";

const records = [
  { id: "late", measuredDate: "2026-07-11", weightKg: 7.4, heightCm: 68, headCircumferenceCm: null },
  { id: "early", measuredDate: "2026-06-11", weightKg: 6.8, heightCm: null, headCircumferenceCm: 42 },
];

test("生长曲线按日期排序并跳过缺失指标", () => {
  assert.deepEqual(growthSeries(records, "weightKg").map((point) => point.id), ["early", "late"]);
  assert.deepEqual(growthSeries(records, "heightCm").map((point) => point.id), ["late"]);
  assert.deepEqual(growthSeries(records, "headCircumferenceCm").map((point) => point.id), ["early"]);
});

test("空数据、单点和相同数值不会产生无效坐标", () => {
  assert.deepEqual(growthChartGeometry([], "weightKg").points, []);
  const single = growthChartGeometry([records[0]], "weightKg");
  assert.equal(single.points.length, 1);
  assert.equal(Number.isFinite(single.points[0].x) && Number.isFinite(single.points[0].y), true);

  const flat = growthChartGeometry([
    records[0],
    { ...records[0], id: "later", measuredDate: "2026-07-20" },
  ], "weightKg");
  assert.equal(flat.points.every((point) => Number.isFinite(point.x) && Number.isFinite(point.y)), true);
  assert.match(flat.path, /^M[\d.]+,[\d.]+ L[\d.]+,[\d.]+$/);
});

test("体重保留百分位精度而身高和头围保留一位小数", () => {
  assert.equal(formatGrowthValue(7.35, "weightKg"), "7.35");
  assert.equal(formatGrowthValue(0.010000000000000675, "weightKg"), "0.01");
  assert.equal(formatGrowthValue(68.25, "heightCm"), "68.3");
  assert.equal(formatGrowthValue(43.2, "headCircumferenceCm"), "43.2");
});

test("窄屏几何使用实际宽度并保持全部测量点可见", () => {
  const narrow = growthChartGeometry(records, "weightKg", 326, 230);
  assert.equal(narrow.width, 326);
  assert.equal(narrow.height, 230);
  assert.equal(narrow.points.every((point) => point.x >= narrow.padding.left && point.x <= narrow.width - narrow.padding.right), true);
  assert.equal(narrow.points.every((point) => point.y >= narrow.padding.top && point.y <= narrow.height - narrow.padding.bottom), true);
  assert.equal(narrow.points.at(-1)?.x, narrow.width - narrow.padding.right);
});

test("日龄使用 civil-day 差，正确处理出生边界、跨年和闰日", () => {
  assert.equal(growthAgeInDays("2026-01-01", "2025-12-31"), null);
  assert.equal(growthAgeInDays("2026-01-01", "2026-01-01"), 0);
  assert.equal(growthAgeInDays("2025-12-31", "2026-01-01"), 1);
  assert.equal(growthAgeInDays("2023-02-28", "2023-03-01"), 1);
  assert.equal(growthAgeInDays("2024-02-28", "2024-03-01"), 2);
  assert.equal(growthAgeInDays("2024-02-29", "2025-02-28"), 365);
  assert.deepEqual(GROWTH_RANGE_MAX_DAYS, { 3: 91, 6: 183, 12: 365, 24: 731, 36: 1096, 60: 1856 });
  assert.equal(recommendedGrowthRange("2026-01-01", "2026-07-01"), 36);
  assert.equal(recommendedGrowthRange("2022-01-01", "2026-01-01"), 60);
  assert.equal(recommendedGrowthRange("2020-01-01", "2026-01-01"), "all");
});

test("WHO 对比几何按性别和年龄范围生成参考线，未知性别仍保留个人点", () => {
  const comparisonRecords = [
    { ...records[0], id: "birth", measuredDate: "2026-01-01" },
    { ...records[0], id: "within", measuredDate: "2027-01-01" },
    { ...records[0], id: "outside", measuredDate: "2029-01-01" },
    { ...records[0], id: "before", measuredDate: "2025-12-31" },
  ];
  const male = growthComparisonGeometry(comparisonRecords, "weightKg", "2026-01-01", "male", 24, 360, 280);
  assert.equal(male.rangeDays, 731);
  assert.equal(male.referenceSeries[0].day, 0);
  assert.equal(male.referenceSeries.at(-1)?.day, 731);
  assert.deepEqual(male.ageTicks, [
    { month: 0, day: 0 },
    { month: 6, day: 183 },
    { month: 12, day: 365 },
    { month: 18, day: 548 },
    { month: 24, day: 731 },
  ]);
  assert.deepEqual(male.personalSeries.map((point) => point.id), ["birth", "within"]);
  assert.equal(male.referencePoints[0].x, male.padding.left);
  assert.equal(male.referencePoints.at(-1)?.x, male.width - male.padding.right);
  assert.equal(male.xForDay(0), male.padding.left);
  assert.equal(male.xForDay(male.rangeDays), male.width - male.padding.right);
  assert.deepEqual(male.referenceAtDay(0), { day: 0, p3: 2.507, p15: 2.865, p50: 3.346, p85: 3.878, p97: 4.35 });
  assert.equal(Object.values(male.percentilePaths).every((path) => path.startsWith("M") && !path.includes("NaN")), true);
  assert.match(male.outerBandPath, / Z$/);
  assert.match(male.innerBandPath, / Z$/);

  const unknown = growthComparisonGeometry(comparisonRecords, "weightKg", "2026-01-01", null, 24, 360, 280);
  assert.equal(unknown.referenceSeries.length, 0);
  assert.equal(unknown.referencePoints.length, 0);
  assert.equal(Object.values(unknown.percentilePaths).every((path) => path === ""), true);
  assert.equal(unknown.outerBandPath, "");
  assert.equal(unknown.innerBandPath, "");
  assert.equal(unknown.referenceAtDay(0), null);
  assert.deepEqual(unknown.personalSeries.map((point) => point.id), ["birth", "within"]);

  const fullRange = growthComparisonGeometry([], "weightKg", "2026-01-01", "female", 60, 360, 280);
  assert.deepEqual(fullRange.ageTicks, [
    { month: 0, day: 0 },
    { month: 12, day: 365 },
    { month: 24, day: 731 },
    { month: 36, day: 1096 },
    { month: 48, day: 1461 },
    { month: 60, day: 1826 },
  ]);
  assert.equal(fullRange.referenceSeries.at(-1)?.day, 1856);
});

test("短周期缩放范围提供适合婴儿早期数据的月龄刻度", () => {
  const threeMonths = growthComparisonGeometry([], "weightKg", "2026-01-01", "female", 3, 360, 280);
  assert.equal(threeMonths.rangeDays, 91);
  assert.deepEqual(threeMonths.ageTicks, [
    { month: 0, day: 0 },
    { month: 1, day: 30 },
    { month: 2, day: 61 },
    { month: 3, day: 91 },
  ]);

  const oneYear = growthComparisonGeometry([], "weightKg", "2026-01-01", "female", 12, 360, 280);
  assert.deepEqual(oneYear.ageTicks, [
    { month: 0, day: 0 },
    { month: 3, day: 91 },
    { month: 6, day: 183 },
    { month: 9, day: 274 },
    { month: 12, day: 365 },
  ]);
});

test("身长和身高标准在 day 731 开启新路径段，不跨测量方式连线", () => {
  const height = growthComparisonGeometry([], "heightCm", "2026-01-01", "male", 36, 360, 280);
  assert.equal(height.referenceSeries.some((point) => point.day === 730), true);
  assert.equal(height.referenceSeries.some((point) => point.day === 731), true);
  const switchPrefix = `M${height.xForDay(731).toFixed(2)},`;
  for (const path of Object.values(height.percentilePaths)) {
    assert.equal(path.match(/M/g)?.length, 2);
    assert.equal(path.includes(switchPrefix), true);
  }
  assert.equal(height.outerBandPath.match(/ Z/g)?.length, 2);
  assert.equal(height.innerBandPath.match(/ Z/g)?.length, 2);
});

test("五岁后全部记录继续显示个人趋势，WHO 标准只绘制到 day 1856", () => {
  const olderRecords = [
    { ...records[0], id: "four-years", measuredDate: "2024-01-01" },
    { ...records[0], id: "six-years", measuredDate: "2026-01-01" },
  ];
  const full = growthComparisonGeometry(olderRecords, "weightKg", "2020-01-01", "female", "all", 480, 300);
  assert.deepEqual(full.personalSeries.map((point) => point.id), ["four-years", "six-years"]);
  assert.equal(full.rangeDays, growthAgeInDays("2020-01-01", "2026-01-01"));
  assert.equal(full.referenceSeries.at(-1)?.day, 1856);
  assert.equal(full.referenceEndsBeforeRange, true);
  assert.equal(full.hiddenPersonalCount, 0);
  assert.equal(full.points.at(-1)?.x, full.width - full.padding.right);
  assert.equal(full.referenceAtDay(1857), null);

  const limited = growthComparisonGeometry(olderRecords, "weightKg", "2020-01-01", "female", 60, 480, 300);
  assert.deepEqual(limited.personalSeries.map((point) => point.id), ["four-years"]);
  assert.equal(limited.hiddenPersonalCount, 1);
});
