import test from "node:test";
import assert from "node:assert/strict";
import { renderMonthlyHtml } from "../lib/monthly-export";

const baby = {
  id: "baby-1",
  name: "朵朵",
  birthDate: "2025-12-18",
  timezone: "Asia/Shanghai",
  isActive: true,
  createdAt: new Date("2026-01-01T00:00:00Z"),
  updatedAt: new Date("2026-01-01T00:00:00Z"),
};

test("月度导出包含中文菜单和实际状态", () => {
  const meal = {
    id: "meal-1",
    babyId: baby.id,
    mealDate: "2026-07-10",
    mealType: "lunch",
    customMealType: null,
    plannedTime: "11:40",
    planNote: null,
    actualStatus: "completed",
    actualTime: "11:45",
    actualNote: "全部吃完",
    createdAt: new Date(),
    updatedAt: new Date(),
    items: [{ id: "item-1", mealId: "meal-1", name: "胡萝卜泥", amount: 3, unit: "勺", preparation: null, isFirstTry: true, sortOrder: 0 }],
    reactionTags: ["liked"],
  };
  const rendered = renderMonthlyHtml(baby, [meal], "2026-07", "full");
  assert.equal(rendered.pageCount, 1);
  assert.match(rendered.html, /朵朵的辅食菜单/);
  assert.match(rendered.html, /胡萝卜泥/);
  assert.match(rendered.html, /吃完/);
});
