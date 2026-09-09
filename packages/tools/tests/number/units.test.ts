import { expect, it } from "vitest";
import {
  CATEGORIES,
  CATEGORY_IDS,
  convertUnit,
  formatUnitNumber,
  parseUnitNumber,
  UnitConverterError,
} from "../../src/number/units";

it("covers all categories and strict numeric failures", () => {
  for (const category of CATEGORY_IDS) {
    const pair = CATEGORIES[category];
    expect(
      convertUnit({
        category,
        value: "1",
        from: pair.baseUnitId,
        to: pair.baseUnitId,
      }).raw,
    ).toBe(1);
  }
  for (const value of ["", " ", "x", "1,23", "1e999", "1".repeat(129)])
    expect(() => parseUnitNumber(value)).toThrow(UnitConverterError);
  expect(formatUnitNumber(0, "4")).toBe("0");
  expect(formatUnitNumber(-0, "max")).toBe("0");
  expect(() => formatUnitNumber(Infinity, "max")).toThrow("out_of_range");
  expect(() =>
    convertUnit({ category: "length", value: "1", from: "bad", to: "meter" }),
  ).toThrow("invalid_unit");
  for (const value of ["1.2.3", "1,234,56.7", "1e-999", "+", "-."])
    expect(() => parseUnitNumber(value, "en-US")).toThrow("invalid_value");
  expect(parseUnitNumber("+١٬٢٣٤٫٥", "ar-u-nu-arab")).toBe(1234.5);
  expect(() => parseUnitNumber("1,23,456", "en-US")).toThrow("invalid_value");
});

it("uses Intl fallbacks when a locale omits number syntax parts", () => {
  const original = Intl.NumberFormat;
  class FakeNumberFormat {
    constructor(private readonly options: Intl.NumberFormatOptions) {}

    format(value: number) {
      return String(value);
    }
    formatToParts(value: number) {
      return value === 1234567890123 || this.options.maximumFractionDigits === 0
        ? []
        : [{ type: "integer", value: "1" }];
    }
  }
  Object.defineProperty(Intl, "NumberFormat", {
    configurable: true,
    value: FakeNumberFormat,
  });
  try {
    expect(parseUnitNumber("+1.5", "x-fallback")).toBe(1.5);
    expect(formatUnitNumber(1234.5, "6", "x-fallback")).toBe("1234.5");
  } finally {
    Object.defineProperty(Intl, "NumberFormat", {
      configurable: true,
      value: original,
    });
  }
});

it("keeps the fixed upstream 8-category 75-unit surface", () => {
  expect(CATEGORY_IDS).toHaveLength(8);
  expect(
    CATEGORY_IDS.reduce(
      (sum, category) => sum + CATEGORIES[category].units.length,
      0,
    ),
  ).toBe(75);
  expect(CATEGORIES.digital.units.map((unit) => unit.id)).toContain("pebibyte");
  expect(CATEGORIES.volume.units.map((unit) => unit.id)).toContain(
    "gallonImperial",
  );
});

it("converts exact standard factors and affine temperature offsets", () => {
  expect(
    convertUnit({
      category: "length",
      value: "1",
      from: "mile",
      to: "kilometer",
    }).raw,
  ).toBe(1.609344);
  expect(
    convertUnit({
      category: "temperature",
      value: "-40",
      from: "celsius",
      to: "fahrenheit",
    }).formatted,
  ).toBe("-40");
  expect(
    convertUnit({
      category: "temperature",
      value: "0",
      from: "celsius",
      to: "kelvin",
    }).raw,
  ).toBe(273.15);
  expect(
    convertUnit({
      category: "temperature",
      value: "273.15",
      from: "kelvin",
      to: "celsius",
    }).raw,
  ).toBe(0);
  expect(
    convertUnit({
      category: "digital",
      value: "1",
      from: "mebibyte",
      to: "kilobyte",
      precision: "max",
    }).raw,
  ).toBe(1048.576);
});

it("parses localized grouping without guessing the wrong separator", () => {
  expect(parseUnitNumber("1,234.5", "en-US")).toBe(1234.5);
  expect(parseUnitNumber(".5", "en-US")).toBe(0.5);
  expect(parseUnitNumber("1.234,5", "de-DE")).toBe(1234.5);
  expect(formatUnitNumber(1234.5, "max", "de-DE")).toBe("1234,5");
  expect(() => parseUnitNumber("12,34.5", "en-US")).toThrow("invalid_value");
  expect(() => parseUnitNumber("1e-999", "en-US")).toThrow("invalid_value");
});

it("keeps a finite selected result when another all-units result overflows", () => {
  const result = convertUnit({
    category: "length",
    value: "1e300",
    from: "kilometer",
    to: "kilometer",
  });
  expect(result.raw).toBe(1e300);
  expect(
    result.conversions.find((item) => item.id === "nanometer"),
  ).toMatchObject({
    raw: null,
    formatted: "",
  });
});

it("returns all same-category conversions and rejects mismatched units", () => {
  const result = convertUnit({
    category: "volume",
    value: "1",
    from: "liter",
    to: "gallonUs",
    precision: "10",
  });
  expect(result.conversions).toHaveLength(CATEGORIES.volume.units.length);
  expect(result.formatted).toBe("0.2641720524");
  expect(() =>
    convertUnit({
      category: "length",
      value: "1",
      from: "meter",
      to: "kilogram",
    }),
  ).toThrow(UnitConverterError);
});
