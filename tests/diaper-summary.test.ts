import assert from "node:assert/strict";
import test from "node:test";
import { summarizeDiapers } from "../lib/diaper-summary";

test("尿布摘要将两者记录同时计入小便和大便但总数只计一次", () => {
  assert.deepEqual(summarizeDiapers([
    { diaperType: "wet", skinObservation: null },
    { diaperType: "dirty", skinObservation: "clear" },
    { diaperType: "both", skinObservation: "red" },
  ]), {
    totalCount: 3,
    wetCount: 2,
    dirtyCount: 2,
    skinObservedCount: 2,
    skinConcernCount: 1,
  });
});

test("没有尿布记录时摘要全部为零", () => {
  assert.deepEqual(summarizeDiapers([]), { totalCount: 0, wetCount: 0, dirtyCount: 0, skinObservedCount: 0, skinConcernCount: 0 });
});
