import { z } from "zod";

const timeSchema = z.union([z.literal(""), z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/)]).optional();

export const babySchema = z.object({
  name: z.string().trim().min(1, "请输入宝宝姓名").max(40),
  birthDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "出生日期无效"),
  timezone: z.string().trim().min(1).max(80).default("Asia/Shanghai"),
});

export const passwordChangeSchema = z.object({
  currentPassword: z.string().min(1, "请输入当前密码").max(128),
  newPassword: z.string().min(8, "新密码至少需要 8 个字符").max(128),
});

export const foodCatalogItemSchema = z.object({
  name: z.string().trim().min(1, "请输入辅食名称").max(80),
  defaultUnit: z.string().trim().max(20).nullable().optional(),
});

export const growthRecordSchema = z
  .object({
    measuredDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "测量日期无效"),
    weightKg: z.number().min(0.5, "体重不能小于 0.5kg").max(50, "体重不能大于 50kg").nullable().optional(),
    heightCm: z.number().min(20, "身高不能小于 20cm").max(150, "身高不能大于 150cm").nullable().optional(),
    headCircumferenceCm: z.number().min(15, "头围不能小于 15cm").max(80, "头围不能大于 80cm").nullable().optional(),
    note: z.string().trim().max(300, "备注不能超过 300 个字符").nullable().optional(),
  })
  .superRefine((value, ctx) => {
    if (value.weightKg == null && value.heightCm == null && value.headCircumferenceCm == null) {
      ctx.addIssue({ code: "custom", message: "请至少填写体重、身高或头围中的一项", path: ["weightKg"] });
    }
  });

export const feedingRecordSchema = z
  .object({
    feedingDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "喂养日期无效"),
    startedTime: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, "开始时间无效"),
    leftDurationMinutes: z.number().int("左侧时长必须是整数").min(1, "左侧时长至少为 1 分钟").max(180, "左侧时长不能超过 180 分钟").nullable().optional(),
    rightDurationMinutes: z.number().int("右侧时长必须是整数").min(1, "右侧时长至少为 1 分钟").max(180, "右侧时长不能超过 180 分钟").nullable().optional(),
    expressedMilkMl: z.number().positive("瓶喂母乳必须大于 0ml").max(1000, "瓶喂母乳不能超过 1000ml").nullable().optional(),
    formulaMl: z.number().positive("配方奶必须大于 0ml").max(1000, "配方奶不能超过 1000ml").nullable().optional(),
    note: z.string().trim().max(300, "备注不能超过 300 个字符").nullable().optional(),
  })
  .superRefine((value, ctx) => {
    const directMinutes = (value.leftDurationMinutes ?? 0) + (value.rightDurationMinutes ?? 0);
    if (directMinutes > 240) {
      ctx.addIssue({ code: "custom", message: "左右两侧总时长不能超过 240 分钟", path: ["rightDurationMinutes"] });
    }
    if (directMinutes === 0 && (value.expressedMilkMl ?? 0) === 0 && (value.formulaMl ?? 0) === 0) {
      ctx.addIssue({ code: "custom", message: "请至少记录一项喂养量", path: ["leftDurationMinutes"] });
    }
  });

export const mealItemSchema = z.object({
  name: z.string().trim().min(1, "请输入食材名称").max(80),
  amount: z.number().nonnegative().max(100000).nullable().optional(),
  unit: z.string().trim().max(20).nullable().optional(),
  preparation: z.string().trim().max(120).nullable().optional(),
  isFirstTry: z.boolean().default(false),
});

export const mealSchema = z
  .object({
    mealDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "日期无效"),
    mealType: z.enum(["breakfast", "morning_snack", "lunch", "afternoon_snack", "dinner", "custom"]),
    customMealType: z.string().trim().max(30).nullable().optional(),
    plannedTime: timeSchema,
    planNote: z.string().trim().max(500).nullable().optional(),
    actualStatus: z.enum(["planned", "completed", "partial", "skipped"]).default("planned"),
    actualTime: timeSchema,
    actualNote: z.string().trim().max(500).nullable().optional(),
    items: z.array(mealItemSchema).min(1, "至少添加一种食材").max(30),
    reactionTags: z
      .array(z.enum(["normal", "liked", "disliked", "rash", "vomit", "diarrhea", "constipation", "other"]))
      .max(8)
      .default([]),
  })
  .superRefine((value, ctx) => {
    if (value.mealType === "custom" && !value.customMealType) {
      ctx.addIssue({ code: "custom", message: "请输入自定义餐次", path: ["customMealType"] });
    }
  });

export type MealInput = z.infer<typeof mealSchema>;
export type GrowthRecordInput = z.infer<typeof growthRecordSchema>;
export type FeedingRecordInput = z.infer<typeof feedingRecordSchema>;
