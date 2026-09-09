import { describe, expect, it } from "vitest";
import {
  colorValues,
  extractPalette,
  sortPalette,
} from "../../src/image/palette";
import {
  createSwatches,
  formatPaletteExport,
  getExportFileName,
  getExportMimeType,
  getSampleStride,
  quantizePalette,
  sortSwatches,
} from "../../src/image/palette-quantize";

describe("HTTP palette bins", () => {
  it("ranks distinct bins, filters transparent pixels and keeps its color formatting", () => {
    const pixels = new Uint8ClampedArray([
      255, 0, 0, 255, 255, 0, 0, 255, 0, 255, 0, 255, 0, 0, 255, 0,
    ]);
    expect(extractPalette(pixels, 2)).toEqual(["#ff0000", "#00ff00"]);
    expect(extractPalette(pixels, 3, false)).toEqual([
      "#ff0000",
      "#00ff00",
      "#0000ff",
    ]);
    expect(colorValues("#ff0000")).toEqual({
      hex: "#ff0000",
      rgb: "rgb(255, 0, 0)",
      hsl: "hsl(0, 100%, 50%)",
    });
    expect(sortPalette(["#ffffff", "#ff0000", "#000000"], "lightness")).toEqual(
      ["#000000", "#ff0000", "#ffffff"],
    );
    expect(() => extractPalette(pixels, 1)).toThrow("invalidDimensions");
  });

  it("keeps near colors out, handles every HSL hue branch and does not mutate callers", () => {
    const near = new Uint8ClampedArray([
      0, 0, 0, 255, 16, 16, 16, 255, 255, 255, 255, 255,
    ]);
    expect(extractPalette(near, 3)).toEqual(["#000000", "#ffffff"]);
    expect(colorValues("#00ff00").hsl).toBe("hsl(120, 100%, 50%)");
    expect(colorValues("#0000ff").hsl).toBe("hsl(240, 100%, 50%)");
    expect(colorValues("#808080").hsl).toBe("hsl(0, 0%, 50%)");
    const colors = ["#0000ff", "#ff0000", "#00ff00"];
    expect(sortPalette(colors, "hue")).toEqual([
      "#ff0000",
      "#00ff00",
      "#0000ff",
    ]);
    expect(sortPalette(colors, "dominance")).toEqual(colors);
    expect(colors).toEqual(["#0000ff", "#ff0000", "#00ff00"]);
    for (const count of [0, 13, 2.5])
      expect(() => extractPalette(near, count)).toThrow("invalidDimensions");
  });
});

describe("page median-cut palette", () => {
  it("rejects NaN options instead of silently dropping sampled pixels", () => {
    const data = new Uint8ClampedArray([255, 0, 0, 255, 0, 0, 255, 255]);
    const snapshot = data.slice();
    for (const key of ["colorCount", "sampleStride", "alphaThreshold"] as const)
      expect(() =>
        quantizePalette({ data }, { colorCount: 2, [key]: NaN }),
      ).toThrow(new RangeError("invalidDimensions"));
    expect(data).toEqual(snapshot);
    expect(quantizePalette({ data }, { colorCount: 2 })).toEqual({
      colors: [
        { r: 252, g: 4, b: 4, count: 1 },
        { r: 4, g: 4, b: 252, count: 1 },
      ],
      totalPixels: 2,
    });
  });

  it("accepts portable pixel data, samples alpha and produces deterministic swatches", () => {
    const data = new Uint8ClampedArray([
      255, 0, 0, 255, 255, 0, 0, 255, 0, 255, 0, 255, 0, 0, 255, 0,
    ]);
    const palette = quantizePalette(
      { data },
      { colorCount: 4, ignoreTransparent: true },
    );
    expect(palette).toEqual({
      colors: [
        { r: 252, g: 4, b: 4, count: 2 },
        { r: 4, g: 252, b: 4, count: 1 },
      ],
      totalPixels: 3,
    });
    expect(
      quantizePalette({ data }, { colorCount: 4, sampleStride: 2 }),
    ).toEqual({
      colors: [
        { r: 252, g: 4, b: 4, count: 1 },
        { r: 4, g: 252, b: 4, count: 1 },
      ],
      totalPixels: 2,
    });
    expect(
      quantizePalette({ data }, { colorCount: 4, alphaThreshold: 255 }),
    ).toEqual({
      colors: [],
      totalPixels: 0,
    });
    const swatches = createSwatches(palette.colors, palette.totalPixels);
    expect(
      swatches.map((swatch) => swatch.ratio).reduce((a, b) => a + b, 0),
    ).toBe(1);
    expect(
      sortSwatches(swatches, "dominance").map((swatch) => swatch.count),
    ).toEqual([2, 1]);
    expect(sortSwatches(swatches, "hue").map((swatch) => swatch.hex)).toEqual([
      "#FC0404",
      "#04FC04",
    ]);
    expect(
      sortSwatches(swatches, "lightness").map((swatch) => swatch.hex),
    ).toEqual(["#FC0404", "#04FC04"]);
  });

  it("keeps primary axes, gray endpoints and alpha-threshold semantics", () => {
    expect(
      quantizePalette(
        {
          data: new Uint8ClampedArray([
            255, 0, 0, 255, 0, 255, 0, 255, 0, 0, 255, 255,
          ]),
        },
        { colorCount: 4 },
      ).colors,
    ).toEqual([
      { r: 252, g: 4, b: 4, count: 1 },
      { r: 4, g: 252, b: 4, count: 1 },
      { r: 4, g: 4, b: 252, count: 1 },
    ]);
    expect(
      quantizePalette(
        {
          data: new Uint8ClampedArray([
            0, 0, 0, 255, 128, 128, 128, 255, 255, 255, 255, 255,
          ]),
        },
        { colorCount: 3 },
      ).colors,
    ).toEqual([
      { r: 4, g: 4, b: 4, count: 1 },
      { r: 252, g: 252, b: 252, count: 1 },
      { r: 132, g: 132, b: 132, count: 1 },
    ]);
    const alpha = new Uint8ClampedArray([255, 0, 0, 8, 0, 255, 0, 9]);
    expect(
      quantizePalette({ data: alpha }, { colorCount: 2 }).totalPixels,
    ).toBe(1);
    expect(
      quantizePalette(
        { data: alpha },
        { colorCount: 2, ignoreTransparent: false },
      ).totalPixels,
    ).toBe(2);
  });

  it("formats the real export forms and filenames", () => {
    const swatches = createSwatches([{ r: 255, g: 0, b: 0, count: 1 }], 1);
    expect(formatPaletteExport(swatches, "hex")).toBe("#FF0000");
    expect(formatPaletteExport(swatches, "css")).toBe(
      ":root {\n  --palette-1: #FF0000;\n}",
    );
    expect(JSON.parse(formatPaletteExport(swatches, "json"))).toEqual([
      {
        index: 1,
        hex: "#FF0000",
        rgb: "rgb(255, 0, 0)",
        hsl: "hsl(0, 100%, 50%)",
        ratio: 1,
      },
    ]);
    expect(getExportFileName(" photo.png ", "css")).toBe("photo-palette.css");
    expect(getExportFileName("", "json")).toBe("palette.json");
    expect(getExportFileName("palette", "hex")).toBe("palette.txt");
    expect(getExportMimeType("css")).toBe("text/css");
    expect(getExportMimeType("json")).toBe("application/json");
    expect(getExportMimeType("hex")).toBe("text/plain");
    expect(getSampleStride(100, 100, 2_000)).toBe(5);
  });

  it("handles public quantizer clamps, partial payloads and the empty swatch case", () => {
    const partial = quantizePalette(
      { data: new Uint8ClampedArray([255]) },
      { colorCount: 0, sampleStride: 0, alphaThreshold: -1 },
    );
    expect(partial).toEqual({
      colors: [{ r: 252, g: 4, b: 4, count: 1 }],
      totalPixels: 1,
    });
    expect(
      quantizePalette(
        { data: new Uint8ClampedArray([255, 0, 0, 255]) },
        { colorCount: 999, alphaThreshold: 999 },
      ),
    ).toEqual({ colors: [], totalPixels: 0 });
    expect(
      quantizePalette({ data: new Uint8ClampedArray() }, { colorCount: 3 }),
    ).toEqual({
      colors: [],
      totalPixels: 0,
    });
    expect(createSwatches([], 0)).toEqual([]);
    expect(getSampleStride(-1, 12, 0)).toBe(1);
  });

  it("formats rich swatches and sorts ties by the documented secondary keys", () => {
    const swatches = createSwatches(
      [
        { r: 255, g: 0, b: 255, count: 2 },
        { r: 0, g: 0, b: 255, count: 2 },
        { r: 255, g: 255, b: 255, count: 1 },
        { r: 0, g: 0, b: 0, count: 1 },
      ],
      6,
    );
    expect(
      swatches.map(({ hex, hsl, lightness, textColor }) => ({
        hex,
        hsl,
        lightness,
        textColor,
      })),
    ).toEqual([
      {
        hex: "#FF00FF",
        hsl: "hsl(300, 100%, 50%)",
        lightness: 50,
        textColor: "#ffffff",
      },
      {
        hex: "#0000FF",
        hsl: "hsl(240, 100%, 50%)",
        lightness: 50,
        textColor: "#ffffff",
      },
      {
        hex: "#FFFFFF",
        hsl: "hsl(0, 0%, 100%)",
        lightness: 100,
        textColor: "#111111",
      },
      {
        hex: "#000000",
        hsl: "hsl(0, 0%, 0%)",
        lightness: 0,
        textColor: "#ffffff",
      },
    ]);
    expect(sortSwatches(swatches, "hue").map((swatch) => swatch.hex)).toEqual([
      "#FFFFFF",
      "#000000",
      "#0000FF",
      "#FF00FF",
    ]);
    expect(
      sortSwatches(swatches, "lightness").map((swatch) => swatch.hex),
    ).toEqual(["#000000", "#0000FF", "#FF00FF", "#FFFFFF"]);
    expect(swatches.map((swatch) => swatch.hex)).toEqual([
      "#FF00FF",
      "#0000FF",
      "#FFFFFF",
      "#000000",
    ]);
  });
});

it("keeps alpha cutoff exact and returns no invented colors for empty input", () => {
  expect(extractPalette(new Uint8ClampedArray(), 2)).toEqual([]);
  const pixels = new Uint8ClampedArray([255, 0, 0, 127, 0, 255, 0, 128]);
  expect(extractPalette(pixels, 2)).toEqual(["#00ff00"]);
  expect(extractPalette(pixels, 2, false)).toEqual(["#ff0000", "#00ff00"]);
  expect(extractPalette(new Uint8ClampedArray([255, 0, 0, 0]), 12)).toEqual([]);
  for (const count of [NaN, Infinity, -Infinity]) {
    expect(() => extractPalette(pixels, count)).toThrow("invalidDimensions");
  }
});

it("preserves the legacy sort fallback for incomplete color strings without mutating input", () => {
  const colors = ["#ffffff", "", "#000000"];
  expect(sortPalette(colors, "lightness")).toEqual(["", "#000000", "#ffffff"]);
  expect(sortPalette(["", "#ffffff"], "lightness")).toEqual(["", "#ffffff"]);
  expect(sortPalette(colors, "hue")).toEqual(colors);
  expect(colors).toEqual(["#ffffff", "", "#000000"]);
});

it("clamps swatch channels, rounds export ratios and retains count ordering for equal hue and lightness", () => {
  const swatches = createSwatches(
    [
      { r: 255, g: 128, b: 128, count: 1 },
      { r: 255, g: 128, b: 128, count: 2 },
      { r: -10, g: 300, b: 0.4, count: 3 },
    ],
    6,
  );
  expect(swatches[0]).toMatchObject({
    hex: "#FF8080",
    hsl: "hsl(0, 100%, 75%)",
    ratio: 1 / 6,
  });
  expect(swatches[2]).toMatchObject({
    hex: "#00FF00",
    rgb: "rgb(0, 255, 0)",
    hsl: "hsl(120, 100%, 50%)",
    ratio: 0.5,
  });
  expect(sortSwatches(swatches, "hue").map(({ count }) => count)).toEqual([
    2, 1, 3,
  ]);
  expect(sortSwatches(swatches, "lightness").map(({ count }) => count)).toEqual(
    [3, 2, 1],
  );
  expect(sortSwatches(swatches, "dominance").map(({ count }) => count)).toEqual(
    [3, 2, 1],
  );
  expect(
    JSON.parse(formatPaletteExport(swatches, "json")).map(
      (row: { ratio: number }) => row.ratio,
    ),
  ).toEqual([0.1667, 0.3333, 0.5]);
  expect(formatPaletteExport([], "hex")).toBe("");
  expect(formatPaletteExport([], "json")).toBe("[]");
  expect(formatPaletteExport([], "css")).toBe(":root {\n}");
  expect(swatches.map(({ count }) => count)).toEqual([1, 2, 3]);
});

it("splits a skewed histogram at the last occupied channel without losing pixels", () => {
  const data = new Uint8ClampedArray(44);
  data.set([0, 0, 0, 255]);
  for (let index = 4; index < data.length; index += 4)
    data.set([255, 0, 0, 255], index);
  const result = quantizePalette({ data }, { colorCount: 2 });
  expect(result).toEqual({
    totalPixels: 11,
    colors: [
      { r: 252, g: 4, b: 4, count: 10 },
      { r: 4, g: 4, b: 4, count: 1 },
    ],
  });
});

it("keeps repeated identical pixels in one swatch when no channel can be split", () => {
  const data = new Uint8ClampedArray([80, 80, 80, 255, 80, 80, 80, 255]);
  expect(quantizePalette({ data }, { colorCount: 8 })).toEqual({
    totalPixels: 2,
    colors: [{ r: 84, g: 84, b: 84, count: 2 }],
  });
});

it("continues splitting other colors after a single-pixel box is finished", () => {
  const data = new Uint8ClampedArray([
    117, 101, 245, 255, 103, 243, 254, 255, 169, 108, 127, 255, 73, 108, 172,
    255,
  ]);
  const result = quantizePalette({ data }, { colorCount: 3 });
  expect(result.totalPixels).toBe(4);
  expect(result.colors).toEqual([
    { r: 124, g: 108, b: 148, count: 2 },
    { r: 116, g: 100, b: 244, count: 1 },
    { r: 100, g: 244, b: 252, count: 1 },
  ]);
});

it("conserves sampled pixel counts across deterministic varied palettes", () => {
  let seed = 0x12345678;
  const byte = () => {
    seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
    return seed >>> 24;
  };
  for (let caseIndex = 0; caseIndex < 24; caseIndex++) {
    const data = new Uint8ClampedArray(4 * (32 + caseIndex * 3));
    for (let i = 0; i < data.length; i++) data[i] = byte();
    const snapshot = data.slice();
    const sampleStride = 1 + (caseIndex % 3);
    const ignoreTransparent = caseIndex % 2 === 0;
    const colorCount = 1 + caseIndex;
    let expected = 0;
    for (let i = 0; i < data.length; i += 4 * sampleStride)
      if (!ignoreTransparent || data[i + 3] > 8) expected++;
    const result = quantizePalette(
      { data },
      { colorCount, sampleStride, ignoreTransparent },
    );
    expect(result.totalPixels).toBe(expected);
    expect(result.colors.reduce((sum, color) => sum + color.count, 0)).toBe(
      expected,
    );
    expect(result.colors.length).toBeLessThanOrEqual(colorCount);
    for (const color of result.colors) {
      expect(Number.isInteger(color.count) && color.count > 0).toBe(true);
      for (const channel of [color.r, color.g, color.b]) {
        expect(Number.isInteger(channel)).toBe(true);
        expect(channel).toBeGreaterThanOrEqual(0);
        expect(channel).toBeLessThanOrEqual(255);
      }
    }
    expect(data).toEqual(snapshot);
  }
});
