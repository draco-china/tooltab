import { describe, expect, it } from "vitest";
import {
  calendarDisplay,
  calendarTimestamp,
  formatTimestamp,
  relativeTimestamp,
  TIMESTAMP_UNITS,
  timestampResult,
  timestampValue,
} from "../../src/time/timestamp";

describe("timestamp values and formatting", () => {
  it.each([
    ["0", "seconds", "1970-01-01T00:00:00.000000000Z"],
    ["-1", "nanoseconds", "1969-12-31T23:59:59.999999999Z"],
    ["1700000000123456789", "nanoseconds", "2023-11-14T22:13:20.123456789Z"],
    ["1.23456789e0", "seconds", "1970-01-01T00:00:01.234567890Z"],
  ] as const)("converts %s %s exactly", (input, unit, iso) => {
    const parsed = timestampValue(input, unit);
    expect(timestampResult(parsed.nanoseconds).iso).toBe(iso);
    for (const target of TIMESTAMP_UNITS) {
      expect(
        timestampValue(formatTimestamp(parsed.nanoseconds, target), target)
          .nanoseconds,
      ).toBe(parsed.nanoseconds);
    }
  });

  it("supports every unit, auto detection, decimal precision, and negative values", () => {
    expect(timestampValue("123", "seconds")).toMatchObject({
      nanoseconds: 123_000_000_000n,
      effectiveUnit: "seconds",
    });
    expect(timestampValue("123456", "milliseconds").nanoseconds).toBe(
      123_456_000_000n,
    );
    expect(timestampValue("123456789", "nanoseconds").nanoseconds).toBe(
      123_456_789n,
    );
    expect(timestampValue("9999999999").effectiveUnit).toBe("seconds");
    expect(timestampValue("10000000000").effectiveUnit).toBe("milliseconds");
    expect(timestampValue("9999999999999").effectiveUnit).toBe("milliseconds");
    expect(timestampValue("10000000000000").effectiveUnit).toBe("nanoseconds");
    expect(timestampValue("-1.25", "seconds").nanoseconds).toBe(
      -1_250_000_000n,
    );
    expect(timestampValue("1.23456789e0", "seconds").digits).toBe(1);
    expect(formatTimestamp(-1_250_000_000n, "seconds")).toBe("-1.25");
  });

  it.each([
    "",
    "NaN",
    "Infinity",
    "0x10",
    "1_000",
    "1.0000000001",
    "1e999",
    "--1",
  ])("rejects invalid or sub-nanosecond timestamps %s", (input) => {
    expect(() => timestampValue(input, "seconds")).toThrow();
  });

  it("rejects values outside the supported nanosecond range", () => {
    expect(timestampResult(8_640_000_000_000_000_000_000n).iso).toBe(
      "+275760-09-13T00:00:00.000000000Z",
    );
    expect(() =>
      timestampValue("8640000000000000000001", "nanoseconds"),
    ).toThrow("out-of-range");
    expect(() => timestampResult(8_640_000_000_000_000_000_001n)).toThrow(
      "out-of-range",
    );
    expect(calendarDisplay(8_640_000_000_000_000_000_000n, "+14:00")).toBe("");
  });

  it("returns complete result fields with submillisecond precision and zones", () => {
    const result = timestampResult(1_234_567_890n, "+08:00");
    expect(result).toEqual({
      seconds: "1.23456789",
      milliseconds: "1234.56789",
      nanoseconds: "1234567890",
      iso: "1970-01-01T00:00:01.234567890Z",
      utc: "Thu, 01 Jan 1970 00:00:01 GMT",
      calendar: "1970-01-01T08:00:01.234",
      submillisecond: true,
    });
    expect(timestampResult(1_000_000n).submillisecond).toBe(false);
    expect(calendarDisplay(0n, "UTC")).toBe("1970-01-01T00:00:00.000");
    expect(calendarDisplay(0n, "local")).toMatch(
      /^[0-9]{4}-[0-9]{2}-[0-9]{2}T/,
    );
  });
});

describe("calendar timestamps", () => {
  it.each([
    "2023-02-29T12:00",
    "2024-02-30T12:00",
    "2024-13-01T00:00",
    "2024-01-01T24:00",
    "2024-01-01T00:00:60",
    "0000-01-01T00:00",
    "2024-01-01T00:00\n",
  ])("rejects calendar normalization %s", (input) => {
    expect(() => calendarTimestamp(input)).toThrow();
  });

  it("supports leap days, years below 100, optional seconds, and explicit offsets", () => {
    expect(timestampResult(calendarTimestamp("0099-01-01T00:00")).iso).toBe(
      "0099-01-01T00:00:00.000000000Z",
    );
    expect(
      timestampResult(calendarTimestamp("2024-02-29T08:00:00.001", "+08:00"))
        .iso,
    ).toBe("2024-02-29T00:00:00.001000000Z");
    expect(calendarTimestamp("1970-01-01T08:00", "+08:00")).toBe(0n);
    for (const zone of ["+08:00\n", "+14:01", "+15:00", "Europe/Paris"])
      expect(() => calendarTimestamp("2024-01-01T00:00", zone)).toThrow();
  });

  it("detects DST gaps and repeated local times using the real timezone runtime", () => {
    const previous = process.env.TZ;
    process.env.TZ = "America/New_York";
    try {
      expect(() => calendarTimestamp("2024-03-10T02:30", "local")).toThrow(
        "invalid-date",
      );
      expect(() => calendarTimestamp("2024-11-03T01:30", "local")).toThrow(
        "ambiguous-date",
      );
      expect(
        timestampResult(calendarTimestamp("2024-01-15T12:00", "local"), "local")
          .calendar,
      ).toBe("2024-01-15T12:00:00.000");
    } finally {
      if (previous === undefined) delete process.env.TZ;
      else process.env.TZ = previous;
    }
  });
});

describe("relative timestamps", () => {
  it.each([
    [60_000, "in 1 minute"],
    [-3_600_000, "1 hour ago"],
    [86_400_000, "tomorrow"],
    [-7 * 86_400_000, "last week"],
  ])("formats relative time (%s ms)", (difference, expected) => {
    expect(relativeTimestamp(BigInt(difference) * 1_000_000n, 0)).toBe(
      expected,
    );
  });

  it("supports locale output and chooses the smallest applicable unit", () => {
    expect(relativeTimestamp(90_000n * 1_000_000n, 0, "zh-CN")).toBe("2分钟后");
    expect(relativeTimestamp(500_000_000n, 0)).toBe("in 1 second");
  });
});

it("validates parser limits and both timestamp range edges", () => {
  expect(() => timestampValue("1".repeat(129))).toThrow("invalid-timestamp");
  expect(() => timestampValue("1", "unknown" as "seconds")).toThrow(
    "invalid-timestamp",
  );
  expect(() => timestampValue(`0.${"0".repeat(40)}1e-99`)).toThrow(
    "invalid-timestamp",
  );
  expect(timestampValue("1e1", "seconds").nanoseconds).toBe(10_000_000_000n);
  expect(() =>
    timestampValue("-8640000000000000000001", "nanoseconds"),
  ).toThrow("out-of-range");
  expect(() => timestampResult(-8_640_000_000_000_000_000_001n)).toThrow(
    "out-of-range",
  );
  expect(calendarDisplay(-8_640_000_000_000_000_000_000n)).toBe("");
  expect(calendarDisplay(253_402_300_800_000_000_000n)).toBe("");
  expect(() => calendarTimestamp("invalid")).toThrow("invalid-date");
  expect(() => calendarTimestamp("1970-01-01T00:00", "+01:60")).toThrow(
    "invalid-zone",
  );
  expect(calendarTimestamp("1969-12-31T23:00", "-01:00")).toBe(0n);
});

it("formats auto-detected input without changing the instant", () => {
  for (const ns of [
    0n,
    1n,
    -1n,
    1_000_000n,
    1_700_000_000_123_456_789n,
    9_999_999_999_999_999_999n,
    10_000_000_000_000_000_000n,
    -9_999_999_999_999_999_999n,
    -10_000_000_000_000_000_000n,
    8_640_000_000_000_000_000_000n,
    -8_640_000_000_000_000_000_000n,
  ]) {
    expect(timestampValue(formatTimestamp(ns, "auto")).nanoseconds).toBe(ns);
  }
  expect(formatTimestamp(1_000_000n, "auto")).toBe("0.001");
  expect(formatTimestamp(10_000_000_000_000_000_000n, "auto")).toBe(
    "10000000000000000000",
  );
});
