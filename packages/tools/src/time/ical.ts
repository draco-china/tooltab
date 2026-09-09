import { Temporal } from "@js-temporal/polyfill";
import { buildVtimezone, dateTimeValue, dateValue } from "./ical-timezone";
import {
  ICAL_MAX_INPUT,
  IcalError,
  type IcalOptions,
  type IcalResult,
  newIcalUid,
  WEEKDAYS,
} from "./ical-contract";

const integer = (n: number, min = 1, max = 2147483647) =>
  Number.isInteger(n) && n >= min && n <= max;
export function escapeIcalText(value: string) {
  return value
    .replaceAll("\\", "\\\\")
    .replace(/\r\n|\r|\n/g, "\\n")
    .replaceAll(";", "\\;")
    .replaceAll(",", "\\,");
}
export function foldIcalLine(value: string) {
  let bytes = 0,
    line = "";
  const lines: string[] = [];
  for (const char of value) {
    // biome-ignore lint/style/noNonNullAssertion: validated fixed-width index or lookup invariant
    const cp = char.codePointAt(0)!;
    const n = cp < 0x80 ? 1 : cp < 0x800 ? 2 : cp < 0x10000 ? 3 : 4;
    if (bytes + n > 75) {
      lines.push(line);
      line = " ";
      bytes = 1;
    }
    line += char;
    bytes += n;
  }
  lines.push(line);
  return lines.join("\r\n");
}
function date(input: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(input)) throw new IcalError("invalid_date");
  try {
    const value = Temporal.PlainDate.from(input);
    if (value.year < 1) throw Error();
    return value;
  } catch {
    throw new IcalError("invalid_date");
  }
}
function time(input: string) {
  if (!/^\d{2}:\d{2}(?::\d{2})?$/.test(input))
    throw new IcalError("invalid_time");
  try {
    return Temporal.PlainTime.from(input);
  } catch {
    throw new IcalError("invalid_time");
  }
}
function utc(value: Temporal.ZonedDateTime) {
  const result = value.toInstant().toZonedDateTimeISO("UTC");
  if (result.year < 1 || result.year > 9999)
    throw new IcalError("invalid_date");
  return `${dateTimeValue(result)}Z`;
}
function zoned(d: string, t: string, p: IcalOptions, warnings: Set<string>) {
  const local = date(d).toPlainDateTime(time(t));
  try {
    const value = local.toZonedDateTime(p.timeZone, {
      disambiguation: p.disambiguation,
    });
    if (!value.toPlainDateTime().equals(local)) warnings.add("adjusted_time");
    if (p.outputMode === "tzid" && p.disambiguation === "later") {
      const first = local.toZonedDateTime(p.timeZone, {
        disambiguation: "earlier",
      });
      if (
        first.toPlainDateTime().equals(local) &&
        first.epochNanoseconds !== value.epochNanoseconds
      )
        throw new IcalError("fold_tzid");
    }
    return value;
  } catch (error) {
    if (error instanceof IcalError) throw error;
    throw new IcalError("ambiguous_time");
  }
}
export function generateIcal(p: IcalOptions, nowMs: number): IcalResult {
  const strings = [p.summary, p.location, p.url, p.notes, p.uid, p.timeZone];
  let bytes = 0;
  for (const value of strings) {
    bytes += new TextEncoder().encode(value).length;
    for (const char of value) {
      // biome-ignore lint/style/noNonNullAssertion: validated fixed-width index or lookup invariant
      const cp = char.codePointAt(0)!;
      if (
        (cp >= 0xd800 && cp <= 0xdfff) ||
        (cp < 32 && ![9, 10, 13].includes(cp)) ||
        cp === 127
      )
        throw new IcalError("invalid_unicode");
    }
  }
  if (bytes > ICAL_MAX_INPUT) throw new IcalError("too_large");
  if (
    !p.uid.trim() ||
    p.uid.length > 1024 ||
    Array.from(p.uid).some(
      // biome-ignore lint/style/noNonNullAssertion: validated fixed-width index or lookup invariant
      (c) => c.codePointAt(0)! < 32 || c.codePointAt(0) === 127,
    )
  )
    throw new IcalError("invalid_uid");
  if (!Number.isSafeInteger(nowMs)) throw new IcalError("invalid_date");
  let stamp: string;
  try {
    const v =
      Temporal.Instant.fromEpochMilliseconds(nowMs).toZonedDateTimeISO("UTC");
    if (v.year < 1 || v.year > 9999) throw Error();
    stamp = `${dateTimeValue(v)}Z`;
  } catch {
    throw new IcalError("invalid_date");
  }
  let url = "";
  if (p.url) {
    try {
      if (/\s/.test(p.url)) throw Error();
      url = new URL(p.url).href;
    } catch {
      throw new IcalError("invalid_url");
    }
  }
  if (
    !["none", "daily", "weekly", "monthly", "yearly"].includes(p.frequency) ||
    !integer(p.interval) ||
    !integer(p.count) ||
    !integer(p.month, 1, 12) ||
    !integer(p.monthDay, 1, 31) ||
    p.weekdays.length > 7 ||
    p.weekdays.some((day) => !WEEKDAYS.includes(day)) ||
    !["never", "count", "until"].includes(p.endMode)
  )
    throw new IcalError("invalid_recurrence");
  if (
    p.reminders.length > 1000 ||
    p.reminders.some(
      (r) =>
        !integer(r.amount) ||
        !["minutes", "hours", "days", "weeks"].includes(r.unit),
    )
  )
    throw new IcalError("invalid_reminders");
  if (
    !["utc", "tzid"].includes(p.outputMode) ||
    !["reject", "compatible", "earlier", "later"].includes(p.disambiguation)
  )
    throw new IcalError("invalid_time");
  const warnings = new Set<string>(),
    startDate = date(p.startDate),
    endDate = date(p.endDate),
    lines = [
      "BEGIN:VCALENDAR",
      "VERSION:2.0",
      "PRODID:-//ToolTab//iCal event generator//EN",
      "CALSCALE:GREGORIAN",
    ];
  let startLine: string,
    endLine: string,
    until: string | undefined,
    startInstant: bigint | undefined,
    transitions = 0;
  if (p.allDay) {
    if (Temporal.PlainDate.compare(endDate, startDate) < 0)
      throw new IcalError("end_before_start");
    const exclusive = endDate.add({ days: 1 });
    if (exclusive.year > 9999) throw new IcalError("invalid_date");
    startLine = `DTSTART;VALUE=DATE:${dateValue(startDate)}`;
    endLine = `DTEND;VALUE=DATE:${dateValue(exclusive)}`;
  } else {
    try {
      if (!/^[A-Za-z0-9_+./-]+$/.test(p.timeZone)) throw Error();
      new Intl.DateTimeFormat("en", { timeZone: p.timeZone }).format(0);
    } catch {
      throw new IcalError("invalid_zone");
    }
    const start = zoned(p.startDate, p.startTime, p, warnings),
      end = zoned(p.endDate, p.endTime, p, warnings);
    startInstant = start.epochNanoseconds;
    if (end.epochNanoseconds <= startInstant)
      throw new IcalError("end_before_start");
    if (p.outputMode === "tzid") {
      const zone = buildVtimezone(p.timeZone);
      lines.push(...zone.lines);
      transitions = zone.transitions;
      startLine = `DTSTART;TZID=${p.timeZone}:${dateTimeValue(start)}`;
      endLine = `DTEND;TZID=${p.timeZone}:${dateTimeValue(end)}`;
    } else {
      startLine = `DTSTART:${utc(start)}`;
      endLine = `DTEND:${utc(end)}`;
    }
  }
  if (p.frequency !== "none" && p.endMode === "until") {
    const untilDate = date(p.untilDate);
    if (p.allDay) {
      if (Temporal.PlainDate.compare(untilDate, startDate) < 0)
        throw new IcalError("until_before_start");
      until = dateValue(untilDate);
    } else {
      const value = zoned(
        p.untilDate,
        p.untilTime,
        { ...p, outputMode: "utc" },
        warnings,
      );
      // Timed events assigned startInstant above; all-day events use the other branch.
      // biome-ignore lint/style/noNonNullAssertion: validated fixed-width index or lookup invariant
      if (value.epochNanoseconds < startInstant!)
        throw new IcalError("until_before_start");
      until = utc(value);
    }
  }
  lines.push(
    "BEGIN:VEVENT",
    `UID:${escapeIcalText(p.uid)}`,
    `DTSTAMP:${stamp}`,
    startLine,
    endLine,
  );
  for (const [key, value] of [
    ["SUMMARY", p.summary],
    ["LOCATION", p.location],
    ["DESCRIPTION", p.notes],
  ] as const)
    if (value) lines.push(`${key}:${escapeIcalText(value)}`);
  if (url) lines.push(`URL:${url}`);
  if (p.frequency !== "none") {
    const rule = [
      `FREQ=${p.frequency.toUpperCase()}`,
      `INTERVAL=${p.interval}`,
    ];
    if (p.frequency === "weekly" && p.weekdays.length)
      rule.push(`BYDAY=${[...new Set(p.weekdays)].join(",")}`);
    if (p.frequency === "monthly" || p.frequency === "yearly")
      rule.push(`BYMONTHDAY=${p.monthDay}`);
    if (p.frequency === "yearly") rule.push(`BYMONTH=${p.month}`);
    if (p.endMode === "count") rule.push(`COUNT=${p.count}`);
    if (until) rule.push(`UNTIL=${until}`);
    lines.push(`RRULE:${rule.join(";")}`);
    if (p.outputMode === "utc" && !p.allDay && p.timeZone !== "UTC")
      warnings.add("utc_recurrence");
    // date() accepts only ISO dates; dayOfWeek is 1–7, matching WEEKDAYS.
    if (
      (p.frequency === "weekly" &&
        p.weekdays.length &&
        // biome-ignore lint/style/noNonNullAssertion: validated fixed-width index or lookup invariant
        !p.weekdays.includes(WEEKDAYS[startDate.dayOfWeek - 1]!)) ||
      ((p.frequency === "monthly" || p.frequency === "yearly") &&
        p.monthDay !== startDate.day) ||
      (p.frequency === "yearly" && p.month !== startDate.month)
    )
      warnings.add("start_rule_mismatch");
  }
  if (p.remindersEnabled) {
    const description = `DESCRIPTION:${escapeIcalText(p.summary || "Reminder")}`;
    for (const reminder of p.reminders) {
      const suffix = {
        minutes: `T${reminder.amount}M`,
        hours: `T${reminder.amount}H`,
        days: `${reminder.amount}D`,
        weeks: `${reminder.amount}W`,
      }[reminder.unit];
      lines.push(
        "BEGIN:VALARM",
        "ACTION:DISPLAY",
        `TRIGGER:-P${suffix}`,
        description,
        "END:VALARM",
      );
    }
  }
  lines.push("END:VEVENT", "END:VCALENDAR");
  // Folding only adds characters. Reject certainly oversized output before
  // allocating and folding every repeated alarm description. Keep the exact
  // post-fold check for inputs whose continuation lines cross the limit.
  if (
    lines.reduce((size, line) => size + line.length + 2, 0) >
    32 * 1024 * 1024
  )
    throw new IcalError("output_too_large");
  const content = `${lines.map(foldIcalLine).join("\r\n")}\r\n`;
  if (content.length > 32 * 1024 * 1024)
    throw new IcalError("output_too_large");
  const name =
    p.summary
      .trim()
      .replace(/[^\p{Letter}\p{Number}_.-]+/gu, "-")
      .slice(0, 120)
      .replace(/^[.-]+|[.-]+$/g, "") || "event";
  return {
    content,
    filename: `${name}.ics`,
    uid: p.uid,
    dtstamp: stamp,
    warnings: [...warnings],
    timeZoneTransitions: transitions,
  };
}

import * as z from "zod/v4";

const positive = z.number().int().min(1).max(2147483647);
export const icalOptionsSchema = z.strictObject({
  summary: z.string().max(ICAL_MAX_INPUT).default(""),
  location: z.string().max(ICAL_MAX_INPUT).default(""),
  url: z.string().max(16384).default(""),
  notes: z.string().max(ICAL_MAX_INPUT).default(""),
  uid: z.string().min(1).max(1024).default(newIcalUid).meta({
    default: undefined,
    description:
      "A fresh identifier is generated for each execution when omitted.",
  }),
  allDay: z.boolean().default(false),
  timeZone: z.string().min(1).max(128).default("UTC"),
  outputMode: z.enum(["utc", "tzid"]).default("utc"),
  startDate: z.string().max(10),
  startTime: z.string().max(8).default("09:00"),
  endDate: z.string().max(10),
  endTime: z.string().max(8).default("10:00"),
  disambiguation: z
    .enum(["reject", "compatible", "earlier", "later"])
    .default("reject"),
  frequency: z
    .enum(["none", "daily", "weekly", "monthly", "yearly"])
    .default("none"),
  interval: positive.default(1),
  weekdays: z.array(z.enum(WEEKDAYS)).max(7).default([]),
  monthDay: z.number().int().min(1).max(31).default(1),
  month: z.number().int().min(1).max(12).default(1),
  endMode: z.enum(["never", "count", "until"]).default("never"),
  count: positive.default(10),
  untilDate: z.string().max(10).default(""),
  untilTime: z.string().max(8).default("23:59"),
  remindersEnabled: z.boolean().default(false),
  reminders: z
    .array(
      z.strictObject({
        id: z.string().max(1024).default(newIcalUid).meta({
          default: undefined,
          description:
            "A fresh identifier is generated for each execution when omitted.",
        }),
        amount: positive,
        unit: z.enum(["minutes", "hours", "days", "weeks"]),
      }),
    )
    .max(1000)
    .default(() => [{ id: newIcalUid(), amount: 15, unit: "minutes" as const }])
    .meta({
      default: undefined,
      description:
        "When omitted, creates one 15-minute reminder with a fresh identifier.",
    }),
});
