import { expect, it, vi } from "vitest";
import {
  calculateDuration,
  convertZone,
  durationIso,
  durationParts,
  localDateTime,
  parseDuration,
  resolveTime,
  snapshot,
  timeDifference,
  zones,
} from "../../src/time/date-time";

it("lists zones and converts IANA timestamps at millisecond precision", () => {
  expect(zones()).toContain("UTC");
  expect(resolveTime("2024-01-01", "UTC", undefined)).toBeTruthy();
  expect(
    convertZone("2024-01-01 00:00:00.006", "Asia/Shanghai", "UTC").to,
  ).toMatchObject({
    dateTime: "2023-12-31 16:00:00.006",
    unixMilliseconds: "1704038400006",
    offset: "+00:00",
  });
  expect(snapshot(-1n, "UTC")).toMatchObject({
    unixSeconds: "-1",
    unixMilliseconds: "-1",
  });
});

it("handles DST gaps, folds, and explicit disambiguation policies", () => {
  for (const input of ["2024-03-10 02:30", "2024-11-03 01:30"])
    expect(() => convertZone(input, "America/New_York", "UTC")).toThrow(
      "ambiguous_date",
    );
  expect(
    convertZone("2024-03-10 02:30", "America/New_York", "UTC", "earlier"),
  ).toMatchObject({
    adjusted: true,
    to: { dateTime: "2024-03-10 06:30:00.000" },
  });
  expect(
    convertZone("2024-03-10 02:30", "America/New_York", "UTC", "compatible").to
      .dateTime,
  ).toBe("2024-03-10 07:30:00.000");
  expect(
    convertZone("2024-11-03 01:30", "America/New_York", "UTC", "earlier").to
      .dateTime,
  ).toBe("2024-11-03 05:30:00.000");
  expect(
    convertZone("2024-11-03 01:30", "America/New_York", "UTC", "later").to
      .dateTime,
  ).toBe("2024-11-03 06:30:00.000");
  expect(
    convertZone("2024-10-06 02:15", "Australia/Lord_Howe", "UTC", "later").from
      .dateTime,
  ).toBe("2024-10-06 02:45:00.000");
  expect(() => resolveTime("2024-01-01", "UTC", "bad" as never)).toThrow(
    "invalid_date",
  );
});

it("rejects malformed local dates and zones", () => {
  for (const value of [
    "2024-02-30",
    "0000-01-01",
    "2024-01-01 00:00:60",
    "2024-01-01 00:00:00.0001",
    "2024/01/01",
    "2024-01-01T24:00",
  ])
    expect(() => localDateTime(value)).toThrow("invalid_date");
  expect(() => localDateTime("x".repeat(41))).toThrow("invalid_date");
  expect(() => convertZone("2024-01-01", "Mars/Phobos", "UTC")).toThrow(
    "invalid_zone",
  );
  expect(() => convertZone("2024-01-01", " UTC", "UTC")).toThrow(
    "invalid_zone",
  );
  expect(() => snapshot(10n ** 30n, "UTC")).toThrow("out_of_range");
});

it("falls back to a safe zone list when Intl zone enumeration fails", () => {
  const original = Intl.supportedValuesOf;
  Object.defineProperty(Intl, "supportedValuesOf", {
    configurable: true,
    value: () => {
      throw Error("unsupported");
    },
  });
  try {
    expect(zones()).toEqual(
      expect.arrayContaining(["UTC", "Asia/Shanghai", "America/New_York"]),
    );
  } finally {
    Object.defineProperty(Intl, "supportedValuesOf", {
      configurable: true,
      value: original,
    });
  }
});

it("formats signed durations and exact differences", () => {
  expect(durationParts(-90061001n)).toEqual({
    days: "1",
    hours: "1",
    minutes: "1",
    seconds: "1",
    milliseconds: "1",
  });
  expect(durationIso(0n)).toBe("PT0S");
  expect(durationIso(90061001n)).toBe("P1DT1H1M1.001S");
  expect(durationIso(1000n)).toBe("PT1S");
  expect(durationIso(-1n)).toBe("-PT0.001S");
  expect(
    timeDifference(
      "2024-03-10 00:00",
      "America/New_York",
      "2024-03-11 00:00",
      "America/New_York",
    ),
  ).toMatchObject({
    totalHours: "23",
    isoDuration: "PT23H",
    totalDays: "0.958333",
  });
  expect(
    timeDifference("1970-01-01 00:00:00.001", "UTC", "1970-01-01", "UTC"),
  ).toMatchObject({
    totalMilliseconds: "-1",
    totalSeconds: "-0.001",
    totalMinutes: "-0.000017",
    isoDuration: "-PT0.001S",
  });
});

it("parses ISO and structured durations with normalization and limits", () => {
  expect(parseDuration("+p1dt2h3m4,005s")).toBe(93784005n);
  expect(
    parseDuration({
      days: "0",
      hours: "27",
      minutes: "61",
      seconds: "0",
      milliseconds: "1500",
    }),
  ).toBe(100861500n);
  for (const value of [
    "P1M",
    "P1W",
    "-PT1S",
    "P",
    "PT0.0001S",
    "x".repeat(201),
  ])
    expect(() => parseDuration(value)).toThrow("invalid_duration");
  expect(() =>
    parseDuration({
      days: "x",
      hours: "0",
      minutes: "0",
      seconds: "0",
      milliseconds: "0",
    }),
  ).toThrow("invalid_duration");
  expect(() =>
    parseDuration({
      days: "9".repeat(16),
      hours: "0",
      minutes: "0",
      seconds: "0",
      milliseconds: "0",
    }),
  ).toThrow("out_of_range");
});

it("calculates duration additions and boundary nulls", () => {
  expect(
    calculateDuration("2024-03-09 12:00", "America/New_York", "P1D").add
      ?.dateTime,
  ).toBe("2024-03-10 13:00:00.000");
  expect(
    calculateDuration("2026-01-01", "UTC", {
      days: "0",
      hours: "27",
      minutes: "61",
      seconds: "0",
      milliseconds: "1500",
    }).duration,
  ).toBe("P1DT4H1M1.500S");
  expect(calculateDuration("0001-01-01", "UTC", "P1D")).toMatchObject({
    add: { dateTime: "0001-01-02 00:00:00.000" },
    subtract: null,
  });
  expect(calculateDuration("9999-12-31", "UTC", "P1D").add).toBeNull();
});

it("does not turn a later Intl time-zone failure into a missing date", () => {
  const Original = Intl.DateTimeFormat;
  let validations = 0;
  const spy = vi
    .spyOn(Intl, "DateTimeFormat")
    .mockImplementation(function MockDateTimeFormat(
      ...args: ConstructorParameters<typeof Intl.DateTimeFormat>
    ) {
      if (args[0] === "en" && ++validations === 2)
        throw new Error("Intl unavailable");
      return new Original(...args);
    });
  try {
    expect(() => calculateDuration("2024-01-01", "UTC", "P1D")).toThrow(
      "invalid_zone",
    );
    expect(validations).toBe(2);
  } finally {
    spy.mockRestore();
  }
});
