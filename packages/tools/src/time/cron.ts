import { CronExpressionParser } from "cron-parser";
import { Temporal } from "@js-temporal/polyfill";
import { snapshot } from "./date-time";
export class CronToolError extends Error {
  constructor(
    public readonly code:
      | "invalid_expression"
      | "invalid_options"
      | "invalid_field"
      | "iteration_failed",
  ) {
    super(code);
  }
}
export const FIELD_NAMES = [
  "minute",
  "hour",
  "dayOfMonth",
  "month",
  "dayOfWeek",
] as const;
export type FieldName = (typeof FIELD_NAMES)[number];
export const FIELD_LIMITS: Record<FieldName, [number, number]> = {
  minute: [0, 59],
  hour: [0, 23],
  dayOfMonth: [1, 31],
  month: [1, 12],
  dayOfWeek: [0, 6],
};
export const PRESETS = {
  everyMinute: "* * * * *",
  everyFiveMinutes: "*/5 * * * *",
  everyFifteenMinutes: "*/15 * * * *",
  everyThirtyMinutes: "*/30 * * * *",
  hourly: "0 * * * *",
  dailyMidnight: "0 0 * * *",
  dailyNoon: "0 12 * * *",
  weeklySunday: "0 0 * * 0",
  weeklyMondayMorning: "0 9 * * 1",
  monthlyFirstDay: "0 0 1 * *",
  weekdaysMorning: "0 9 * * 1-5",
} as const;
export type FieldState = {
  mode: "every" | "interval" | "specific" | "range";
  interval: number;
  specificValues: number[];
  rangeStart: number;
  rangeEnd: number;
};
export type CronForm = Record<FieldName, FieldState>;
export function defaultForm(): CronForm {
  const field = (name: FieldName): FieldState => ({
    mode: "every",
    interval: 5,
    specificValues: [],
    rangeStart: FIELD_LIMITS[name][0],
    rangeEnd: FIELD_LIMITS[name][1],
  });
  return {
    minute: field("minute"),
    hour: field("hour"),
    dayOfMonth: field("dayOfMonth"),
    month: field("month"),
    dayOfWeek: field("dayOfWeek"),
  };
}
export function buildExpression(form: CronForm) {
  return FIELD_NAMES.map((key) => {
    const state = form[key],
      [min, max] = FIELD_LIMITS[key];
    if (!state) throw new CronToolError("invalid_field");
    const valid = (v: number) => Number.isInteger(v) && v >= min && v <= max;
    switch (state.mode) {
      case "every":
        return "*";
      case "interval":
        if (
          !Number.isInteger(state.interval) ||
          state.interval < 1 ||
          state.interval > max - min + 1
        )
          throw new CronToolError("invalid_field");
        return `*/${state.interval}`;
      case "specific":
        if (
          state.specificValues.length > max - min + 1 ||
          state.specificValues.some((v) => !valid(v))
        )
          throw new CronToolError("invalid_field");
        return (
          [...new Set(state.specificValues)].sort((a, b) => a - b).join(",") ||
          "*"
        );
      case "range":
        if (
          !valid(state.rangeStart) ||
          !valid(state.rangeEnd) ||
          state.rangeStart > state.rangeEnd
        )
          throw new CronToolError("invalid_field");
        return `${state.rangeStart}-${state.rangeEnd}`;
      default:
        throw new CronToolError("invalid_field");
    }
  }).join(" ");
}
// Presets are validated by the maintained parser; this maps only the builder's own four representable forms.
export function formFromPreset(id: keyof typeof PRESETS) {
  const expression = PRESETS[id];
  if (!expression) throw new CronToolError("invalid_options");
  const form = defaultForm();
  expression.split(" ").forEach((value, i) => {
    // biome-ignore lint/style/noNonNullAssertion: validated fixed-width index or lookup invariant
    const key = FIELD_NAMES[i]!;
    if (value.startsWith("*/"))
      form[key] = {
        ...form[key],
        mode: "interval",
        interval: Number(value.slice(2)),
      };
    else if (value.includes("-")) {
      const [start, end] = value.split("-").map(Number);
      form[key] = {
        ...form[key],
        mode: "range",
        // biome-ignore lint/style/noNonNullAssertion: validated fixed-width index or lookup invariant
        rangeStart: start!,
        // biome-ignore lint/style/noNonNullAssertion: validated fixed-width index or lookup invariant
        rangeEnd: end!,
      };
    } else if (value !== "*")
      form[key] = {
        ...form[key],
        mode: "specific",
        specificValues: value.split(",").map(Number),
      };
  });
  return form;
}
export type CronOptions = {
  reference: string;
  timeZone: string;
  count: number;
  hashSeed: string;
};
export function normalizeCronExpression(input: string) {
  if (input.length > 512 || !input.trim())
    throw new CronToolError("invalid_expression");
  const expression = input.trim().replace(/\s+/g, " ");
  const tokens = expression.split(" ");
  if (!expression.startsWith("@") && tokens.length !== 5 && tokens.length !== 6)
    throw new CronToolError("invalid_expression");
  return expression;
}

export function inspectCron(input: string, options: CronOptions) {
  const expression = normalizeCronExpression(input),
    tokens = expression.split(" ");
  if (
    options.reference.length > 40 ||
    options.timeZone.length > 100 ||
    !options.hashSeed ||
    options.hashSeed.length > 128 ||
    !Number.isInteger(options.count) ||
    options.count < 1 ||
    options.count > 20
  )
    throw new CronToolError("invalid_options");
  let reference: number, end: number;
  try {
    if (
      !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:[0-5]\d(?:\.\d{1,3})?(?:Z|[+-]\d{2}:\d{2})$/.test(
        options.reference,
      )
    )
      throw Error();
    const instant = Temporal.Instant.from(options.reference);
    reference = instant.epochMilliseconds;
    const year = instant.toZonedDateTimeISO("UTC").year;
    if (year < 1 || year > 9999) throw Error();
    new Intl.DateTimeFormat("en", { timeZone: options.timeZone });
    end = Math.min(reference + 366 * 8 * 86400000, 253402300799999);
  } catch {
    throw new CronToolError("invalid_options");
  }
  let parsed: ReturnType<typeof CronExpressionParser.parse>;
  try {
    parsed = CronExpressionParser.parse(expression, {
      currentDate: reference,
      endDate: end,
      tz: options.timeZone,
      hashSeed: options.hashSeed,
      strict: false,
    });
  } catch {
    throw new CronToolError("invalid_expression");
  }
  const resolved = parsed.stringify(
      tokens.length === 6 || expression.startsWith("@"),
    ),
    fields = resolved.split(" ").map((value: string, i: number) => {
      const names =
        resolved.split(" ").length === 6
          ? ["second", ...FIELD_NAMES]
          : FIELD_NAMES;
      // biome-ignore lint/style/noNonNullAssertion: validated fixed-width index or lookup invariant
      const id = names[i]!;
      return {
        id,
        value,
        range:
          id === "second"
            ? "0–59"
            : id === "dayOfWeek"
              ? "0–7 / SUN–SAT"
              : id === "month"
                ? "1–12 / JAN–DEC"
                : FIELD_LIMITS[id as FieldName].join("–"),
      };
    });
  const runs: {
    iso: string;
    local: string;
    offset: string;
    unixMilliseconds: string;
    inSeconds: string;
  }[] = [];
  for (let i = 0; i < options.count; i++) {
    try {
      const date = parsed.next().toDate(),
        ms = BigInt(date.getTime()),
        s = snapshot(ms, options.timeZone);
      runs.push({
        iso: s.iso8601,
        local: s.dateTime,
        offset: s.offset,
        unixMilliseconds: s.unixMilliseconds,
        inSeconds: ((ms - BigInt(reference)) / 1000n).toString(),
      });
    } catch (e) {
      if (
        e instanceof Error &&
        e.message.includes("Out of the time span range")
      )
        break;
      throw new CronToolError("iteration_failed");
    }
  }
  return {
    expression,
    resolved,
    fields,
    runs,
    timeZone: options.timeZone,
    reference: new Date(reference).toISOString(),
    horizon: new Date(end).toISOString(),
    complete: runs.length === options.count,
    hashSeed: options.hashSeed,
  };
}
