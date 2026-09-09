import { Temporal } from "@js-temporal/polyfill";

export class DateToolError extends Error {
  constructor(
    public readonly code:
      | "invalid_date"
      | "out_of_range"
      | "invalid_rules"
      | "too_large",
  ) {
    super(code);
  }
}
const EPOCH = Temporal.PlainDate.from("1970-01-01");
function date(input: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(input) || input.startsWith("0000-"))
    throw new DateToolError("invalid_date");
  try {
    return Temporal.PlainDate.from(input, { overflow: "reject" });
  } catch {
    throw new DateToolError("invalid_date");
  }
}
function ordinal(input: string) {
  return EPOCH.until(date(input), { largestUnit: "days" }).days;
}
const MIN = -719162,
  MAX = 2932896;
function iso(day: number) {
  return EPOCH.add({ days: day }).toString();
}
const weekday = (day: number) => (((day + 4) % 7) + 7) % 7;
export type BusinessRules = { weekendDays: number[]; holidays: string };
function rules(value: BusinessRules) {
  if (
    value.weekendDays.length > 7 ||
    value.weekendDays.some((n) => !Number.isInteger(n) || n < 0 || n > 6)
  )
    throw new DateToolError("invalid_rules");
  if (value.holidays.length > 1_000_000) throw new DateToolError("too_large");
  const weekends = new Set(value.weekendDays),
    holidays = new Set<number>(),
    invalidHolidays: { line: number; value: string }[] = [];
  const lines = value.holidays.split(/\r\n|\r|\n/, 10002);
  if (lines.length > 10000) throw new DateToolError("too_large");
  for (const [i, line] of lines.entries()) {
    if (!line.trim()) continue;
    try {
      holidays.add(ordinal(line.trim()));
    } catch {
      invalidHolidays.push({ line: i + 1, value: line.slice(0, 100) });
    }
  }
  return {
    weekends,
    holidays: [...holidays].sort((a, b) => a - b),
    invalidHolidays,
  };
}
function count(a: number, b: number, r: ReturnType<typeof rules>) {
  if (b < a)
    return { businessDays: 0, totalDays: 0, weekendDays: 0, holidayDays: 0 };
  const totalDays = b - a + 1,
    weeks = Math.floor(totalDays / 7);
  let weekendDays = weeks * r.weekends.size;
  for (let i = weeks * 7; i < totalDays; i++)
    if (r.weekends.has(weekday(a + i))) weekendDays++;
  let holidayDays = 0;
  for (const day of r.holidays)
    if (day >= a && day <= b && !r.weekends.has(weekday(day))) holidayDays++;
  return {
    businessDays: totalDays - weekendDays - holidayDays,
    totalDays,
    weekendDays,
    holidayDays,
  };
}
export function businessDays(
  start: string,
  end: string,
  base: string,
  offset: number,
  rulesInput: BusinessRules,
  includeEndpoints = true,
  includeStart = false,
) {
  if (!Number.isInteger(offset) || offset < 0 || offset > 3652059)
    throw new DateToolError("out_of_range");
  const a = ordinal(start),
    b = ordinal(end),
    origin = ordinal(base),
    r = rules(rulesInput);
  const range = count(
    Math.min(a, b) + (includeEndpoints ? 0 : 1),
    Math.max(a, b) - (includeEndpoints ? 0 : 1),
    r,
  );
  function shift(direction: 1 | -1) {
    if (offset === 0) return base;
    if (r.weekends.size === 7) return null;
    const first = origin + (includeStart ? 0 : direction);
    if (first < MIN || first > MAX) return null;
    const boundary = direction === 1 ? MAX : MIN,
      available =
        direction === 1 ? count(first, boundary, r) : count(boundary, first, r);
    if (available.businessDays < offset) return null;
    let low = 0,
      high = Math.abs(boundary - first);
    while (low < high) {
      const mid = Math.floor((low + high) / 2),
        end = first + direction * mid,
        total = direction === 1 ? count(first, end, r) : count(end, first, r);
      if (total.businessDays >= offset) high = mid;
      else low = mid + 1;
    }
    return iso(first + direction * low);
  }
  return {
    ...range,
    isReversed: a > b,
    add: shift(1),
    subtract: shift(-1),
    invalidHolidays: r.invalidHolidays,
    noWorkingDays: r.weekends.size === 7,
  };
}
