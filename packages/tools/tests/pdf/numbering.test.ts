import { describe, expect, it } from "vitest";
import {
  NUMBER_POSITIONS,
  numberDefaults,
  numberOptions,
  numberPlacement,
  type NumberOptions,
} from "../../src/pdf/numbering";
import { PdfEditingError } from "../../src/pdf/core";

function options(overrides: Partial<NumberOptions> = {}): NumberOptions {
  return { ...numberDefaults, ...overrides };
}

describe("PDF page numbering options", () => {
  it("exposes the six positions and stable defaults", () => {
    expect(NUMBER_POSITIONS).toEqual([
      "top-left",
      "top-center",
      "top-right",
      "bottom-left",
      "bottom-center",
      "bottom-right",
    ]);
    expect(numberDefaults).toEqual({
      pages: "",
      startNumber: 1,
      format: "number",
      position: "bottom-center",
      fontFamily: "serif",
      fontSize: 12,
      marginX: 24,
      marginY: 24,
    });
    expect(numberOptions(numberDefaults)).toBe(numberDefaults);
  });

  it.each([
    ["top-left", { x: 24, y: 764 }],
    ["top-center", { x: 250, y: 764 }],
    ["top-right", { x: 476, y: 764 }],
    ["bottom-left", { x: 24, y: 24 }],
    ["bottom-center", { x: 250, y: 24 }],
    ["bottom-right", { x: 476, y: 24 }],
  ] as const)(
    "places %s using visible page coordinates",
    (position, expected) => {
      expect(numberPlacement(600, 800, 100, options({ position }))).toEqual(
        expected,
      );
    },
  );

  it("clamps coordinates when the text or font is larger than the page", () => {
    expect(
      numberPlacement(
        50,
        10,
        100,
        options({
          position: "top-right",
          marginX: 144,
          marginY: 144,
          fontSize: 72,
        }),
      ),
    ).toEqual({ x: 0, y: 0 });
    expect(
      numberPlacement(20, 100, 40, options({ position: "bottom-center" })),
    ).toEqual({
      x: 0,
      y: 24,
    });
  });

  it("accepts inclusive numeric boundaries and all supported enum values", () => {
    expect(
      numberOptions(
        options({
          startNumber: 999999,
          fontSize: 72,
          marginX: 144,
          marginY: 144,
        }),
      ),
    ).toMatchObject({
      startNumber: 999999,
      fontSize: 72,
      marginX: 144,
      marginY: 144,
    });
    expect(
      numberOptions(
        options({
          startNumber: 1,
          fontSize: 6,
          marginX: 0,
          marginY: 0,
          format: "number-total",
          fontFamily: "sans-serif",
        }),
      ).format,
    ).toBe("number-total");
  });

  it.each([
    ["startNumber", 0],
    ["startNumber", 1.5],
    ["startNumber", 1_000_000],
    ["fontSize", 5],
    ["fontSize", 72.5],
    ["fontSize", Number.NaN],
    ["marginX", -1],
    ["marginX", 145],
    ["marginY", Number.POSITIVE_INFINITY],
    ["marginY", 1.1],
  ] as const)("rejects invalid numeric option %s=%s", (key, value) => {
    expect(() =>
      numberOptions(options({ [key]: value } as Partial<NumberOptions>)),
    ).toThrow(new PdfEditingError("invalid_options"));
  });

  it.each([
    ["position", "middle"],
    ["format", "numbered"],
    ["fontFamily", "monospace"],
  ] as const)("rejects invalid enum option %s", (key, value) => {
    expect(() =>
      numberOptions(options({ [key]: value } as Partial<NumberOptions>)),
    ).toThrow("invalid_options");
  });
});
