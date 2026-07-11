import test from "node:test";
import assert from "node:assert/strict";
import { foodCatalogItemSchema, growthRecordSchema, mealSchema, passwordChangeSchema } from "../lib/validation";

const validMeal = {
  mealDate: "2026-07-10",
  mealType: "lunch",
  plannedTime: "11:40",
  actualStatus: "planned",
  items: [{ name: "高铁米粉", amount: 10, unit: "g", isFirstTry: false }],
  reactionTags: [],
};

test("接受结构化的辅食餐次", () => {
  assert.equal(mealSchema.safeParse(validMeal).success, true);
});

test("至少需要一种有名称的食材", () => {
  assert.equal(mealSchema.safeParse({ ...validMeal, items: [] }).success, false);
  assert.equal(mealSchema.safeParse({ ...validMeal, items: [{ ...validMeal.items[0], name: "" }] }).success, false);
});

test("自定义餐次必须填写名称", () => {
  assert.equal(mealSchema.safeParse({ ...validMeal, mealType: "custom", customMealType: "" }).success, false);
});

test("拒绝无效时间和未知反应标签", () => {
  assert.equal(mealSchema.safeParse({ ...validMeal, plannedTime: "25:00" }).success, false);
  assert.equal(mealSchema.safeParse({ ...validMeal, reactionTags: ["unknown"] }).success, false);
});

test("辅食库校验名称和默认单位", () => {
  assert.equal(foodCatalogItemSchema.safeParse({ name: " 胡萝卜泥 ", defaultUnit: "g" }).success, true);
  assert.equal(foodCatalogItemSchema.safeParse({ name: "", defaultUnit: "g" }).success, false);
  assert.equal(foodCatalogItemSchema.safeParse({ name: "米粉", defaultUnit: "x".repeat(21) }).success, false);
});

test("新家庭密码至少需要 8 个字符", () => {
  assert.equal(passwordChangeSchema.safeParse({ currentPassword: "old-password", newPassword: "new-password" }).success, true);
  assert.equal(passwordChangeSchema.safeParse({ currentPassword: "old-password", newPassword: "short" }).success, false);
});

test("生长记录至少包含一项合理范围内的指标", () => {
  assert.equal(growthRecordSchema.safeParse({ measuredDate: "2026-07-11", weightKg: 7.35 }).success, true);
  assert.equal(growthRecordSchema.safeParse({ measuredDate: "2026-07-11", heightCm: 68.5, headCircumferenceCm: 43.2 }).success, true);
  assert.equal(growthRecordSchema.safeParse({ measuredDate: "2026-07-11" }).success, false);
  assert.equal(growthRecordSchema.safeParse({ measuredDate: "2026-07-11", weightKg: -1 }).success, false);
  assert.equal(growthRecordSchema.safeParse({ measuredDate: "2026-07-11", heightCm: Number.NaN }).success, false);
});
