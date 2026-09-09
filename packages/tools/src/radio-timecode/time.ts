type TimeParts = Readonly<{
  year: number;
  month: number;
  day: number;
  hour: number;
  minute: number;
  second: number;
  weekday: number;
  dayOfYear: number;
  offsetMinutes: number;
  isDst: boolean;
}>;

const MONTH_DAYS_COMMON = [31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];

function isLeapYear(year: number) {
  return (year % 4 === 0 && year % 100 !== 0) || year % 400 === 0;
}

function getDayOfYear(year: number, month: number, day: number) {
  if (
    !Number.isSafeInteger(year) ||
    !Number.isInteger(month) ||
    month < 1 ||
    month > 12 ||
    !Number.isInteger(day) ||
    day < 1
  )
    throw new RangeError("Invalid calendar date");
  const days = [...MONTH_DAYS_COMMON];

  if (isLeapYear(year)) {
    days[1] = 29;
  }
  if (day > days[month - 1]) throw new RangeError("Invalid calendar date");

  let total = 0;

  for (let i = 0; i < month - 1; i += 1) {
    total += days[i];
  }

  return total + day;
}

// Date.UTC remaps years 0..99 to 1900..1999; explicit full-year assignment does not.
function utcDate(year: number, month: number, day: number) {
  const date = new Date(0);
  date.setUTCFullYear(year, month, day);
  return date;
}

function getTimeZoneOffsetMinutes(date: Date, timeZone: string) {
  const formatter = new Intl.DateTimeFormat("en-US", {
    timeZone,
    year: "numeric",
    era: "short",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hourCycle: "h23",
  });
  const parts = formatter.formatToParts(date);
  // These fields are explicitly requested; invalid dates throw in formatToParts.
  const get = (type: string) =>
    // biome-ignore lint/style/noNonNullAssertion: validated fixed-width index or lookup invariant
    Number(parts.find((part) => part.type === type)!.value);
  const year =
    parts.find((part) => part.type === "era")?.value === "BC"
      ? 1 - get("year")
      : get("year");
  const month = get("month");
  const day = get("day");
  const hour = get("hour");
  const minute = get("minute");
  const second = get("second");
  const asUtc = utcDate(year, month - 1, day);
  asUtc.setUTCHours(hour, minute, second);

  return Math.round((asUtc.getTime() - date.getTime()) / 60_000);
}

function getStandardOffsetMinutes(date: Date, timeZone: string) {
  const year = date.getUTCFullYear();
  const jan = utcDate(year, 0, 1);
  const jul = utcDate(year, 6, 1);
  const janOffset = getTimeZoneOffsetMinutes(jan, timeZone);
  const julOffset = getTimeZoneOffsetMinutes(jul, timeZone);

  return Math.min(janOffset, julOffset);
}

function isDstAt(date: Date, timeZone: string) {
  const offset = getTimeZoneOffsetMinutes(date, timeZone);
  const standard = getStandardOffsetMinutes(date, timeZone);

  return offset !== standard;
}

function willOffsetChangeWithinHour(date: Date, timeZone: string) {
  const nowOffset = getTimeZoneOffsetMinutes(date, timeZone);
  const nextOffset = getTimeZoneOffsetMinutes(
    new Date(date.getTime() + 3_600_000),
    timeZone,
  );

  return nowOffset !== nextOffset;
}

function getTimeParts(date: Date, timeZone: string): TimeParts {
  const formatter = new Intl.DateTimeFormat("en-US", {
    timeZone,
    year: "numeric",
    era: "short",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hourCycle: "h23",
  });
  const parts = formatter.formatToParts(date);
  // These fields are explicitly requested; invalid dates throw in formatToParts.
  const get = (type: string) =>
    // biome-ignore lint/style/noNonNullAssertion: validated fixed-width index or lookup invariant
    Number(parts.find((part) => part.type === type)!.value);
  const year =
    parts.find((part) => part.type === "era")?.value === "BC"
      ? 1 - get("year")
      : get("year");
  const month = get("month");
  const day = get("day");
  const hour = get("hour");
  const minute = get("minute");
  const second = get("second");
  const weekday = utcDate(year, month - 1, day).getUTCDay();
  const dayOfYear = getDayOfYear(year, month, day);
  const offsetMinutes = getTimeZoneOffsetMinutes(date, timeZone);
  const isDst = isDstAt(date, timeZone);

  return {
    year,
    month,
    day,
    hour,
    minute,
    second,
    weekday,
    dayOfYear,
    offsetMinutes,
    isDst,
  };
}

function getDstStatusForUtcDay(date: Date, timeZone: string) {
  const utcYear = date.getUTCFullYear();
  const utcMonth = date.getUTCMonth();
  const utcDay = date.getUTCDate();
  const start = utcDate(utcYear, utcMonth, utcDay);
  const end = utcDate(utcYear, utcMonth, utcDay + 1);

  return {
    start: isDstAt(start, timeZone),
    end: isDstAt(end, timeZone),
  };
}

export {
  getDayOfYear,
  getDstStatusForUtcDay,
  getTimeParts,
  getTimeZoneOffsetMinutes,
  isDstAt,
  isLeapYear,
  willOffsetChangeWithinHour,
};
