import { expect, it } from "vitest";
import { DateToolError, businessDays } from "../../src/time/business-days";

const weekdays = { weekendDays: [0, 6], holidays: "" };

it("counts weekdays, shifts both directions, and handles holidays", () => {
  expect(
    businessDays("2026-09-07", "2026-09-11", "2026-09-07", 5, weekdays),
  ).toMatchObject({
    businessDays: 5,
    totalDays: 5,
    weekendDays: 0,
    holidayDays: 0,
    isReversed: false,
    add: "2026-09-14",
    subtract: "2026-08-31",
    noWorkingDays: false,
  });
  expect(
    businessDays("2026-09-07", "2026-09-11", "2026-09-07", 1, {
      weekendDays: [0, 6],
      holidays: "2026-09-08\n2026-09-09\n2026-09-08\n",
    }),
  ).toMatchObject({ holidayDays: 2, businessDays: 3 });
});

it("respects endpoint and start-inclusion options and reversed ranges", () => {
  expect(
    businessDays("2026-09-07", "2026-09-07", "2026-09-07", 0, weekdays, false),
  ).toMatchObject({ totalDays: 0, businessDays: 0 });
  expect(
    businessDays(
      "2026-09-11",
      "2026-09-07",
      "2026-09-07",
      1,
      weekdays,
      true,
      true,
    ),
  ).toMatchObject({
    isReversed: true,
    add: "2026-09-07",
    subtract: "2026-09-07",
  });
  expect(
    businessDays("2026-09-07", "2026-09-07", "2026-09-07", 0, weekdays),
  ).toMatchObject({ add: "2026-09-07", subtract: "2026-09-07" });
});

it("returns no shift when every day is weekend or the offset exceeds range", () => {
  const noWorking = businessDays("2026-09-07", "2026-09-07", "2026-09-07", 1, {
    weekendDays: [0, 1, 2, 3, 4, 5, 6],
    holidays: "",
  });
  expect(noWorking).toMatchObject({
    noWorkingDays: true,
    add: null,
    subtract: null,
  });
  const tooFar = businessDays(
    "9999-12-31",
    "9999-12-31",
    "9999-12-31",
    1,
    weekdays,
  );
  expect(tooFar.add).toBeNull();
  expect(tooFar.subtract).toBe("9999-12-30");
  expect(
    businessDays(
      "9999-12-31",
      "9999-12-31",
      "9999-12-31",
      2,
      weekdays,
      true,
      true,
    ).add,
  ).toBeNull();
  expect(
    businessDays("2026-09-07", "2026-09-07", "2026-09-07", 3, weekdays).add,
  ).toBe("2026-09-10");
});

it("collects malformed holidays while ignoring blank lines", () => {
  const result = businessDays("2026-09-07", "2026-09-11", "2026-09-07", 1, {
    weekendDays: [0, 6],
    holidays: "\nnot-a-date\n2026-09-09\r\n",
  });
  expect(result.invalidHolidays).toEqual([{ line: 2, value: "not-a-date" }]);
  expect(result.holidayDays).toBe(1);
});

it("rejects invalid dates, ranges, offsets, and rules", () => {
  expect(() =>
    businessDays("2026-02-30", "2026-03-01", "2026-03-01", 0, weekdays),
  ).toThrow("invalid_date");
  expect(() =>
    businessDays("0000-01-01", "2026-03-01", "2026-03-01", 0, weekdays),
  ).toThrow(DateToolError);
  expect(() =>
    businessDays("2026-01-01", "2026-01-01", "2026-01-01", -1, weekdays),
  ).toThrow("out_of_range");
  expect(() =>
    businessDays("2026-01-01", "2026-01-01", "2026-01-01", 3652060, weekdays),
  ).toThrow("out_of_range");
  expect(() =>
    businessDays("2026-01-01", "2026-01-01", "2026-01-01", 0, {
      weekendDays: [7],
      holidays: "",
    }),
  ).toThrow("invalid_rules");
  expect(() =>
    businessDays("2026-01-01", "2026-01-01", "2026-01-01", 0, {
      weekendDays: [0, 0, 1, 2, 3, 4, 5, 6],
      holidays: "",
    }),
  ).toThrow("invalid_rules");
  expect(() =>
    businessDays("2026-01-01", "2026-01-01", "2026-01-01", 0, {
      weekendDays: [0],
      holidays: "x".repeat(1_000_001),
    }),
  ).toThrow("too_large");
  expect(() =>
    businessDays("2026-01-01", "2026-01-01", "2026-01-01", 0, {
      weekendDays: [0],
      holidays: `${"2026-01-01\n".repeat(10001)}`,
    }),
  ).toThrow("too_large");
});
