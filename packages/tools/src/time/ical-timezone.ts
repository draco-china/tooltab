import { Temporal } from "@js-temporal/polyfill";
import { IcalError } from "./ical-contract";
export const dateValue = (date: { year: number; month: number; day: number }) =>
  `${String(date.year).padStart(4, "0")}${String(date.month).padStart(2, "0")}${String(date.day).padStart(2, "0")}`;
export const dateTimeValue = (date: {
  year: number;
  month: number;
  day: number;
  hour: number;
  minute: number;
  second: number;
}) =>
  `${dateValue(date)}T${String(date.hour).padStart(2, "0")}${String(date.minute).padStart(2, "0")}${String(date.second).padStart(2, "0")}`;
function offsetValue(nanoseconds: number) {
  const sign = nanoseconds < 0 ? "-" : "+",
    seconds = Math.abs(nanoseconds) / 1e9,
    h = Math.floor(seconds / 3600),
    m = Math.floor(seconds / 60) % 60,
    s = seconds % 60;
  return `${sign}${String(h).padStart(2, "0")}${String(m).padStart(2, "0")}${s ? String(s).padStart(2, "0") : ""}`;
}
/** Format explicit offset changes independently of the host timezone database. */
export function formatVtimezone(
  timeZone: string,
  initialOffsetNanoseconds: number,
  changes: Iterable<{
    instant: Temporal.Instant;
    offsetBefore: number;
    offsetAfter: number;
  }>,
) {
  let transitions = 0;
  const initialOffset = offsetValue(initialOffsetNanoseconds),
    groups = new Map<string, { from: string; to: string; dates: string[] }>();
  for (const change of changes) {
    if (++transitions > 100000) throw new IcalError("zone_capacity");
    const from = offsetValue(change.offsetBefore),
      to = offsetValue(change.offsetAfter);
    // RFC observance DTSTART is the local wall time immediately before the change.
    const local = change.instant
      .toZonedDateTimeISO("UTC")
      .toPlainDateTime()
      .add({ nanoseconds: change.offsetBefore });
    if (local.year >= 1 && local.year <= 9999) {
      const key = `${from}/${to}`,
        value = groups.get(key) ?? { from, to, dates: [] };
      value.dates.push(dateTimeValue(local));
      groups.set(key, value);
    }
  }
  const lines = [
    "BEGIN:VTIMEZONE",
    `TZID:${timeZone}`,
    "BEGIN:STANDARD",
    "DTSTART:00010101T000000",
    `TZOFFSETFROM:${initialOffset}`,
    `TZOFFSETTO:${initialOffset}`,
    "END:STANDARD",
  ];
  for (const value of groups.values()) {
    // Offset observances are explicit dates, with no speculative future annual rule.
    // STANDARD does not assert a DST name; chronological offset transitions are exact.
    lines.push(
      "BEGIN:STANDARD",
      `DTSTART:${value.dates[0]}`,
      `TZOFFSETFROM:${value.from}`,
      `TZOFFSETTO:${value.to}`,
      ...value.dates.map((date) => `RDATE:${date}`),
      "END:STANDARD",
    );
  }
  lines.push("END:VTIMEZONE");
  // Cached observances are shared by later calendar exports. Protect both levels.
  const result = Object.freeze({ lines: Object.freeze(lines), transitions });
  return result;
}
const cache = new Map<string, ReturnType<typeof formatVtimezone>>();
export function buildVtimezone(timeZone: string) {
  const cached = cache.get(timeZone);
  if (cached) return cached;
  let current = Temporal.PlainDateTime.from(
    "0001-01-01T00:00:00",
  ).toZonedDateTime(timeZone);
  const initialOffset = current.offsetNanoseconds;
  function* changes() {
    while (true) {
      const next = current.getTimeZoneTransition("next");
      if (!next || next.year > 9999) break;
      yield {
        instant: next.toInstant(),
        offsetBefore: next.subtract({ nanoseconds: 1 }).offsetNanoseconds,
        offsetAfter: next.offsetNanoseconds,
      };
      current = next;
    }
  }
  const result = formatVtimezone(timeZone, initialOffset, changes());
  // biome-ignore lint/style/noNonNullAssertion: validated fixed-width index or lookup invariant
  if (cache.size >= 8) cache.delete(cache.keys().next().value!);
  cache.set(timeZone, result);
  return result;
}
