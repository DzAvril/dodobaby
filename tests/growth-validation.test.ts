import assert from "node:assert/strict";
import test from "node:test";
import { validateMeasurementDate } from "../lib/growth-validation";

test("测量日期必须在出生日期和今天之间", () => {
  assert.doesNotThrow(() => validateMeasurementDate("2026-07-01", "2026-01-01", "Asia/Shanghai", "2026-07-11"));
  assert.throws(() => validateMeasurementDate("2025-12-31", "2026-01-01", "Asia/Shanghai", "2026-07-11"), /不能早于出生日期/);
  assert.throws(() => validateMeasurementDate("2026-07-12", "2026-01-01", "Asia/Shanghai", "2026-07-11"), /不能晚于今天/);
  assert.throws(() => validateMeasurementDate("2026-02-30", "2026-01-01", "Asia/Shanghai", "2026-07-11"), /日期无效/);
});
