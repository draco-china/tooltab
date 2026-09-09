import { expect, it } from "vitest";
import {
  buildExpression,
  CronToolError,
  defaultForm,
  formFromPreset,
  inspectCron,
  normalizeCronExpression,
  PRESETS,
} from "../../src/time/cron";

const options = {
  reference: "2024-01-01T00:00:00.000Z",
  timeZone: "UTC",
  count: 3,
  hashSeed: "seed",
};

it("normalizes five/six-field and preset expressions", () => {
  expect(normalizeCronExpression("  */5   * * * *  ")).toBe("*/5 * * * *");
  expect(normalizeCronExpression("@daily")).toBe("@daily");
  expect(() => normalizeCronExpression("")).toThrow("invalid_expression");
  expect(() => normalizeCronExpression("* * *")).toThrow("invalid_expression");
  expect(() => normalizeCronExpression("x".repeat(513))).toThrow(
    "invalid_expression",
  );
});

it("builds every field mode and rejects invalid field states", () => {
  const form = defaultForm();
  form.minute = { ...form.minute, mode: "interval", interval: 15 };
  form.hour = { ...form.hour, mode: "specific", specificValues: [3, 1, 3] };
  form.dayOfMonth = {
    ...form.dayOfMonth,
    mode: "range",
    rangeStart: 2,
    rangeEnd: 8,
  };
  expect(buildExpression(form)).toBe("*/15 1,3 2-8 * *");
  const invalid = defaultForm();
  invalid.minute = { ...invalid.minute, mode: "interval", interval: 0 };
  expect(() => buildExpression(invalid)).toThrow("invalid_field");
  invalid.minute = {
    ...invalid.minute,
    mode: "specific",
    specificValues: [99],
  };
  expect(() => buildExpression(invalid)).toThrow("invalid_field");
  invalid.minute = {
    ...invalid.minute,
    mode: "range",
    rangeStart: 8,
    rangeEnd: 2,
  };
  expect(() => buildExpression(invalid)).toThrow(CronToolError);
  invalid.minute = { ...invalid.minute, mode: "unknown" as never };
  expect(() => buildExpression(invalid)).toThrow("invalid_field");
  const emptySpecific = defaultForm();
  emptySpecific.minute = {
    ...emptySpecific.minute,
    mode: "specific",
    specificValues: [],
  };
  expect(buildExpression(emptySpecific)).toBe("* * * * *");
  const missing = defaultForm();
  delete (missing as Partial<typeof missing>).minute;
  expect(() => buildExpression(missing)).toThrow("invalid_field");
});

it("maps presets to forms and enumerates real execution times", () => {
  expect(formFromPreset("everyFiveMinutes").minute).toMatchObject({
    mode: "interval",
    interval: 5,
  });
  expect(formFromPreset("weekdaysMorning").dayOfWeek).toMatchObject({
    mode: "range",
    rangeStart: 1,
    rangeEnd: 5,
  });
  expect(() => formFromPreset("missing" as never)).toThrow("invalid_options");
  expect(Object.keys(PRESETS)).toHaveLength(11);
  const result = inspectCron("*/15 * * * *", options);
  expect(result).toMatchObject({
    expression: "*/15 * * * *",
    resolved: "*/15 * * * *",
    timeZone: "UTC",
    reference: "2024-01-01T00:00:00.000Z",
    complete: true,
    hashSeed: "seed",
  });
  expect(result.runs.map((run) => run.iso)).toEqual([
    "2024-01-01T00:15:00.000Z",
    "2024-01-01T00:30:00.000Z",
    "2024-01-01T00:45:00.000Z",
  ]);
  expect(result.fields).toHaveLength(5);
});

it("supports six-field seconds, hashed expressions, and DST zones", () => {
  const seconds = inspectCron("*/30 * * * * *", { ...options, count: 2 });
  expect(seconds.fields[0]).toMatchObject({
    id: "second",
    value: "0,30",
    range: "0–59",
  });
  expect(seconds.runs).toHaveLength(2);
  const dst = inspectCron("0 30 2 * * *", {
    ...options,
    timeZone: "America/New_York",
    reference: "2024-03-09T00:00:00.000Z",
    count: 2,
  });
  expect(dst.runs).toHaveLength(2);
  expect(() => inspectCron("H * * * *", options)).not.toThrow();
});

it("rejects invalid options, expressions, references, and platform zones", () => {
  expect(() => inspectCron("* * * * *", { ...options, count: 0 })).toThrow(
    "invalid_options",
  );
  expect(() => inspectCron("* * * * *", { ...options, hashSeed: "" })).toThrow(
    "invalid_options",
  );
  expect(() =>
    inspectCron("* * * * *", { ...options, reference: "bad" }),
  ).toThrow("invalid_options");
  expect(() => inspectCron("not-a-cron", options)).toThrow(
    "invalid_expression",
  );
  expect(() => inspectCron("60 * * * *", options)).toThrow(
    "invalid_expression",
  );
  expect(() =>
    inspectCron("* * * * *", {
      ...options,
      reference: "0000-01-01T00:00:00.000Z",
    }),
  ).toThrow("invalid_options");
  expect(() =>
    inspectCron("* * * * *", { ...options, timeZone: "Mars/Phobos" }),
  ).toThrow("invalid_options");
  const original = Intl.DateTimeFormat;
  Object.defineProperty(Intl, "DateTimeFormat", {
    configurable: true,
    value: () => {
      throw Error("unsupported");
    },
  });
  try {
    expect(() => inspectCron("* * * * *", options)).toThrow("invalid_options");
  } finally {
    Object.defineProperty(Intl, "DateTimeFormat", {
      configurable: true,
      value: original,
    });
  }
  let calls = 0;
  function FailingAfterValidation(this: unknown, ...args: unknown[]) {
    calls += 1;
    if (calls > 1) throw Error("second construction failed");
    return Reflect.construct(original, args);
  }
  Object.defineProperty(Intl, "DateTimeFormat", {
    configurable: true,
    value: FailingAfterValidation,
  });
  try {
    expect(() => inspectCron("* * * * *", options)).toThrow("iteration_failed");
  } finally {
    Object.defineProperty(Intl, "DateTimeFormat", {
      configurable: true,
      value: original,
    });
  }
  expect(
    inspectCron("* * * * *", {
      ...options,
      reference: "9999-12-31T23:59:00.000Z",
      count: 1,
    }).complete,
  ).toBe(false);
});

it("resolves the spring gap and autumn fold without duplicating daily runs", () => {
  const spring = inspectCron("30 2 * * *", {
    ...options,
    reference: "2024-03-09T00:00:00Z",
    timeZone: "America/New_York",
  });
  expect(spring.runs.map((run) => run.iso)).toEqual([
    "2024-03-09T07:30:00.000Z",
    "2024-03-10T07:30:00.000Z",
    "2024-03-11T06:30:00.000Z",
  ]);
  const autumn = inspectCron("30 1 * * *", {
    ...options,
    reference: "2024-11-02T00:00:00Z",
    timeZone: "America/New_York",
  });
  expect(autumn.runs.map((run) => run.iso)).toEqual([
    "2024-11-02T05:30:00.000Z",
    "2024-11-03T05:30:00.000Z",
    "2024-11-04T06:30:00.000Z",
  ]);
});
