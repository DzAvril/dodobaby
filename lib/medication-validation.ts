import { parseDate, todayInTimezone } from "@/lib/dates";
import { isMedicationPlanDue, type MedicationPlanSchedule } from "@/lib/medication-schedule";

export function validateMedicationPlanDates(startDate: string, endDate: string | null, birthDate: string) {
  parseDate(startDate);
  if (startDate < birthDate) throw new Error("开始日期不能早于出生日期");
  if (endDate) {
    parseDate(endDate);
    if (endDate < startDate) throw new Error("结束日期不能早于开始日期");
  }
}

export function validateMedicationRecordDate(date: string, birthDate: string, timezone: string, today = todayInTimezone(timezone)) {
  parseDate(date);
  if (date < birthDate) throw new Error("用药日期不能早于出生日期");
  if (date > today) throw new Error("用药日期不能晚于今天");
}

export function validateMedicationOccurrence(plan: MedicationPlanSchedule, date: string, scheduledTime: string) {
  if (!isMedicationPlanDue(plan, date)) throw new Error("该日期不在此用药计划中");
  if (!plan.scheduledTimes.includes(scheduledTime)) throw new Error("该时间不在此用药计划中");
}
