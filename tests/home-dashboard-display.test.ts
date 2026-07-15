import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

test("首页使用紧凑日期页眉并只显示有效喂养值", () => {
  const source = readFileSync(new URL("../components/HomeDashboard.tsx", import.meta.url), "utf8");
  assert.match(source, /home-date-header/);
  assert.doesNotMatch(source, /今天也一起/);
  assert.match(source, /directMinutes > 0/);
  assert.match(source, /bottleMl > 0/);
});

test("首页直接区分尿布类型和具体用药状态", () => {
  const source = readFileSync(new URL("../components/HomeDashboard.tsx", import.meta.url), "utf8");
  assert.match(source, /小便 \$\{diapers\.summary\.wetCount\}/);
  assert.match(source, /大便 \$\{diapers\.summary\.dirtyCount\}/);
  assert.match(source, /已服 \$\{completedMedicationItems\.join/);
  assert.match(source, /待服 \$\{pendingMedicationItems\.join/);
});
