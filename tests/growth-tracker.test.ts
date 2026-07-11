import assert from "node:assert/strict";
import test from "node:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { GrowthTracker } from "../components/GrowthTracker";

test("生长模块空态仍提供独立指标和添加入口", () => {
  const html = renderToStaticMarkup(createElement(GrowthTracker, {
    baby: { id: "baby-1", name: "DoDo", birthDate: "2026-01-01", timezone: "Asia/Shanghai" },
  }));

  assert.match(html, /DoDo的生长记录/);
  assert.match(html, /体重/);
  assert.match(html, /身高/);
  assert.match(html, /头围/);
  assert.match(html, /添加测量/);
  assert.match(html, /aria-labelledby="growth-dialog-title"/);
});
