import assert from "node:assert/strict";
import test from "node:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { DiaryApp, MealEditor } from "../components/DiaryApp";

test("添加餐食时将辅食库显示为可选择的原生下拉框", () => {
  const html = renderToStaticMarkup(createElement(MealEditor, {
    date: "2026-07-11",
    meal: null,
    foods: [{ id: "food-1", name: "胡萝卜泥", defaultUnit: "g" }],
    onSaved: () => undefined,
    onCancel: () => undefined,
  }));

  assert.match(html, /<select[^>]*id="food-catalog-0"/);
  assert.match(html, /<option value="胡萝卜泥">胡萝卜泥（g）<\/option>/);
  assert.match(html, /aria-label="手动输入食材 1"/);
  assert.doesNotMatch(html, /food-catalog-options/);
});

test("辅食日历默认显示月视图并提供周和天粒度", () => {
  const html = renderToStaticMarkup(createElement(DiaryApp, {
    baby: { id: "baby-1", name: "DoDo", birthDate: "2026-01-01", timezone: "Asia/Shanghai" },
  }));

  assert.match(html, /DoDo的辅食日历/);
  assert.match(html, /aria-label="辅食日历查看粒度"/);
  assert.match(html, /aria-pressed="true">月<\/button>/);
  assert.match(html, /aria-pressed="false">周<\/button>/);
  assert.match(html, /aria-pressed="false">天<\/button>/);
  assert.match(html, /aria-label="月视图"/);
});
