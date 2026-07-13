import { parseDate } from "@/lib/dates";

export type MedicationPlanSchedule = {
  id: string;
  startDate: string;
  endDate: string | null;
  intervalDays: number;
  scheduledTimes: string[];
};

export function isMedicationPlanDue(plan: MedicationPlanSchedule, date: string) {
  const target = parseDate(date);
  const start = parseDate(plan.startDate);
  if (target < start || (plan.endDate && date > plan.endDate)) return false;
  const elapsedDays = Math.round((target.getTime() - start.getTime()) / 86_400_000);
  return elapsedDays % plan.intervalDays === 0;
}

export function medicationFrequencyText(intervalDays: number, scheduledTimes: string[]) {
  const dayText = intervalDays === 1 ? "每天" : `每 ${intervalDays} 天`;
  return `${dayText} ${scheduledTimes.join("、")}`;
}
