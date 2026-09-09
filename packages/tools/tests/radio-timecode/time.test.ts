import { describe, expect, it } from "vitest";
import {
  getDayOfYear,
  getDstStatusForUtcDay,
  getTimeParts,
  getTimeZoneOffsetMinutes,
  isDstAt,
  isLeapYear,
  willOffsetChangeWithinHour,
} from "../../src/radio-timecode/time";

describe("radio timecode calendar", () => {
  it("rejects invalid dates and zones instead of substituting zero fields", () => {
    for (const read of [getTimeParts, getTimeZoneOffsetMinutes]) {
      expect(() => read(new Date(NaN), "UTC")).toThrow(RangeError);
      expect(() => read(new Date(0), "Not/A_Zone")).toThrow(RangeError);
    }
    expect(
      getTimeParts(new Date("2024-01-01T00:00:00Z"), "Asia/Kathmandu"),
    ).toMatchObject({
      year: 2024,
      month: 1,
      day: 1,
      hour: 5,
      minute: 45,
      second: 0,
      offsetMinutes: 345,
    });
  });

  it("rejects invalid calendar values before accumulating month lengths", () => {
    for (const [year, month, day] of [
      [NaN, 1, 1],
      [Infinity, 1, 1],
      [Number.MAX_SAFE_INTEGER + 1, 1, 1],
      [2024, NaN, 1],
      [2024, Infinity, 1],
      [2024, 0, 1],
      [2024, 13, 1],
      [2024, 1.5, 1],
      [2024, 1, NaN],
      [2024, 1, Infinity],
      [2024, 1, 0],
      [2024, 1, 1.5],
      [2024, 1, 32],
      [2024, 4, 31],
      [2023, 2, 29],
    ])
      expect(() => getDayOfYear(year, month, day)).toThrow(
        new RangeError("Invalid calendar date"),
      );
    expect(getDayOfYear(0, 2, 29)).toBe(60);
    expect(getDayOfYear(-4, 2, 29)).toBe(60);
    expect(getDayOfYear(2024, 12, 31)).toBe(366);
  });

  it("handles Gregorian leap-year rules and day-of-year boundaries", () => {
    expect(isLeapYear(2024)).toBe(true);
    expect(isLeapYear(2100)).toBe(false);
    expect(isLeapYear(2000)).toBe(true);
    expect(getDayOfYear(2024, 2, 29)).toBe(60);
    expect(getDayOfYear(2023, 12, 31)).toBe(365);
    expect(getDayOfYear(2024, 12, 31)).toBe(366);
  });

  it("extracts local fields and offsets without depending on the host timezone", () => {
    const instant = new Date("2026-09-05T00:34:45Z");
    expect(getTimeParts(instant, "Asia/Shanghai")).toMatchObject({
      year: 2026,
      month: 9,
      day: 5,
      hour: 8,
      minute: 34,
      second: 45,
      weekday: 6,
      dayOfYear: 248,
      offsetMinutes: 480,
      isDst: false,
    });
    expect(getTimeZoneOffsetMinutes(instant, "UTC")).toBe(0);
  });

  it("detects real European DST transitions", () => {
    const beforeSpringTransition = new Date("2026-03-29T00:59:00Z");
    const afterSpringTransition = new Date("2026-03-29T01:00:00Z");
    const beforeAutumnTransition = new Date("2026-10-25T00:59:00Z");
    const afterAutumnTransition = new Date("2026-10-25T01:00:00Z");

    expect(isDstAt(beforeSpringTransition, "Europe/Berlin")).toBe(false);
    expect(isDstAt(afterSpringTransition, "Europe/Berlin")).toBe(true);
    expect(
      willOffsetChangeWithinHour(beforeSpringTransition, "Europe/Berlin"),
    ).toBe(true);
    expect(
      willOffsetChangeWithinHour(afterSpringTransition, "Europe/Berlin"),
    ).toBe(false);
    expect(isDstAt(beforeAutumnTransition, "Europe/Berlin")).toBe(true);
    expect(isDstAt(afterAutumnTransition, "Europe/Berlin")).toBe(false);
    expect(
      willOffsetChangeWithinHour(beforeAutumnTransition, "Europe/Berlin"),
    ).toBe(true);
    expect(
      getDstStatusForUtcDay(beforeSpringTransition, "Europe/Berlin"),
    ).toEqual({
      start: false,
      end: true,
    });
  });
});

it("does not remap years before 100 into the twentieth century", () => {
  for (const [iso, weekday] of [
    ["0001-01-01T00:00:00Z", 1],
    ["0099-01-01T00:00:00Z", 4],
  ] as const) {
    const date = new Date(iso);
    expect(getTimeZoneOffsetMinutes(date, "UTC")).toBe(0);
    expect(getTimeParts(date, "UTC")).toMatchObject({
      year: date.getUTCFullYear(),
      weekday,
      isDst: false,
      offsetMinutes: 0,
    });
    expect(getDstStatusForUtcDay(date, "UTC")).toEqual({
      start: false,
      end: false,
    });
  }
});

it.each(["0000-03-01T00:00:00Z", "-000001-01-01T00:00:00Z"])(
  "preserves astronomical years and UTC offsets for %s",
  (iso) => {
    const date = new Date(iso);
    const result = getTimeParts(date, "UTC");
    expect(result.year).toBe(date.getUTCFullYear());
    expect(result.weekday).toBe(date.getUTCDay());
    expect(result.offsetMinutes).toBe(0);
    expect(result.isDst).toBe(false);
    expect(result.dayOfYear).toBe(date.getUTCFullYear() === 0 ? 61 : 1);
  },
);
