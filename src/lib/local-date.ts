export type LocalDate = string & { readonly __localDate: unique symbol };

type DateParts = { year: number; month: number; day: number };

function isLeapYear(year: number): boolean {
  return year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0);
}

function daysInMonth(year: number, month: number): number {
  if (month === 2) return isLeapYear(year) ? 29 : 28;
  return [4, 6, 9, 11].includes(month) ? 30 : 31;
}

function parts(value: string): DateParts {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!match) throw new Error("日期格式必须为 YYYY-MM-DD");
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  if (year < 1 || month < 1 || month > 12 || day < 1 || day > daysInMonth(year, month)) {
    throw new Error("日期不是有效的日历日期");
  }
  return { year, month, day };
}

function format({ year, month, day }: DateParts): LocalDate {
  return `${String(year).padStart(4, "0")}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}` as LocalDate;
}

export function parseLocalDate(value: string): LocalDate {
  parts(value);
  return value as LocalDate;
}

export function shanghaiToday(now = new Date()): LocalDate {
  const values = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Shanghai",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  })
    .formatToParts(now)
    .reduce<Record<string, string>>((result, item) => {
      if (item.type !== "literal") result[item.type] = item.value;
      return result;
    }, {});
  return parseLocalDate(`${values.year}-${values.month}-${values.day}`);
}

function utcDay(value: string): number {
  const { year, month, day } = parts(value);
  const adjustedYear = year - (month <= 2 ? 1 : 0);
  const era = Math.floor(adjustedYear / 400);
  const yearOfEra = adjustedYear - era * 400;
  const shiftedMonth = month + (month > 2 ? -3 : 9);
  const dayOfYear = Math.floor((153 * shiftedMonth + 2) / 5) + day - 1;
  const dayOfEra =
    yearOfEra * 365 +
    Math.floor(yearOfEra / 4) -
    Math.floor(yearOfEra / 100) +
    dayOfYear;
  return era * 146_097 + dayOfEra;
}

export function daysTogether(start: string, today: string): number {
  return utcDay(parseLocalDate(today)) - utcDay(parseLocalDate(start)) + 1;
}

function occurrenceFor(year: number, month: number, day: number): LocalDate {
  const adjustedDay = month === 2 && day === 29 && !isLeapYear(year) ? 28 : day;
  return format({ year, month, day: adjustedDay });
}

export function nextOccurrence(date: string, today: string): LocalDate {
  const original = parts(parseLocalDate(date));
  const current = parts(parseLocalDate(today));
  const inCurrentYear = occurrenceFor(current.year, original.month, original.day);
  return inCurrentYear >= today
    ? inCurrentYear
    : occurrenceFor(current.year + 1, original.month, original.day);
}
