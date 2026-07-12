import assert from "node:assert/strict";
import test from "node:test";
import {
  WHO_GROWTH_MAX_DAY,
  WHO_GROWTH_STANDARD_VERSION,
  WHO_LENGTH_HEIGHT_SWITCH_DAY,
  WHO_PERCENTILES,
  whoGrowthAtDay,
  whoGrowthSeries,
  type WhoGrowthMetric,
  type WhoGrowthSex,
} from "../lib/who-growth-standards";

const sexes: WhoGrowthSex[] = ["male", "female"];
const metrics: WhoGrowthMetric[] = ["weightKg", "heightCm", "headCircumferenceCm"];

test("WHO expanded 日表完整覆盖男女三项指标的 day 0 至 1856", () => {
  assert.equal(WHO_GROWTH_STANDARD_VERSION, "WHO Child Growth Standards (2006), birth to 5 years");
  assert.equal(WHO_GROWTH_MAX_DAY, 1856);
  assert.equal(WHO_LENGTH_HEIGHT_SWITCH_DAY, 731);
  assert.deepEqual(WHO_PERCENTILES, ["p3", "p15", "p50", "p85", "p97"]);

  for (const sex of sexes) {
    for (const metric of metrics) {
      for (let day = 0; day <= WHO_GROWTH_MAX_DAY; day += 1) {
        const point = whoGrowthAtDay(sex, metric, day);
        assert.ok(point, `${sex}/${metric}/day-${day}`);
        assert.equal(point.day, day);
        assert.deepEqual(Object.keys(point).sort(), ["day", ...WHO_PERCENTILES].sort());
        assert.equal(WHO_PERCENTILES.every((percentile) => Number.isFinite(point[percentile]) && point[percentile] > 0), true);
        assert.equal(point.p3 < point.p15 && point.p15 < point.p50 && point.p50 < point.p85 && point.p85 < point.p97, true);
      }
    }
  }
});

test("WHO 逐日 golden 值和 730/731 日身长身高切换保持官方精度", () => {
  // WHO expanded percentile tables:
  // https://www.who.int/tools/child-growth-standards/standards
  assert.deepEqual(whoGrowthAtDay("female", "weightKg", 0), {
    day: 0,
    p3: 2.44,
    p15: 2.779,
    p50: 3.232,
    p85: 3.729,
    p97: 4.166,
  });
  assert.deepEqual(whoGrowthAtDay("female", "weightKg", 1), {
    day: 1,
    p3: 2.398,
    p15: 2.737,
    p50: 3.196,
    p85: 3.704,
    p97: 4.155,
  });
  assert.deepEqual(whoGrowthAtDay("male", "heightCm", 730), {
    day: 730,
    p3: 82.057,
    p15: 84.636,
    p50: 87.802,
    p85: 90.968,
    p97: 93.547,
  });
  assert.deepEqual(whoGrowthAtDay("male", "heightCm", 731), {
    day: 731,
    p3: 81.382,
    p15: 83.962,
    p50: 87.13,
    p85: 90.298,
    p97: 92.879,
  });
  assert.deepEqual(whoGrowthAtDay("female", "headCircumferenceCm", 1856), {
    day: 1856,
    p3: 47.289,
    p15: 48.49,
    p50: 49.965,
    p85: 51.44,
    p97: 52.642,
  });
});

test("WHO 日表不接受非整数日龄、负日龄或 day 1857 外推", () => {
  assert.equal(whoGrowthAtDay("female", "weightKg", -1), null);
  assert.equal(whoGrowthAtDay("female", "weightKg", 0.5), null);
  assert.equal(whoGrowthAtDay("female", "weightKg", Number.NaN), null);
  assert.equal(whoGrowthAtDay("female", "weightKg", Number.POSITIVE_INFINITY), null);
  assert.equal(whoGrowthAtDay("female", "headCircumferenceCm", 1857), null);
});

test("WHO 抽样序列保留首尾日及 730/731 日测量方式切换点", () => {
  const series = whoGrowthSeries("male", "heightCm", WHO_GROWTH_MAX_DAY, 7);
  assert.equal(series[0].day, 0);
  assert.equal(series.at(-1)?.day, WHO_GROWTH_MAX_DAY);
  assert.equal(series.some((point) => point.day === 730), true);
  assert.equal(series.some((point) => point.day === 731), true);
  assert.equal(series.every((point, index) => index === 0 || point.day > series[index - 1].day), true);

  assert.deepEqual(whoGrowthSeries("female", "weightKg", -1, 7), []);
  assert.deepEqual(whoGrowthSeries("female", "weightKg", 10, 0), []);
});
