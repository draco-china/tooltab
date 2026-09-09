import { businessDays } from "@workspace/tools/time/business-days";
import * as z from "zod/v4";
import {
  calculateDuration,
  convertZone,
  DISAMBIGUATIONS,
  timeDifference,
} from "@workspace/tools/time/date-time";
import type { Operation } from "./operation-contract";

const dateTime = z.string().max(40),
  zone = z.string().min(1).max(100),
  policy = z.enum(DISAMBIGUATIONS).default("reject");
const snapshot = z.strictObject({
  dateTime: z.string(),
  offset: z.string(),
  iso8601: z.string(),
  utc: z.string(),
  unixMilliseconds: z.string(),
  unixSeconds: z.string(),
});
const parts = z.strictObject({
  days: z.string().regex(/^\d{1,16}$/),
  hours: z.string().regex(/^\d{1,16}$/),
  minutes: z.string().regex(/^\d{1,16}$/),
  seconds: z.string().regex(/^\d{1,16}$/),
  milliseconds: z.string().regex(/^\d{1,16}$/),
});
export const zoneInputSchema = z.strictObject({
  input: dateTime,
  fromZone: zone,
  toZone: zone,
  disambiguation: policy,
});
export const diffInputSchema = z.strictObject({
  start: dateTime,
  startZone: zone,
  end: dateTime,
  endZone: zone,
  disambiguation: policy,
});
export const durationInputSchema = z.strictObject({
  base: dateTime,
  timeZone: zone,
  duration: z.union([z.string().max(200), parts]),
  disambiguation: policy,
});
export const businessInputSchema = z.strictObject({
  start: z.string().max(10),
  end: z.string().max(10),
  base: z.string().max(10),
  offset: z.number().int().min(0).max(3652059),
  weekendDays: z.array(z.number().int().min(0).max(6)).max(7).default([0, 6]),
  holidays: z.string().max(1000000).default(""),
  includeEndpoints: z.boolean().default(true),
  includeStart: z.boolean().default(false),
});
export const dateToolOperations: Operation[] = [
  {
    id: "time-zone-converter",
    name: "tooltab_time_zone_converter",
    description:
      "Convert millisecond local date/time between IANA zones. DST gaps/folds reject by default; explicit earlier/later/compatible policies available. Returns normalized local values, offsets and exact epoch strings.",
    inputSchema: zoneInputSchema,
    outputSchema: z.strictObject({
      from: snapshot,
      to: snapshot,
      disambiguation: z.enum(DISAMBIGUATIONS),
      adjusted: z.boolean(),
    }),
    bodyLimit: 10000,
    idempotent: true,
    run(v) {
      const p = zoneInputSchema.parse(v);
      return convertZone(p.input, p.fromZone, p.toZone, p.disambiguation);
    },
  },
  {
    id: "time-diff-calculator",
    name: "tooltab_time_diff_calculator",
    description:
      "Compare elapsed time between two IANA-zone local date/times, with explicit DST policy. Milliseconds/seconds exact; minutes/hours/days round to six decimals. Days are fixed 24 hours.",
    inputSchema: diffInputSchema,
    outputSchema: z.strictObject({
      start: snapshot,
      end: snapshot,
      signedDuration: z.string(),
      absoluteDuration: z.string(),
      isoDuration: z.string(),
      parts,
      totalMilliseconds: z.string(),
      totalSeconds: z.string(),
      totalMinutes: z.string(),
      totalHours: z.string(),
      totalDays: z.string(),
    }),
    bodyLimit: 10000,
    idempotent: true,
    run(v) {
      const p = diffInputSchema.parse(v);
      return timeDifference(
        p.start,
        p.startZone,
        p.end,
        p.endZone,
        p.disambiguation,
      );
    },
  },
  {
    id: "duration-calculator",
    name: "tooltab_duration_calculator",
    description:
      "Add and subtract a nonnegative fixed duration from an IANA-zone local time. ISO days/hours/minutes/seconds or integer string parts; milliseconds precision. Days equal 24 elapsed hours, never calendar months/years.",
    inputSchema: durationInputSchema,
    outputSchema: z.strictObject({
      duration: z.string(),
      parts,
      totalMilliseconds: z.string(),
      add: snapshot.nullable(),
      subtract: snapshot.nullable(),
    }),
    bodyLimit: 10000,
    idempotent: true,
    run(v) {
      const p = durationInputSchema.parse(v);
      return calculateDuration(
        p.base,
        p.timeZone,
        p.duration,
        p.disambiguation,
      );
    },
  },
  {
    id: "business-days-calculator",
    name: "tooltab_business_days_calculator",
    description:
      "Count and shift Gregorian calendar business days with custom weekend indices (Sunday=0), holiday lines, endpoint and start inclusion. Reversed ranges swap. Invalid holidays are reported and ignored; duplicates deduplicate. No time-zone conversion.",
    inputSchema: businessInputSchema,
    outputSchema: z.strictObject({
      businessDays: z.number(),
      totalDays: z.number(),
      weekendDays: z.number(),
      holidayDays: z.number(),
      isReversed: z.boolean(),
      add: z.string().nullable(),
      subtract: z.string().nullable(),
      invalidHolidays: z.array(
        z.strictObject({ line: z.number(), value: z.string() }),
      ),
      noWorkingDays: z.boolean(),
    }),
    bodyLimit: 6100000,
    idempotent: true,
    run(v) {
      const p = businessInputSchema.parse(v);
      return businessDays(
        p.start,
        p.end,
        p.base,
        p.offset,
        { weekendDays: p.weekendDays, holidays: p.holidays },
        p.includeEndpoints,
        p.includeStart,
      );
    },
  },
];
