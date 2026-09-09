export type RandomNumberOptions = {
  min: string;
  max: string;
  count: number;
  numberType: "integer" | "decimal";
  decimalPlaces: number;
  allowRepeat: boolean;
};
export class RandomNumberError extends Error {
  constructor(
    public readonly code:
      | "invalid_range"
      | "invalid_options"
      | "insufficient_values"
      | "random_unavailable",
  ) {
    super(code);
  }
}
export const randomDefaults: RandomNumberOptions = {
  min: "1",
  max: "100",
  count: 1,
  numberType: "integer",
  decimalPlaces: 2,
  allowRepeat: true,
};
export const randomPresets = {
  dice: { ...randomDefaults, max: "6" },
  ten: { ...randomDefaults, max: "10" },
  hundred: { ...randomDefaults },
  lotto: { ...randomDefaults, max: "49", count: 6, allowRepeat: false },
} satisfies Record<string, RandomNumberOptions>;
// Compute ceil(min * 10^places) / floor(max * 10^places) without binary-float rounding.
function scaled(value: string, places: number, lower: boolean) {
  if (value.length > 400) throw new RandomNumberError("invalid_range");
  const m = /^([+-]?)(?:(\d+)(?:\.(\d*))?|\.(\d+))(?:e([+-]?\d{1,3}))?$/i.exec(
    value.trim(),
  );
  if (!m) throw new RandomNumberError("invalid_range");
  const fraction = m[3] ?? m[4] ?? "",
    exp = Number(m[5] ?? 0);
  if (Math.abs(exp) > 400) throw new RandomNumberError("invalid_range");
  const n = BigInt((m[2] ?? "0") + fraction) * (m[1] === "-" ? -1n : 1n),
    shift = exp - fraction.length + places;
  if (shift >= 0) return n * 10n ** BigInt(shift);
  const divisor = 10n ** BigInt(-shift),
    q = n / divisor,
    rem = n % divisor;
  return (
    q + (rem !== 0n ? (lower && n > 0n ? 1n : !lower && n < 0n ? -1n : 0n) : 0n)
  );
}
export function randomRange(options: RandomNumberOptions) {
  if (
    !Number.isInteger(options.count) ||
    options.count < 1 ||
    options.count > 100 ||
    !Number.isInteger(options.decimalPlaces) ||
    options.decimalPlaces < 0 ||
    options.decimalPlaces > 6 ||
    !["integer", "decimal"].includes(options.numberType) ||
    typeof options.allowRepeat !== "boolean"
  )
    throw new RandomNumberError("invalid_options");
  const places = options.numberType === "decimal" ? options.decimalPlaces : 0;
  const min = scaled(options.min, places, true),
    max = scaled(options.max, places, false),
    size = max - min + 1n;
  if (size <= 0n) throw new RandomNumberError("invalid_range");
  if (!options.allowRepeat && BigInt(options.count) > size)
    throw new RandomNumberError("insufficient_values");
  return { min, max, size, places };
}
function below(size: bigint): bigint {
  if (size === 1n) return 0n;
  const bits = (size - 1n).toString(2).length,
    bytes = new Uint8Array(Math.ceil(bits / 8)),
    mask = 255 >> ((8 - (bits % 8)) % 8);
  for (let attempt = 0; attempt < 128; attempt++) {
    try {
      globalThis.crypto.getRandomValues(bytes);
    } catch {
      throw new RandomNumberError("random_unavailable");
    }
    bytes[0] &= mask;
    let value = 0n;
    for (const b of bytes) value = (value << 8n) | BigInt(b);
    if (value < size) return value;
  }
  throw new RandomNumberError("random_unavailable");
}
function formatted(value: bigint, places: number) {
  if (!places) return String(value);
  const s = (value < 0n ? -value : value).toString().padStart(places + 1, "0");
  return `${value < 0n ? "-" : ""}${s.slice(0, -places)}.${s.slice(-places)}`;
}
export function generateNumbers(options: RandomNumberOptions) {
  const { min, size, places } = randomRange(options),
    swaps = new Map<bigint, bigint>(),
    values: string[] = [];
  let remaining = size;
  for (let i = 0; i < options.count; i++) {
    const index = below(remaining),
      value = swaps.get(index) ?? index;
    values.push(formatted(min + value, places));
    if (!options.allowRepeat) {
      remaining--;
      swaps.set(index, swaps.get(remaining) ?? remaining);
      swaps.delete(remaining);
    }
  }
  return { values, output: values.join("\n"), availableValues: String(size) };
}
