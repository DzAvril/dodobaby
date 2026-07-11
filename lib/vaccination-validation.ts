import { parseDate, todayInTimezone } from "@/lib/dates";
import type { VaccinationRecordInput } from "@/lib/validation";

type TimelineRecord = {
  status: "planned" | "completed";
  plannedDate: string | null;
  plannedTime: string | null;
  administeredDate: string | null;
};

export function validateVaccinationDates(
  input: Pick<VaccinationRecordInput, "plannedDate" | "administeredDate">,
  birthDate: string,
  timezone: string,
  today = todayInTimezone(timezone),
) {
  if (input.plannedDate) {
    parseDate(input.plannedDate);
    if (input.plannedDate < birthDate) throw new Error("计划接种日期不能早于出生日期");
  }

  if (input.administeredDate) {
    parseDate(input.administeredDate);
    if (input.administeredDate < birthDate) throw new Error("实际接种日期不能早于出生日期");
    if (input.administeredDate > today) throw new Error("实际接种日期不能晚于今天");
  }
}

function comparePlanned(left: TimelineRecord, right: TimelineRecord) {
  return (left.plannedDate ?? "").localeCompare(right.plannedDate ?? "")
    || (left.plannedTime ?? "").localeCompare(right.plannedTime ?? "");
}

function compareCompleted(left: TimelineRecord, right: TimelineRecord) {
  return (right.administeredDate ?? "").localeCompare(left.administeredDate ?? "");
}

export function sortVaccinationRecords<T extends TimelineRecord>(records: readonly T[]): T[] {
  return [...records].sort((left, right) => {
    if (left.status !== right.status) return left.status === "planned" ? -1 : 1;
    return left.status === "planned" ? comparePlanned(left, right) : compareCompleted(left, right);
  });
}

export function groupVaccinationRecords<T extends TimelineRecord>(records: readonly T[], today: string) {
  parseDate(today);
  const overdue: T[] = [];
  const upcoming: T[] = [];
  const completed: T[] = [];

  for (const record of records) {
    if (record.status === "completed") completed.push(record);
    else if (record.plannedDate && record.plannedDate < today) overdue.push(record);
    else upcoming.push(record);
  }

  overdue.sort(comparePlanned);
  upcoming.sort(comparePlanned);
  completed.sort(compareCompleted);
  return { overdue, upcoming, completed };
}
