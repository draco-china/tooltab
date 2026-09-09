import { afterEach, expect, it, vi } from "vitest";
import {
  generateNumbers,
  randomDefaults,
  randomPresets,
  randomRange,
  RandomNumberError,
} from "../../src/number/random";

afterEach(() => vi.restoreAllMocks());

it("provides reusable defaults and presets", () => {
  expect(randomDefaults).toMatchObject({ min: "1", max: "100", count: 1 });
  expect(randomPresets.dice.max).toBe("6");
  expect(randomPresets.lotto).toMatchObject({
    max: "49",
    count: 6,
    allowRepeat: false,
  });
});

it("uses exact signed grid bounds without float rounding", () => {
  expect(
    randomRange({
      ...randomDefaults,
      min: "0.29",
      max: "0.29",
      numberType: "decimal",
    }),
  ).toMatchObject({ min: 29n, max: 29n, size: 1n, places: 2 });
  expect(
    generateNumbers({
      ...randomDefaults,
      min: "-0.009",
      max: "0.009",
      numberType: "decimal",
    }).values,
  ).toEqual(["0.00"]);
  expect(
    randomRange({
      ...randomDefaults,
      min: "-1.009",
      max: "-0.991",
      numberType: "decimal",
    }),
  ).toMatchObject({ min: -100n, max: -100n });
  expect(
    generateNumbers({
      ...randomDefaults,
      min: "9007199254740993",
      max: "9007199254740993",
    }).values,
  ).toEqual(["9007199254740993"]);
  expect(
    generateNumbers({ ...randomDefaults, min: "1e100", max: "1e100" })
      .values[0],
  ).toBe(`1${"0".repeat(100)}`);
});

it("handles exponent, negative, integer, and decimal formatting", () => {
  expect(
    randomRange({
      ...randomDefaults,
      min: ".1e1",
      max: ".1e1",
      numberType: "decimal",
    }).min,
  ).toBe(100n);
  expect(
    generateNumbers({
      ...randomDefaults,
      min: "-1.2",
      max: "-1.2",
      numberType: "decimal",
      decimalPlaces: 1,
    }).values,
  ).toEqual(["-1.2"]);
  expect(
    generateNumbers({
      ...randomDefaults,
      min: "-0.1",
      max: "-0.1",
      numberType: "decimal",
      decimalPlaces: 2,
    }).values,
  ).toEqual(["-0.10"]);
  expect(
    randomRange({
      ...randomDefaults,
      min: "1.0",
      max: "1.0",
      numberType: "integer",
    }).min,
  ).toBe(1n);
});

it("rejects invalid options, ranges, and insufficient unique values", () => {
  for (const min of ["NaN", "Infinity", "1e999", "", "0x10"])
    expect(() => randomRange({ ...randomDefaults, min })).toThrow(
      RandomNumberError,
    );
  expect(() =>
    randomRange({ ...randomDefaults, min: `1${"0".repeat(400)}0` }),
  ).toThrow("invalid_range");
  expect(() => randomRange({ ...randomDefaults, min: "2", max: "1" })).toThrow(
    "invalid_range",
  );
  expect(() =>
    randomRange({
      ...randomDefaults,
      min: "0.291",
      max: "0.299",
      numberType: "decimal",
    }),
  ).toThrow("invalid_range");
  expect(() =>
    randomRange({
      ...randomDefaults,
      min: "1",
      max: "1",
      count: 2,
      allowRepeat: false,
    }),
  ).toThrow("insufficient_values");
  for (const options of [
    { count: 0 },
    { count: 101 },
    { count: 1.2 },
    { decimalPlaces: -1 },
    { decimalPlaces: 7 },
    { numberType: "other" as "integer" },
    { allowRepeat: "yes" as unknown as boolean },
  ])
    expect(() => randomRange({ ...randomDefaults, ...options })).toThrow(
      "invalid_options",
    );
});

it("rejects modulo bias and retries out-of-range bytes", () => {
  let calls = 0;
  vi.spyOn(globalThis.crypto, "getRandomValues").mockImplementation((bytes) => {
    (bytes as Uint8Array).fill(calls++ === 0 ? 255 : 0);
    return bytes;
  });
  expect(
    generateNumbers({ ...randomDefaults, min: "10", max: "12" }).values,
  ).toEqual(["10"]);
  expect(calls).toBe(2);
});

it("samples a complete no-repeat range and preserves every value", () => {
  vi.spyOn(globalThis.crypto, "getRandomValues").mockImplementation((bytes) => {
    (bytes as Uint8Array).fill(0);
    return bytes;
  });
  const result = generateNumbers({
    ...randomDefaults,
    min: "-50",
    max: "49",
    count: 100,
    allowRepeat: false,
  });
  expect(new Set(result.values).size).toBe(100);
  expect(result.values.map(Number).sort((a, b) => a - b)).toEqual(
    Array.from({ length: 100 }, (_, i) => i - 50),
  );
  expect(result.output.split("\n")).toEqual(result.values);
  expect(result.availableValues).toBe("100");
});

it("fails explicitly when randomness is unavailable or exhausted", () => {
  vi.spyOn(globalThis.crypto, "getRandomValues").mockImplementation(() => {
    throw Error("unavailable");
  });
  expect(() => generateNumbers(randomDefaults)).toThrow("random_unavailable");
  vi.restoreAllMocks();
  const draw = vi
    .spyOn(globalThis.crypto, "getRandomValues")
    .mockImplementation((bytes) => {
      (bytes as Uint8Array).fill(255);
      return bytes;
    });
  expect(() =>
    generateNumbers({ ...randomDefaults, min: "0", max: "2" }),
  ).toThrow("random_unavailable");
  expect(draw).toHaveBeenCalledTimes(128);
});
