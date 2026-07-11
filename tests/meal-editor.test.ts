import assert from "node:assert/strict";
import test from "node:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { MealEditor } from "../components/DiaryApp";

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
