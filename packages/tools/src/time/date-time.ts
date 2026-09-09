import { Temporal } from "@js-temporal/polyfill";
export const DISAMBIGUATIONS = [
  "reject",
  "earlier",
  "later",
  "compatible",
] as const;
export type Disambiguation = (typeof DISAMBIGUATIONS)[number];
export class DateToolError extends Error {
  constructor(
    public readonly code:
      | "invalid_date"
      | "invalid_zone"
      | "ambiguous_date"
      | "invalid_duration"
      | "out_of_range"
      | "invalid_rules"
      | "invalid_holidays"
      | "no_working_days"
      | "too_large",
  ) {
    super(code);
  }
}
export function zones() {
  try {
    return ["UTC", ...Intl.supportedValuesOf("timeZone")];
  } catch {
    return [
      "UTC",
      "Asia/Shanghai",
      "Asia/Tokyo",
      "Asia/Kolkata",
      "Europe/London",
      "Europe/Berlin",
      "America/New_York",
      "America/Los_Angeles",
      "Australia/Sydney",
      "Pacific/Auckland",
    ];
  }
}
function zone(value: string) {
  if (
    value.length > 100 ||
    !value ||
    value !== value.trim() ||
    /^[+-]/.test(value)
  )
    throw new DateToolError("invalid_zone");
  try {
    new Intl.DateTimeFormat("en", { timeZone: value });
    return value;
  } catch {
    throw new DateToolError("invalid_zone");
  }
}
export function localDateTime(input: string) {
  if (input.length > 40) throw new DateToolError("invalid_date");
  const s = input.trim();
  if (
    !/^\d{4}-\d{2}-\d{2}(?:[ T]\d{2}:\d{2}(?::\d{2}(?:\.\d{1,3})?)?)?$/.test(
      s,
    ) ||
    s.startsWith("0000-")
  )
    throw new DateToolError("invalid_date");
  if (/:60(?:\.|$)/.test(s)) throw new DateToolError("invalid_date");
  try {
    return Temporal.PlainDateTime.from(s.length === 10 ? `${s}T00:00` : s, {
      overflow: "reject",
    });
  } catch {
    throw new DateToolError("invalid_date");
  }
}
export function resolveTime(
  input: string,
  timeZone: string,
  disambiguation: Disambiguation = "reject",
) {
  const plain = localDateTime(input);
  zone(timeZone);
  if (!DISAMBIGUATIONS.includes(disambiguation))
    throw new DateToolError("invalid_date");
  try {
    return plain.toZonedDateTime(timeZone, { disambiguation });
  } catch {
    throw new DateToolError("ambiguous_date");
  }
}
export function snapshot(timestamp: bigint, timeZone: string) {
  zone(timeZone);
  try {
    const instant = Temporal.Instant.fromEpochNanoseconds(timestamp * 1000000n),
      zoned = instant.toZonedDateTimeISO(timeZone);
    if (zoned.year < 1 || zoned.year > 9999) throw new Error();
    return {
      dateTime: zoned
        .toPlainDateTime()
        .toString({ smallestUnit: "millisecond" })
        .replace("T", " "),
      offset: zoned.offset,
      iso8601: instant.toString({ smallestUnit: "millisecond" }),
      utc: new Date(Number(timestamp)).toUTCString(),
      unixMilliseconds: timestamp.toString(),
      unixSeconds: (
        timestamp / 1000n -
        (timestamp < 0n && timestamp % 1000n !== 0n ? 1n : 0n)
      ).toString(),
    };
  } catch {
    throw new DateToolError("out_of_range");
  }
}
export function convertZone(
  input: string,
  fromZone: string,
  toZone: string,
  disambiguation: Disambiguation = "reject",
) {
  const resolved = resolveTime(input, fromZone, disambiguation),
    ms = BigInt(resolved.epochMilliseconds);
  return {
    from: snapshot(ms, fromZone),
    to: snapshot(ms, toZone),
    disambiguation,
    adjusted: !resolved.toPlainDateTime().equals(localDateTime(input)),
  };
}
const UNITS = {
  days: 86400000n,
  hours: 3600000n,
  minutes: 60000n,
  seconds: 1000n,
  milliseconds: 1n,
};
export type DurationParts = Record<keyof typeof UNITS, string>;
export function durationParts(ms: bigint): DurationParts {
  let n = ms < 0n ? -ms : ms;
  return Object.fromEntries(
    Object.entries(UNITS).map(([key, unit]) => {
      const value = n / unit;
      n %= unit;
      return [key, value.toString()];
    }),
  ) as DurationParts;
}
export function durationIso(ms: bigint) {
  const p = durationParts(ms),
    day = p.days !== "0" ? `${p.days}D` : "",
    parts = [
      p.hours !== "0" ? `${p.hours}H` : "",
      p.minutes !== "0" ? `${p.minutes}M` : "",
      p.seconds !== "0" || p.milliseconds !== "0"
        ? `${p.seconds}${p.milliseconds !== "0" ? `.${p.milliseconds.padStart(3, "0")}` : ""}S`
        : "",
    ].join("");
  return `${ms < 0n ? "-" : ""}P${day}${parts ? `T${parts}` : day ? "" : "T0S"}`;
}
function decimal(n: bigint, d: bigint, precision: number) {
  const negative = n < 0n,
    a = negative ? -n : n,
    scale = 10n ** BigInt(precision),
    rounded = (a * scale + d / 2n) / d;
  const whole = rounded / scale,
    fraction = (rounded % scale)
      .toString()
      .padStart(precision, "0")
      .replace(/0+$/, "");
  return `${negative && rounded !== 0n ? "-" : ""}${whole}${fraction ? `.${fraction}` : ""}`;
}
function durationLabel(ms: bigint) {
  const p = durationParts(ms);
  return `${ms < 0n ? "-" : ""}${p.days}d ${p.hours.padStart(2, "0")}:${p.minutes.padStart(2, "0")}:${p.seconds.padStart(2, "0")}.${p.milliseconds.padStart(3, "0")}`;
}
export function timeDifference(
  start: string,
  startZone: string,
  end: string,
  endZone: string,
  disambiguation: Disambiguation = "reject",
) {
  const a = resolveTime(start, startZone, disambiguation),
    b = resolveTime(end, endZone, disambiguation),
    ms = BigInt(b.epochMilliseconds) - BigInt(a.epochMilliseconds);
  return {
    start: snapshot(BigInt(a.epochMilliseconds), startZone),
    end: snapshot(BigInt(b.epochMilliseconds), endZone),
    signedDuration: durationLabel(ms),
    absoluteDuration: durationLabel(ms < 0n ? -ms : ms),
    isoDuration: durationIso(ms),
    parts: durationParts(ms),
    totalMilliseconds: ms.toString(),
    totalSeconds: decimal(ms, 1000n, 3),
    totalMinutes: decimal(ms, 60000n, 6),
    totalHours: decimal(ms, 3600000n, 6),
    totalDays: decimal(ms, 86400000n, 6),
  };
}
export function parseDuration(value: string | DurationParts) {
  let ms = 0n;
  if (typeof value === "string") {
    if (value.length > 200) throw new DateToolError("invalid_duration");
    const normalized = value.trim().toUpperCase().replace(",", ".");
    if (
      !/^\+?P(?:\d+D)?(?:T(?:\d+H)?(?:\d+M)?(?:\d+(?:\.\d{1,3})?S)?)?$/.test(
        normalized,
      ) ||
      !/\d/.test(normalized)
    )
      throw new DateToolError("invalid_duration");
    for (const match of normalized.matchAll(/(\d+(?:\.\d{1,3})?)([DHMS])/g)) {
      // biome-ignore lint/style/noNonNullAssertion: validated fixed-width index or lookup invariant
      const val = match[1]!,
        // biome-ignore lint/style/noNonNullAssertion: validated fixed-width index or lookup invariant
        unit = (
          { D: 86400000n, H: 3600000n, M: 60000n, S: 1000n } as Record<
            string,
            bigint
          >
        )[
          // biome-ignore lint/style/noNonNullAssertion: validated fixed-width index or lookup invariant
          match[2]!
        ]!;
      if (val.includes(".")) {
        const [i, f] = val.split(".");
        // biome-ignore lint/style/noNonNullAssertion: validated fixed-width index or lookup invariant
        ms += BigInt(i!) * unit + BigInt(f!.padEnd(3, "0"));
      } else ms += BigInt(val) * unit;
    }
  } else
    for (const [key, unit] of Object.entries(UNITS)) {
      const n = value[key as keyof DurationParts];
      if (typeof n !== "string" || !/^\d{1,16}$/.test(n))
        throw new DateToolError("invalid_duration");
      ms += BigInt(n) * unit;
    }
  if (ms > 315537897599999n) throw new DateToolError("out_of_range");
  return ms;
}
export function calculateDuration(
  base: string,
  timeZone: string,
  duration: string | DurationParts,
  disambiguation: Disambiguation = "reject",
) {
  const ms = parseDuration(duration),
    start = BigInt(
      resolveTime(base, timeZone, disambiguation).epochMilliseconds,
    );
  const result = (value: bigint) => {
    try {
      return snapshot(value, timeZone);
    } catch (error) {
      // snapshot normalizes failures to DateToolError; only range exhaustion is nullable.
      if ((error as DateToolError).code === "out_of_range") return null;
      throw error;
    }
  };
  return {
    duration: durationIso(ms),
    parts: durationParts(ms),
    totalMilliseconds: ms.toString(),
    add: result(start + ms),
    subtract: result(start - ms),
  };
}
