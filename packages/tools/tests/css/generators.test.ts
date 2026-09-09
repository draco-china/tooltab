import { expect, it } from "vitest";
import {
  BLENDS,
  buildGradient,
  buildShadow,
  CssGeneratorError,
  DEFAULT_GRADIENT,
  DEFAULT_SHADOW,
  gradientSvg,
  importGradient,
  preset,
  randomLayer,
  SIZES,
  TYPES,
  validateSize,
} from "../../src/css/generators";

it("serializes ordered shadows with inset and strict pixel limits", () => {
  expect(
    buildShadow({
      layers: [
        DEFAULT_SHADOW,
        { ...DEFAULT_SHADOW, inset: true, offsetX: -12 },
      ],
    }).value,
  ).toContain(", inset -12px");
  expect(buildShadow({ layers: [DEFAULT_SHADOW] }).css).toContain(
    "box-shadow:",
  );
  for (const patch of [
    { blur: -1 },
    { spread: 61 },
    { offsetX: 121 },
    { color: "red;display:none" },
  ])
    expect(() =>
      buildShadow({ layers: [{ ...DEFAULT_SHADOW, ...patch }] }),
    ).toThrow("invalid_config");
  expect(() => buildShadow({ layers: [] })).toThrow(CssGeneratorError);
  expect(() =>
    buildShadow({ layers: Array(17).fill(DEFAULT_SHADOW) }),
  ).toThrow();
  expect(() =>
    buildShadow({ layers: [{ ...DEFAULT_SHADOW, extra: true }] }),
  ).toThrow();
});

it("builds every gradient geometry, size, type, blend and color space", () => {
  expect(TYPES).toEqual(["linear", "radial", "conic"]);
  expect(SIZES).toEqual([
    "closest-side",
    "closest-corner",
    "farthest-side",
    "farthest-corner",
  ]);
  for (const type of TYPES)
    for (const blendMode of BLENDS) {
      const r = buildGradient({
        layers: [
          {
            ...DEFAULT_GRADIENT,
            type,
            radialSize: SIZES[0],
            colorSpace: "oklch",
            blendMode,
          },
        ],
        format: "rgba",
      });
      expect(r.backgroundImage).toContain(`${type}-gradient(`);
      expect(r.backgroundImage).toContain("in oklch");
      expect(r.blendMode).toBe(blendMode);
      expect(r.background).toContain("background:");
      expect(r.css).toContain("background-blend-mode:");
    }
  const r = buildGradient({
    layers: [
      {
        ...DEFAULT_GRADIENT,
        stops: [
          { color: "blue", position: 100 },
          { color: "red", position: 50 },
          { color: "lime", position: 50 },
        ],
      },
    ],
  });
  expect(r.backgroundImage.indexOf("#FF0000FF")).toBeLessThan(
    r.backgroundImage.indexOf("#00FF00FF"),
  );
  expect(r.backgroundImage.indexOf("#00FF00FF")).toBeLessThan(
    r.backgroundImage.indexOf("#0000FFFF"),
  );
});

it("rejects injection, unknown fields and capacity overflow", () => {
  for (const patch of [
    { angle: Infinity },
    { centerX: 101 },
    { blendMode: "normal; color:red" },
    { stops: [{ color: "red", position: 0 }] },
    {
      stops: [
        { color: "red", position: -1 },
        { color: "blue", position: 100 },
      ],
    },
  ])
    expect(() =>
      buildGradient({ layers: [{ ...DEFAULT_GRADIENT, ...patch }] }),
    ).toThrow("invalid_config");
  expect(() => importGradient('{"layers":[],"extra":1}')).toThrow(
    "invalid_config",
  );
  expect(() => importGradient("{".repeat(1000001))).toThrow("too_large");
  expect(() =>
    gradientSvg({ layers: [DEFAULT_GRADIENT] }, 8192, 8192),
  ).toThrow();
  expect(() =>
    buildGradient({ layers: [DEFAULT_GRADIENT], format: "css" }),
  ).toThrow();
});

it("exports safe JSON/SVG wrappers, presets and color formats", () => {
  const r = buildGradient({ layers: [DEFAULT_GRADIENT] });
  expect(importGradient(r.json).layers[0]?.angle).toBe(135);
  const svg = gradientSvg({ layers: [DEFAULT_GRADIENT] }, 320, 180);
  expect(svg).toContain('width="320"');
  expect(svg).toContain("<foreignObject");
  expect(svg).toContain("background-image:");
  expect(preset(0).stops).toHaveLength(3);
  expect(() => preset(-1)).toThrow("invalid_config");
  expect(() => preset(PRESET_COUNT)).toThrow("invalid_config");
  const real = randomLayer(DEFAULT_GRADIENT);
  expect(real.stops).toHaveLength(DEFAULT_GRADIENT.stops.length);
  const next = randomLayer(DEFAULT_GRADIENT, () => 0.5);
  expect(next.angle).toBe(180);
  expect(next.stops[0]?.color).toBe("#800000");
  const edge = randomLayer(DEFAULT_GRADIENT, () => 0.999999);
  expect(edge.angle).toBe(360);
  expect(edge.stops[0]?.color).toBe("#ffffef");
});

it("validates SVG dimensions and handles complete legal serialized configs", () => {
  validateSize(1, 1);
  validateSize(8192, 3906);
  expect(() => validateSize(0, 1)).toThrow("invalid_config");
  expect(() => validateSize(1.5, 1)).toThrow("invalid_config");
  expect(() => validateSize(8193, 1)).toThrow("invalid_config");
  expect(() => validateSize(8000, 4001)).toThrow("invalid_config");
  const layer = {
    ...DEFAULT_GRADIENT,
    stops: Array.from({ length: 32 }, (_, i) => ({
      color: `red${"\t".repeat(497)}`,
      position: (i * 100) / 31,
    })),
  };
  const result = buildGradient({ layers: Array(8).fill(layer) });
  expect(importGradient(result.json).layers).toHaveLength(8);
});

const PRESET_COUNT = 6;
