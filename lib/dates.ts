const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const MONTH_RE = /^\d{4}-\d{2}$/;

export function parseDate(value: string): Date {
  if (!DATE_RE.test(value)) throw new Error("日期格式必须为 YYYY-MM-DD");
  const [year, month, day] = value.split("-").map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));
  if (date.getUTCFullYear() !== year || date.getUTCMonth() !== month - 1 || date.getUTCDate() !== day) {
    throw new Error("日期无效");
  }
  return date;
}

export function formatDate(date: Date): string {
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, "0")}-${String(date.getUTCDate()).padStart(2, "0")}`;
}

export function todayInTimezone(timezone = "Asia/Shanghai"): string {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: timezone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts();
  const values = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return `${values.year}-${values.month}-${values.day}`;
}

export function addDays(value: string, amount: number): string {
  const date = parseDate(value);
  date.setUTCDate(date.getUTCDate() + amount);
  return formatDate(date);
}

export function monthBounds(month: string) {
  if (!MONTH_RE.test(month)) throw new Error("月份格式必须为 YYYY-MM");
  const [year, monthNumber] = month.split("-").map(Number);
  if (monthNumber < 1 || monthNumber > 12) throw new Error("月份无效");
  return {
    start: formatDate(new Date(Date.UTC(year, monthNumber - 1, 1))),
    end: formatDate(new Date(Date.UTC(year, monthNumber, 0))),
  };
}

export function getMonthGrid(month: string): string[] {
  const { start } = monthBounds(month);
  const first = parseDate(start);
  const mondayOffset = (first.getUTCDay() + 6) % 7;
  const gridStart = addDays(start, -mondayOffset);
  return Array.from({ length: 42 }, (_, index) => addDays(gridStart, index));
}

function addMonthsClamped(date: Date, months: number): Date {
  const targetMonth = date.getUTCMonth() + months;
  const targetYear = date.getUTCFullYear() + Math.floor(targetMonth / 12);
  const normalizedMonth = ((targetMonth % 12) + 12) % 12;
  const maxDay = new Date(Date.UTC(targetYear, normalizedMonth + 1, 0)).getUTCDate();
  return new Date(Date.UTC(targetYear, normalizedMonth, Math.min(date.getUTCDate(), maxDay)));
}

export function calculateAge(birthDate: string, onDate: string): { months: number; days: number } | null {
  const birth = parseDate(birthDate);
  const target = parseDate(onDate);
  if (target < birth) return null;

  let months = (target.getUTCFullYear() - birth.getUTCFullYear()) * 12 + target.getUTCMonth() - birth.getUTCMonth();
  let anchor = addMonthsClamped(birth, months);
  if (anchor > target) {
    months -= 1;
    anchor = addMonthsClamped(birth, months);
  }
  return { months, days: Math.round((target.getTime() - anchor.getTime()) / 86_400_000) };
}

export function formatAge(birthDate: string, onDate: string): string {
  const age = calculateAge(birthDate, onDate);
  return age ? `${age.months}月${age.days}天` : "";
}
