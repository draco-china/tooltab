import * as z from "zod/v4";
import {
  calendarTimestamp,
  relativeTimestamp,
  timestampResult,
  timestampValue,
} from "@workspace/tools/time/timestamp";

const zone = z
  .string()
  .regex(/^(?:UTC|[+-](?:0\d|1[0-4]):[0-5]\d)$/)
  // Describe the core's actual range while retaining legacy parsing so offsets
  // outside ±14:00 keep their existing invalid-zone execution error.
  .meta({
    pattern: "^(?:UTC|[+-](?:(?:0[0-9]|1[0-3]):[0-5][0-9]|14:00))(?![\\s\\S])",
  })
  .default("UTC");
const relativeOptions = {
  locale: z.enum(["en-US", "zh-CN"]).default("en-US"),
  referenceMilliseconds: z
    .number()
    .int()
    .min(-8_640_000_000_000_000)
    .max(8_640_000_000_000_000)
    .optional(),
};
export const unixTimestampInputSchema = z.discriminatedUnion("mode", [
  z.strictObject({
    mode: z.literal("timestamp"),
    input: z.string().min(1).max(128),
    unit: z
      .enum(["auto", "seconds", "milliseconds", "nanoseconds"])
      .default("auto"),
    zone,
    ...relativeOptions,
  }),
  z.strictObject({
    mode: z.literal("calendar"),
    input: z.string().min(1).max(32),
    zone,
    ...relativeOptions,
  }),
  z.strictObject({ mode: z.literal("now"), zone, ...relativeOptions }),
]);
export const unixTimestampOutputSchema = z.strictObject({
  seconds: z.string(),
  milliseconds: z.string(),
  nanoseconds: z.string(),
  iso: z.string(),
  relative: z.string(),
  utc: z.string(),
  calendar: z.string(),
  submillisecond: z.boolean(),
  effectiveUnit: z.string(),
  zone: z.string(),
});
export function runUnixTimestamp(input: unknown, signal?: AbortSignal) {
  signal?.throwIfAborted();
  const args = unixTimestampInputSchema.parse(input);
  const parsed =
    args.mode === "timestamp"
      ? timestampValue(args.input, args.unit)
      : {
          nanoseconds:
            args.mode === "now"
              ? BigInt(Date.now()) * 1_000_000n
              : calendarTimestamp(args.input, args.zone),
          effectiveUnit: "milliseconds",
        };
  return {
    ...timestampResult(parsed.nanoseconds, args.zone),
    relative: relativeTimestamp(
      parsed.nanoseconds,
      args.referenceMilliseconds ?? Date.now(),
      args.locale,
    ),
    effectiveUnit: parsed.effectiveUnit,
    zone: args.zone,
  };
}
