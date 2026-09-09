export const CATEGORY_IDS = [
  "length",
  "mass",
  "temperature",
  "area",
  "volume",
  "speed",
  "digital",
  "time",
] as const;

export type UnitCategoryId = (typeof CATEGORY_IDS)[number];
export type PrecisionOption = "4" | "6" | "10" | "max";
export type Unit = Readonly<{
  id: string;
  symbol: string;
  factor: number;
  offset?: number;
}>;
export type UnitCategory = Readonly<{
  id: UnitCategoryId;
  baseUnitId: string;
  units: readonly Unit[];
}>;

export const CATEGORIES: Readonly<Record<UnitCategoryId, UnitCategory>> = {
  length: {
    id: "length",
    baseUnitId: "meter",
    units: [
      { id: "kilometer", symbol: "km", factor: 1000 },
      { id: "meter", symbol: "m", factor: 1 },
      { id: "centimeter", symbol: "cm", factor: 0.01 },
      { id: "millimeter", symbol: "mm", factor: 0.001 },
      { id: "micrometer", symbol: "µm", factor: 1e-6 },
      { id: "nanometer", symbol: "nm", factor: 1e-9 },
      { id: "mile", symbol: "mi", factor: 1609.344 },
      { id: "yard", symbol: "yd", factor: 0.9144 },
      { id: "foot", symbol: "ft", factor: 0.3048 },
      { id: "inch", symbol: "in", factor: 0.0254 },
      { id: "nauticalMile", symbol: "nmi", factor: 1852 },
    ],
  },
  mass: {
    id: "mass",
    baseUnitId: "kilogram",
    units: [
      { id: "tonne", symbol: "t", factor: 1000 },
      { id: "kilogram", symbol: "kg", factor: 1 },
      { id: "gram", symbol: "g", factor: 0.001 },
      { id: "milligram", symbol: "mg", factor: 1e-6 },
      { id: "microgram", symbol: "µg", factor: 1e-9 },
      { id: "poundMass", symbol: "lb", factor: 0.45359237 },
      { id: "ounceMass", symbol: "oz", factor: 0.028349523125 },
      { id: "stone", symbol: "st", factor: 6.35029318 },
      { id: "shortTon", symbol: "ton", factor: 907.18474 },
      { id: "carat", symbol: "ct", factor: 0.0002 },
    ],
  },
  temperature: {
    id: "temperature",
    baseUnitId: "kelvin",
    units: [
      { id: "celsius", symbol: "°C", factor: 1, offset: 273.15 },
      { id: "fahrenheit", symbol: "°F", factor: 5 / 9, offset: 459.67 },
      { id: "kelvin", symbol: "K", factor: 1 },
      { id: "rankine", symbol: "°R", factor: 5 / 9 },
    ],
  },
  area: {
    id: "area",
    baseUnitId: "squareMeter",
    units: [
      { id: "squareKilometer", symbol: "km²", factor: 1e6 },
      { id: "squareMeter", symbol: "m²", factor: 1 },
      { id: "squareCentimeter", symbol: "cm²", factor: 1e-4 },
      { id: "squareMillimeter", symbol: "mm²", factor: 1e-6 },
      { id: "hectare", symbol: "ha", factor: 10000 },
      { id: "acre", symbol: "ac", factor: 4046.8564224 },
      { id: "squareMile", symbol: "mi²", factor: 2589988.110336 },
      { id: "squareYard", symbol: "yd²", factor: 0.83612736 },
      { id: "squareFoot", symbol: "ft²", factor: 0.09290304 },
      { id: "squareInch", symbol: "in²", factor: 0.00064516 },
    ],
  },
  volume: {
    id: "volume",
    baseUnitId: "cubicMeter",
    units: [
      { id: "cubicMeter", symbol: "m³", factor: 1 },
      { id: "liter", symbol: "L", factor: 0.001 },
      { id: "milliliter", symbol: "mL", factor: 1e-6 },
      { id: "cubicFoot", symbol: "ft³", factor: 0.028316846592 },
      { id: "cubicInch", symbol: "in³", factor: 1.6387064e-5 },
      { id: "gallonUs", symbol: "gal", factor: 0.003785411784 },
      { id: "quartUs", symbol: "qt", factor: 9.46352946e-4 },
      { id: "pintUs", symbol: "pt", factor: 4.73176473e-4 },
      { id: "cupUs", symbol: "cup", factor: 2.365882365e-4 },
      { id: "fluidOunceUs", symbol: "fl oz", factor: 2.95735295625e-5 },
      { id: "tablespoonUs", symbol: "tbsp", factor: 1.478676478125e-5 },
      { id: "teaspoonUs", symbol: "tsp", factor: 4.92892159375e-6 },
      { id: "gallonImperial", symbol: "gal (UK)", factor: 0.00454609 },
    ],
  },
  speed: {
    id: "speed",
    baseUnitId: "meterPerSecond",
    units: [
      { id: "meterPerSecond", symbol: "m/s", factor: 1 },
      { id: "kilometerPerHour", symbol: "km/h", factor: 1 / 3.6 },
      { id: "milePerHour", symbol: "mph", factor: 0.44704 },
      { id: "knot", symbol: "kn", factor: 1852 / 3600 },
      { id: "footPerSecond", symbol: "ft/s", factor: 0.3048 },
    ],
  },
  digital: {
    id: "digital",
    baseUnitId: "byte",
    units: [
      { id: "bit", symbol: "bit", factor: 0.125 },
      { id: "byte", symbol: "B", factor: 1 },
      { id: "kilobyte", symbol: "kB", factor: 1e3 },
      { id: "megabyte", symbol: "MB", factor: 1e6 },
      { id: "gigabyte", symbol: "GB", factor: 1e9 },
      { id: "terabyte", symbol: "TB", factor: 1e12 },
      { id: "petabyte", symbol: "PB", factor: 1e15 },
      { id: "kibibyte", symbol: "KiB", factor: 2 ** 10 },
      { id: "mebibyte", symbol: "MiB", factor: 2 ** 20 },
      { id: "gibibyte", symbol: "GiB", factor: 2 ** 30 },
      { id: "tebibyte", symbol: "TiB", factor: 2 ** 40 },
      { id: "pebibyte", symbol: "PiB", factor: 2 ** 50 },
    ],
  },
  time: {
    id: "time",
    baseUnitId: "second",
    units: [
      { id: "nanosecond", symbol: "ns", factor: 1e-9 },
      { id: "microsecond", symbol: "µs", factor: 1e-6 },
      { id: "millisecond", symbol: "ms", factor: 0.001 },
      { id: "second", symbol: "s", factor: 1 },
      { id: "minute", symbol: "min", factor: 60 },
      { id: "hour", symbol: "h", factor: 3600 },
      { id: "day", symbol: "d", factor: 86400 },
      { id: "week", symbol: "wk", factor: 604800 },
      { id: "month", symbol: "mo", factor: 2629746 },
      { id: "year", symbol: "yr", factor: 31556952 },
    ],
  },
};

export const DEFAULT_PAIRS: Readonly<
  Record<UnitCategoryId, Readonly<{ from: string; to: string }>>
> = {
  length: { from: "meter", to: "foot" },
  mass: { from: "kilogram", to: "poundMass" },
  temperature: { from: "celsius", to: "fahrenheit" },
  area: { from: "squareMeter", to: "squareFoot" },
  volume: { from: "liter", to: "gallonUs" },
  speed: { from: "kilometerPerHour", to: "milePerHour" },
  digital: { from: "megabyte", to: "mebibyte" },
  time: { from: "hour", to: "minute" },
};

export class UnitConverterError extends Error {
  constructor(
    public readonly code: "invalid_value" | "invalid_unit" | "out_of_range",
  ) {
    super(code);
  }
}

function findUnit(category: UnitCategory, id: string) {
  return category.units.find((unit) => unit.id === id);
}

function normalizeOffsetCancellation(
  value: number,
  scaled: number,
  offset: number,
) {
  if (!Number.isFinite(value) || offset === 0) return value;
  const tolerance =
    Math.max(Math.abs(scaled), Math.abs(offset)) * Number.EPSILON * 4;
  return Math.abs(value) <= tolerance ? 0 : value;
}

export function convertUnits(value: number, from: Unit, to: Unit) {
  if (from.id === to.id) return value;
  const targetOffset = to.offset ?? 0;
  const scaled = (value + (from.offset ?? 0)) * (from.factor / to.factor);
  return normalizeOffsetCancellation(
    scaled - targetOffset,
    scaled,
    targetOffset,
  );
}

const bidiControls = /[\u061c\u200e\u200f\u202a-\u202e\u2066-\u2069]/g;
const syntaxCache = new Map<
  string,
  {
    decimal: string;
    group: string;
    minus: string;
    plus: string;
    digits: readonly (readonly [string, string])[];
    primary: number;
    secondary: number;
  }
>();

function localeSyntax(locale: string) {
  const cached = syntaxCache.get(locale);
  if (cached) return cached;
  const plain = new Intl.NumberFormat(locale, { useGrouping: false });
  const grouped = new Intl.NumberFormat(locale, { maximumFractionDigits: 0 });
  const signed = new Intl.NumberFormat(locale, {
    signDisplay: "always",
    useGrouping: false,
  });
  const parts = grouped.formatToParts(1234567890123);
  const integerGroups = parts.filter((part) => part.type === "integer");
  const syntax = {
    decimal:
      plain.formatToParts(1.1).find((part) => part.type === "decimal")?.value ??
      ".",
    group: parts.find((part) => part.type === "group")?.value ?? ",",
    minus:
      signed.formatToParts(-1).find((part) => part.type === "minusSign")
        ?.value ?? "-",
    plus:
      signed.formatToParts(1).find((part) => part.type === "plusSign")?.value ??
      "+",
    digits: Array.from(
      { length: 10 },
      (_, n) =>
        [
          new Intl.NumberFormat(locale, { useGrouping: false }).format(n),
          String(n),
        ] as const,
    ).sort(([a], [b]) => b.length - a.length),
    primary: integerGroups.at(-1)?.value.length ?? 3,
    secondary: integerGroups.at(-2)?.value.length ?? 3,
  };
  syntaxCache.set(locale, syntax);
  return syntax;
}

export function parseUnitNumber(raw: string, locale = "en-US") {
  const trimmed = raw.trim();
  if (!trimmed || trimmed.length > 128)
    throw new UnitConverterError("invalid_value");
  if (/^[+-]?(?:\d+(?:\.\d*)?|\.\d+)[eE][+-]?\d+$/.test(trimmed)) {
    const value = Number(trimmed);
    if (
      !Number.isFinite(value) ||
      // biome-ignore lint/style/noNonNullAssertion: validated fixed-width index or lookup invariant
      (value === 0 && /[1-9]/.test(trimmed.split(/[eE]/)[0]!))
    )
      throw new UnitConverterError("invalid_value");
    return value;
  }
  let normalized = trimmed.replace(bidiControls, "");
  const syntax = localeSyntax(locale);
  for (const [glyph, digit] of syntax.digits)
    normalized = normalized.split(glyph).join(digit);
  normalized = normalized
    .split(syntax.minus)
    .join("-")
    .split(syntax.plus)
    .join("+");
  const sign = /^[+-]/.test(normalized) ? normalized[0] : "";
  if (sign) normalized = normalized.slice(1);
  const decimalParts = normalized.split(syntax.decimal);
  if (decimalParts.length > 2 || !/^\d*$/.test(decimalParts[1] ?? ""))
    throw new UnitConverterError("invalid_value");
  const integerPart = decimalParts[0] || (decimalParts[1] ? "0" : "");
  const groups = integerPart.split(syntax.group);
  if (!groups.length || groups.some((group) => !/^\d+$/.test(group)))
    throw new UnitConverterError("invalid_value");
  if (
    groups.length > 1 &&
    (groups.at(-1)?.length !== syntax.primary ||
      // biome-ignore lint/style/noNonNullAssertion: validated fixed-width index or lookup invariant
      groups[0]!.length > syntax.secondary ||
      groups.slice(1, -1).some((group) => group.length !== syntax.secondary))
  )
    throw new UnitConverterError("invalid_value");
  return Number(`${sign}${groups.join("")}.${decimalParts[1] ?? ""}`);
}

export function formatUnitNumber(
  value: number,
  precision: PrecisionOption,
  locale = "en-US",
) {
  if (!Number.isFinite(value)) throw new UnitConverterError("out_of_range");
  if (Object.is(value, -0) || value === 0) return "0";
  const rounded =
    precision === "max"
      ? String(value)
      : String(Number(value.toPrecision(Number(precision))));
  const decimal = localeSyntax(locale).decimal;
  return decimal === "." ? rounded : rounded.replace(".", decimal);
}

export function convertUnit(input: {
  category: UnitCategoryId;
  value: string;
  from: string;
  to: string;
  precision?: PrecisionOption;
  locale?: string;
}) {
  const category = CATEGORIES[input.category];
  const from = findUnit(category, input.from);
  const to = findUnit(category, input.to);
  if (!from || !to) throw new UnitConverterError("invalid_unit");
  const value = parseUnitNumber(input.value, input.locale);
  const raw = convertUnits(value, from, to);
  const precision = input.precision ?? "6";
  const locale = input.locale ?? "en-US";
  return {
    category: input.category,
    input: value,
    from: from.id,
    to: to.id,
    raw,
    formatted: formatUnitNumber(raw, precision, locale),
    conversions: category.units.map((unit) => {
      const converted = convertUnits(value, from, unit);
      return {
        id: unit.id,
        symbol: unit.symbol,
        raw: Number.isFinite(converted) ? converted : null,
        formatted: Number.isFinite(converted)
          ? formatUnitNumber(converted, precision, locale)
          : "",
      };
    }),
  };
}
