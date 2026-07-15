import assert from "node:assert/strict";
import test from "node:test";
import { elapsedFeedingText, minutesSinceFeeding } from "../lib/feeding-elapsed";

test("首页按宝宝时区计算距上次喂奶时间", () => {
  const record = { feedingDate: "2026-07-15", startedTime: "08:30" };
  assert.equal(minutesSinceFeeding(record, "Asia/Shanghai", new Date("2026-07-15T02:45:00Z")), 135);
  assert.equal(minutesSinceFeeding(record, "Asia/Shanghai", new Date("2026-07-15T00:29:00Z")), 0);
});

test("喂奶间隔以适合首页的天、小时和分钟呈现", () => {
  assert.equal(elapsedFeedingText(0), "刚刚");
  assert.equal(elapsedFeedingText(45), "45分钟");
  assert.equal(elapsedFeedingText(120), "2小时");
  assert.equal(elapsedFeedingText(135), "2小时15分");
  assert.equal(elapsedFeedingText(1_560), "1天2小时");
});
