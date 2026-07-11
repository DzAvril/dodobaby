import assert from "node:assert/strict";
import test from "node:test";
import { growthChartGeometry, growthSeries } from "../lib/growth-chart";

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
