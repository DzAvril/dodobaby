import assert from "node:assert/strict";
import test from "node:test";
import { summarizeFeedings } from "../lib/feeding-summary";

test("喂养日汇总分别统计亲喂、瓶喂母乳和配方奶", () => {
  assert.deepEqual(
    summarizeFeedings([
      { leftDurationMinutes: 8, rightDurationMinutes: 12, expressedMilkMl: null, formulaMl: null },
      { leftDurationMinutes: null, rightDurationMinutes: null, expressedMilkMl: 60, formulaMl: 30 },
      { leftDurationMinutes: 5, rightDurationMinutes: null, expressedMilkMl: 40, formulaMl: null },
    ]),
    { sessionCount: 3, directMinutes: 25, expressedMilkMl: 100, formulaMl: 30, bottleMl: 130 },
  );
});

test("没有喂养记录时返回全零汇总", () => {
  assert.deepEqual(summarizeFeedings([]), {
    sessionCount: 0,
    directMinutes: 0,
    expressedMilkMl: 0,
    formulaMl: 0,
    bottleMl: 0,
  });
});
