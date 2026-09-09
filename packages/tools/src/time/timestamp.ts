export const TIMESTAMP_UNITS = [
  "seconds",
  "milliseconds",
  "nanoseconds",
] as const;
export type TimestampUnit = (typeof TIMESTAMP_UNITS)[number];
export type TimestampZone = "UTC" | "local" | string;
const factors = {
  seconds: 1_000_000_000n,
  milliseconds: 1_000_000n,
  nanoseconds: 1n,
};
const maxNs = 8_640_000_000_000_000_000_000n;
export class TimestampError extends Error {
  constructor(
    public readonly code:
      | "invalid-timestamp"
      | "invalid-date"
      | "invalid-zone"
      | "ambiguous-date"
      | "out-of-range",
  ) {
    super(code);
  }
}
const floor = (n: bigint, d: bigint) =>
  n / d - (n < 0n && n % d !== 0n ? 1n : 0n);
export function timestampValue(
  input: string,
  unit: TimestampUnit | "auto" = "auto",
) {
  if (input.length > 128) throw new TimestampError("invalid-timestamp");
  const match = /^([+-]?)(\d+)(?:\.(\d+))?(?:e([+-]?\d{1,2}))?$/i.exec(
    input.trim(),
  );
  if (!match) throw new TimestampError("invalid-timestamp");
  const integer = match[2].replace(/^0+(?=\d)/, "");
  const exponent = Number(match[4] ?? 0);
  const digits = Math.max(1, integer.length + exponent);
  const effectiveUnit =
    unit === "auto"
      ? digits <= 10
        ? "seconds"
        : digits <= 13
          ? "milliseconds"
          : "nanoseconds"
      : unit;
  if (!TIMESTAMP_UNITS.includes(effectiveUnit))
    throw new TimestampError("invalid-timestamp");
  const fraction = match[3] ?? "";
  let numerator =
    BigInt(integer + fraction) *
    (match[1] === "-" ? -1n : 1n) *
    factors[effectiveUnit];
  const power = exponent - fraction.length;
  if (Math.abs(power) > 128) throw new TimestampError("invalid-timestamp");
  if (power >= 0) numerator *= 10n ** BigInt(power);
  else {
    const denominator = 10n ** BigInt(-power);
    if (numerator % denominator !== 0n)
      throw new TimestampError("invalid-timestamp");
    numerator /= denominator;
  }
  if (numerator > maxNs || numerator < -maxNs)
    throw new TimestampError("out-of-range");
  return { nanoseconds: numerator, effectiveUnit, digits };
}
export function formatTimestamp(ns: bigint, unit: TimestampUnit | "auto") {
  const negative = ns < 0n;
  const absolute = negative ? -ns : ns;
  // Auto parsing treats up to ten integer digits as seconds. Larger instants
  // use nanoseconds so formatting and automatic parsing preserve the instant.
  const effectiveUnit =
    unit === "auto"
      ? absolute < 10_000_000_000_000_000_000n
        ? "seconds"
        : "nanoseconds"
      : unit;
  const divisor = factors[effectiveUnit];
  const remainder = absolute % divisor;
  const fraction = remainder
    ? `.${remainder
        .toString()
        .padStart(divisor.toString().length - 1, "0")
        .replace(/0+$/, "")}`
    : "";
  return `${negative ? "-" : ""}${absolute / divisor}${fraction}`;
}
function offsetMinutes(zone: TimestampZone): number | null {
  if (zone === "UTC") return 0;
  if (zone === "local") return null;
  if (zone !== zone.trim()) throw new TimestampError("invalid-zone");
  const match = /^([+-])(\d{2}):(\d{2})$/.exec(zone);
  if (
    !match ||
    Number(match[2]) > 14 ||
    Number(match[3]) > 59 ||
    (Number(match[2]) === 14 && Number(match[3]) !== 0)
  )
    throw new TimestampError("invalid-zone");
  return (
    (Number(match[2]) * 60 + Number(match[3])) * (match[1] === "-" ? -1 : 1)
  );
}
const fields = (date: Date, local: boolean) =>
  local
    ? [
        date.getFullYear(),
        date.getMonth() + 1,
        date.getDate(),
        date.getHours(),
        date.getMinutes(),
        date.getSeconds(),
        date.getMilliseconds(),
      ]
    : [
        date.getUTCFullYear(),
        date.getUTCMonth() + 1,
        date.getUTCDate(),
        date.getUTCHours(),
        date.getUTCMinutes(),
        date.getUTCSeconds(),
        date.getUTCMilliseconds(),
      ];
export function calendarTimestamp(
  input: string,
  zone: TimestampZone = "UTC",
): bigint {
  const offset = offsetMinutes(zone);
  if (input !== input.trim()) throw new TimestampError("invalid-date");
  const match =
    /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})(?::(\d{2})(?:\.(\d{1,3}))?)?$/.exec(
      input,
    );
  if (!match) throw new TimestampError("invalid-date");
  const parts = [
    ...match.slice(1, 7).map((value) => Number(value ?? 0)),
    Number((match[7] ?? "").padEnd(3, "0")),
  ];
  if (parts[0] < 1) throw new TimestampError("invalid-date");
  const nominal = new Date(0);
  nominal.setUTCFullYear(parts[0], parts[1] - 1, parts[2]);
  nominal.setUTCHours(parts[3], parts[4], parts[5], parts[6]);
  if (fields(nominal, false).some((value, i) => value !== parts[i]))
    throw new TimestampError("invalid-date");
  let ms: number;
  if (offset !== null) ms = nominal.getTime() - offset * 60000;
  else {
    // Probe offsets around the target date, then retain only exact local-calendar matches.
    const offsets = new Set<number>();
    for (let hours = -48; hours <= 48; hours += 6)
      offsets.add(
        new Date(nominal.getTime() + hours * 3600000).getTimezoneOffset(),
      );
    const matches = [...offsets]
      .map((minutes) => nominal.getTime() + minutes * 60000)
      .filter((value) =>
        fields(new Date(value), true).every((field, i) => field === parts[i]),
      );
    if (matches.length === 0) throw new TimestampError("invalid-date");
    if (matches.length > 1) throw new TimestampError("ambiguous-date");
    ms = matches[0];
  }
  return BigInt(ms) * 1_000_000n;
}
export function calendarDisplay(ns: bigint, zone: TimestampZone = "UTC") {
  const offset = offsetMinutes(zone);
  const ms = Number(floor(ns, 1_000_000n));
  const date = new Date(ms + (offset ?? 0) * 60000);
  const p = fields(date, offset === null);
  if (!Number.isFinite(date.getTime()) || p[0] < 1 || p[0] > 9999) return "";
  return `${String(p[0]).padStart(4, "0")}-${String(p[1]).padStart(2, "0")}-${String(p[2]).padStart(2, "0")}T${String(p[3]).padStart(2, "0")}:${String(p[4]).padStart(2, "0")}:${String(p[5]).padStart(2, "0")}.${String(p[6]).padStart(3, "0")}`;
}
export function timestampResult(ns: bigint, zone: TimestampZone = "UTC") {
  if (ns > maxNs || ns < -maxNs) throw new TimestampError("out-of-range");
  const seconds = floor(ns, 1_000_000_000n),
    fraction = ns - seconds * 1_000_000_000n;
  const iso = new Date(Number(seconds * 1000n))
    .toISOString()
    .replace(/\.000Z$/, `.${fraction.toString().padStart(9, "0")}Z`);
  return {
    seconds: formatTimestamp(ns, "seconds"),
    milliseconds: formatTimestamp(ns, "milliseconds"),
    nanoseconds: ns.toString(),
    iso,
    utc: new Date(Number(floor(ns, 1_000_000n))).toUTCString(),
    calendar: calendarDisplay(ns, zone),
    submillisecond: ns % 1_000_000n !== 0n,
  };
}
export function relativeTimestamp(ns: bigint, nowMs: number, locale = "en-US") {
  const diff = Number(ns / 1_000_000n) - nowMs;
  const steps: [
    [Intl.RelativeTimeFormatUnit, number],
    ...[Intl.RelativeTimeFormatUnit, number][],
  ] = [
    ["year", 31536000000],
    ["month", 2592000000],
    ["week", 604800000],
    ["day", 86400000],
    ["hour", 3600000],
    ["minute", 60000],
    ["second", 1000],
  ];
  const [unit, size] =
    steps.find(([, size]) => Math.abs(diff) >= size) ?? steps[steps.length - 1];
  return new Intl.RelativeTimeFormat(locale, { numeric: "auto" }).format(
    Math.round(diff / size),
    unit,
  );
}
