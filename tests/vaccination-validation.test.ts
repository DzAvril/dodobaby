import assert from "node:assert/strict";
import test from "node:test";
import { groupVaccinationRecords, sortVaccinationRecords, validateVaccinationDates } from "../lib/vaccination-validation";
import { vaccinationRecordSchema } from "../lib/validation";

const plannedRecord = {
  vaccineName: "乙肝疫苗",
  doseNumber: 2,
  category: "immunization_program" as const,
  status: "planned" as const,
  plannedDate: "2026-08-01",
  plannedTime: "09:30",
};

const completedRecord = {
  vaccineName: "卡介苗",
  doseNumber: 1,
  category: "immunization_program" as const,
  status: "completed" as const,
  administeredDate: "2026-01-05",
};

test("计划记录和已接种记录遵守各自的必填日期", () => {
  assert.equal(vaccinationRecordSchema.safeParse(plannedRecord).success, true);
  assert.equal(vaccinationRecordSchema.safeParse(completedRecord).success, true);
  assert.equal(vaccinationRecordSchema.safeParse({ ...plannedRecord, plannedDate: null }).success, false);
  assert.equal(vaccinationRecordSchema.safeParse({ ...plannedRecord, administeredDate: "2026-07-11" }).success, false);
  assert.equal(vaccinationRecordSchema.safeParse({ ...completedRecord, administeredDate: null }).success, false);
  assert.equal(vaccinationRecordSchema.safeParse({ ...completedRecord, plannedTime: "09:30" }).success, false);
});

test("剂次、分类和文本长度都有服务端边界", () => {
  assert.equal(vaccinationRecordSchema.safeParse({ ...plannedRecord, doseNumber: 1 }).success, true);
  assert.equal(vaccinationRecordSchema.safeParse({ ...plannedRecord, doseNumber: 99 }).success, true);
  assert.equal(vaccinationRecordSchema.safeParse({ ...plannedRecord, doseNumber: 0 }).success, false);
  assert.equal(vaccinationRecordSchema.safeParse({ ...plannedRecord, doseNumber: 100 }).success, false);
  assert.equal(vaccinationRecordSchema.safeParse({ ...plannedRecord, doseNumber: 1.5 }).success, false);
  assert.equal(vaccinationRecordSchema.safeParse({ ...plannedRecord, category: "other" }).success, false);
  assert.equal(vaccinationRecordSchema.safeParse({ ...plannedRecord, vaccineName: "疫".repeat(81) }).success, false);
  assert.equal(vaccinationRecordSchema.safeParse({ ...completedRecord, manufacturer: "厂".repeat(81) }).success, false);
  assert.equal(vaccinationRecordSchema.safeParse({ ...completedRecord, batchNumber: "批".repeat(41) }).success, false);
  assert.equal(vaccinationRecordSchema.safeParse({ ...completedRecord, vaccinationUnit: "院".repeat(121) }).success, false);
  assert.equal(vaccinationRecordSchema.safeParse({ ...completedRecord, note: "字".repeat(501) }).success, false);
});

test("可选字段清理空白并将空字符串归一为空值", () => {
  const parsed = vaccinationRecordSchema.safeParse({
    ...completedRecord,
    category: undefined,
    vaccineName: "  卡介苗  ",
    plannedDate: "",
    plannedTime: "",
    manufacturer: "  示例企业  ",
    batchNumber: "",
  });
  assert.equal(parsed.success, true);
  if (!parsed.success) return;
  assert.equal(parsed.data.category, "unknown");
  assert.equal(parsed.data.vaccineName, "卡介苗");
  assert.equal(parsed.data.plannedDate, null);
  assert.equal(parsed.data.plannedTime, null);
  assert.equal(parsed.data.manufacturer, "示例企业");
  assert.equal(parsed.data.batchNumber, null);
});

test("计划记录不会保留隐藏的实际接种事实", () => {
  const parsed = vaccinationRecordSchema.safeParse({
    ...plannedRecord,
    administeredDate: null,
    manufacturer: "不应保留的企业",
    batchNumber: "HIDDEN-BATCH",
    administrationSite: "左上臂",
    vaccinationUnit: "计划接种门诊",
    note: "继续保留的计划备注",
  });
  assert.equal(parsed.success, true);
  if (!parsed.success) return;
  assert.equal(parsed.data.manufacturer, null);
  assert.equal(parsed.data.batchNumber, null);
  assert.equal(parsed.data.administrationSite, null);
  assert.equal(parsed.data.vaccinationUnit, "计划接种门诊");
  assert.equal(parsed.data.note, "继续保留的计划备注");
});

test("计划日期可在未来，实际接种日期不能早于出生或晚于宝宝时区今天", () => {
  assert.doesNotThrow(() => validateVaccinationDates({ plannedDate: "2027-01-01", administeredDate: null }, "2026-01-04", "Asia/Shanghai", "2026-07-11"));
  assert.doesNotThrow(() => validateVaccinationDates({ plannedDate: null, administeredDate: "2026-07-11" }, "2026-01-04", "Asia/Shanghai", "2026-07-11"));
  assert.throws(() => validateVaccinationDates({ plannedDate: "2026-01-03", administeredDate: null }, "2026-01-04", "Asia/Shanghai", "2026-07-11"), /计划接种日期不能早于出生日期/);
  assert.throws(() => validateVaccinationDates({ plannedDate: null, administeredDate: "2026-01-03" }, "2026-01-04", "Asia/Shanghai", "2026-07-11"), /实际接种日期不能早于出生日期/);
  assert.throws(() => validateVaccinationDates({ plannedDate: null, administeredDate: "2026-07-12" }, "2026-01-04", "Asia/Shanghai", "2026-07-11"), /实际接种日期不能晚于今天/);
  assert.throws(() => validateVaccinationDates({ plannedDate: "2026-02-30", administeredDate: null }, "2026-01-04", "Asia/Shanghai", "2026-07-11"), /日期无效/);
});

test("疫苗记录排序为计划在前且按时间升序，历史按实际日期倒序", () => {
  const records = [
    { id: "done-old", status: "completed" as const, plannedDate: null, plannedTime: null, administeredDate: "2026-02-01" },
    { id: "plan-late", status: "planned" as const, plannedDate: "2026-08-01", plannedTime: "10:00", administeredDate: null },
    { id: "done-new", status: "completed" as const, plannedDate: null, plannedTime: null, administeredDate: "2026-07-01" },
    { id: "plan-early", status: "planned" as const, plannedDate: "2026-07-20", plannedTime: "09:00", administeredDate: null },
  ];
  assert.deepEqual(sortVaccinationRecords(records).map((record) => record.id), ["plan-early", "plan-late", "done-new", "done-old"]);
});

test("疫苗记录按待确认、待接种和历史分组且组内顺序稳定", () => {
  const records = [
    { id: "future", status: "planned" as const, plannedDate: "2026-07-20", plannedTime: "09:00", administeredDate: null },
    { id: "overdue-new", status: "planned" as const, plannedDate: "2026-07-10", plannedTime: "10:00", administeredDate: null },
    { id: "done-old", status: "completed" as const, plannedDate: null, plannedTime: null, administeredDate: "2026-02-01" },
    { id: "today", status: "planned" as const, plannedDate: "2026-07-11", plannedTime: "08:00", administeredDate: null },
    { id: "overdue-old", status: "planned" as const, plannedDate: "2026-06-10", plannedTime: null, administeredDate: null },
    { id: "done-new", status: "completed" as const, plannedDate: null, plannedTime: null, administeredDate: "2026-07-01" },
  ];
  const groups = groupVaccinationRecords(records, "2026-07-11");
  assert.deepEqual(groups.overdue.map((record) => record.id), ["overdue-old", "overdue-new"]);
  assert.deepEqual(groups.upcoming.map((record) => record.id), ["today", "future"]);
  assert.deepEqual(groups.completed.map((record) => record.id), ["done-new", "done-old"]);
});
