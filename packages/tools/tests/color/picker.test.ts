import { expect, it } from "vitest";
import {
  convertPickerColor,
  ColorPickerError,
  parseOklch,
  parsePickerColor,
  pickerValues,
  rgbaToOklch,
} from "../../src/color/picker";

it("converts picker colors", () => {
  expect(pickerValues(parsePickerColor("#ff0000").color).hex).toBe("#FF0000FF");
});

it("round-trips OKLCH, preserves alpha, and marks clipped gamut", () => {
  const source = { r: 0, g: 102, b: 204, a: 0.4 };
  const parsed = parseOklch(rgbaToOklch(source));
  expect(parsed.gamutClipped).toBe(false);
  expect(parsed.color.a).toBe(0.4);
  expect(Math.abs(parsed.color.b - source.b)).toBeLessThanOrEqual(1);
  expect(parseOklch("oklch(70% 0.5 20)").gamutClipped).toBe(true);
  expect(rgbaToOklch({ ...source, a: 0 }, false)).not.toContain("/");
  expect(
    convertPickerColor("oklch(55% 0.18 245 / 75%)", "oklch"),
  ).toMatchObject({
    capability: "color-conversion",
    screenAccess: false,
    color: { a: 0.75 },
  });
});

it("rejects malformed, bounded and delegated color errors", () => {
  for (const input of [
    "oklch(101% 0.2 20)",
    "oklch(50% -0.1 20)",
    "oklch(50%, 0.2, 20)",
    "oklch(50% 0.2 20 / 120%)",
    "not-a-color",
  ])
    expect(() => parsePickerColor(input)).toThrow(ColorPickerError);
  expect(() => parsePickerColor("#".repeat(501))).toThrow("too_large");
  expect(() => parseOklch("oklch(50% 0.2 20 / 1 / 1)")).toThrow(
    "invalid_color",
  );
  expect(() => parseOklch("oklch(foo 0.2 20)")).toThrow("invalid_color");
  expect(() => parseOklch(`oklch(${"9".repeat(500)} 0.2 20)`)).toThrow(
    "invalid_color",
  );
});

it("rejects missing OKLCH function syntax and channel arity", () => {
  for (const input of [
    "not a color",
    "oklch()",
    "oklch(0 0)",
    "oklch(0 0 0 0)",
  ])
    expect(() => parseOklch(input)).toThrow(
      expect.objectContaining({ code: "invalid_color" }),
    );
});

it("uses zero hue for neutral black", () => {
  expect(rgbaToOklch({ r: 0, g: 0, b: 0, a: 1 })).toBe("oklch(0% 0 0 / 1)");
});
