import assert from "node:assert/strict";
import test from "node:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { GrowthTracker } from "../components/GrowthTracker";

test("生长模块首次渲染只显示加载状态，不伪装成空记录", () => {
  const html = renderToStaticMarkup(createElement(GrowthTracker, {
    baby: { id: "baby-1", name: "DoDo", birthDate: "2026-01-01", timezone: "Asia/Shanghai" },
  }));

  assert.match(html, /DoDo的生长记录/);
  assert.match(html, /正在整理生长记录/);
  assert.match(html, /体重/);
  assert.match(html, /身高/);
  assert.match(html, /头围/);
  assert.match(html, /添加测量/);
  assert.doesNotMatch(html, /growth-summary-grid/);
  assert.doesNotMatch(html, /记录第一次测量/);
  assert.match(html, /aria-labelledby="growth-dialog-title"/);
});
