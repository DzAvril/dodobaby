import assert from "node:assert/strict";
import test from "node:test";
import { trackerViewState } from "../lib/tracker-view-state";

test("首次加载、无缓存失败和成功空记录彼此互斥", () => {
  assert.equal(trackerViewState({ loading: true, error: false, hasCurrentData: false, itemCount: 0 }), "loading");
  assert.equal(trackerViewState({ loading: false, error: true, hasCurrentData: false, itemCount: 0 }), "error");
  assert.equal(trackerViewState({ loading: false, error: false, hasCurrentData: true, itemCount: 0 }), "empty");
});

test("刷新或刷新失败时保留已成功加载的数据", () => {
  assert.equal(trackerViewState({ loading: true, error: false, hasCurrentData: true, itemCount: 2 }), "content");
  assert.equal(trackerViewState({ loading: false, error: true, hasCurrentData: true, itemCount: 2 }), "content");
  assert.equal(trackerViewState({ loading: false, error: true, hasCurrentData: true, itemCount: 0 }), "empty");
});
