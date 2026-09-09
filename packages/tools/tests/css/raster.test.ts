import { expect, it } from "vitest";
import { BLENDS, DEFAULT_GRADIENT } from "../../src/css/generators";
import {
  blend,
  interpolate,
  lchToRgb,
  prepare,
  renderGradientRaster,
  rgbToLch,
  type Color,
} from "../../src/css/raster";

const red: Color = [1, 0, 0, 1];
const blue: Color = [0, 0, 1, 1];
const basic = {
  ...DEFAULT_GRADIENT,
  angle: 90,
  stops: [
    { color: "red", position: 0 },
    { color: "blue", position: 100 },
  ],
};

it("applies linear endpoints and premultiplied alpha interpolation", () => {
  const sample = prepare(basic, 100, 50);
  expect(sample(0, 25)).toEqual(red);
  expect(sample(100, 25)).toEqual(blue);
  expect(sample(50, 25)).toEqual([0.5, 0, 0.5, 1]);
  expect(interpolate([1, 0, 0, 0], blue, 0.5, "srgb")).toEqual([0, 0, 1, 0.5]);
  expect(interpolate([0, 0, 0, 0], [1, 1, 1, 0], 0.5, "srgb")).toEqual([
    0, 0, 0, 0,
  ]);
  expect(interpolate([0, 0, 0, 1], red, 0.5, "oklch")[3]).toBe(1);
  expect(
    interpolate([0.4, 0.4, 0.4, 1], [0.5, 0.5, 0.5, 1], 0.5, "oklch")[3],
  ).toBe(1);
});

it("preserves hard stops, radial distance, all radial sizes, and conic angle", () => {
  const hard = prepare(
    {
      ...basic,
      stops: [
        { color: "red", position: 50 },
        { color: "blue", position: 50 },
      ],
    },
    100,
    100,
  );
  expect(hard(49.9, 50)).toEqual(red);
  expect(hard(50, 50)).toEqual(blue);
  for (const radialSize of [
    "closest-side",
    "closest-corner",
    "farthest-side",
    "farthest-corner",
  ] as const) {
    const radial = prepare(
      { ...basic, type: "radial", radialShape: "ellipse", radialSize },
      100,
      50,
    );
    expect(radial(50, 25)).toEqual(red);
    expect(radial(100, 25)[3]).toBe(1);
  }
  const circle = prepare(
    {
      ...basic,
      type: "radial",
      radialShape: "circle",
      radialSize: "farthest-corner",
    },
    100,
    100,
  );
  expect(circle(50, 50)).toEqual(red);
  const conic = prepare({ ...basic, type: "conic", angle: 0 }, 100, 100);
  expect(conic(50, 0)).toEqual(red);
  expect(conic(100, 50)).toEqual([0.75, 0, 0.25, 1]);
});

it("roundtrips Oklab matrices and handles achromatic and hue-wrap colors", () => {
  for (const color of [
    red,
    blue,
    [0, 1, 0, 1],
    [0.4, 0.4, 0.4, 1],
  ] as Color[]) {
    const back = lchToRgb(rgbToLch(color));
    for (let i = 0; i < 3; i++) expect(back[i]).toBeCloseTo(color[i], 5);
  }
  expect(Number.isNaN(rgbToLch([0, 0, 0, 1])[2])).toBe(true);
  const mid = interpolate(red, blue, 0.5, "oklch");
  expect(mid.slice(0, 3).map((v) => Math.round(v * 255))).toEqual([
    186, 0, 194,
  ]);
  const a = lchToRgb([0.7, 0.05, 350]);
  const b = lchToRgb([0.7, 0.05, 10]);
  const hue = rgbToLch(interpolate(a, b, 0.5, "oklch"))[2];
  expect(Math.min(hue, 360 - hue)).toBeLessThan(0.001);
});

it("implements transparent, source-over, and every blend mode", () => {
  expect(blend([0, 0, 1, 0.5], [1, 0, 0, 0.5], "normal")).toEqual([
    2 / 3,
    0,
    1 / 3,
    0.75,
  ]);
  expect(blend([0.5, 0.4, 0.3, 1], [0.2, 0.5, 0.8, 1], "multiply")).toEqual([
    0.1, 0.2, 0.24, 1,
  ]);
  expect(blend([0.2, 0.3, 0.4, 1], [0, 0, 0, 0], "normal")).toEqual([
    0.2, 0.3, 0.4, 1,
  ]);
  expect(blend([0, 0, 0, 0], red, "normal")).toEqual(red);
  for (const mode of BLENDS) {
    const out = blend([0.2, 0.4, 0.6, 0.7], [0.8, 0.3, 0.1, 0.4], mode);
    expect(out[3]).toBeCloseTo(0.82);
    for (const channel of out) expect(channel >= 0 && channel <= 1).toBe(true);
  }
  expect(blend([0, 0, 0, 1], [0, 0, 0, 1], "color-dodge")).toEqual([
    0, 0, 0, 1,
  ]);
  expect(blend([1, 1, 1, 1], [1, 1, 1, 1], "color-burn")).toEqual([1, 1, 1, 1]);
  expect(blend([0.5, 0.5, 0.5, 1], [0.5, 0.5, 0.5, 1], "hue")).toEqual([
    expect.closeTo(0.5),
    expect.closeTo(0.5),
    expect.closeTo(0.5),
    1,
  ]);
  expect(blend([1, 0, 0, 1], [0, 1, 1, 1], "hue")[3]).toBe(1);
  expect(blend([2, 2, 2, 1], [0, 1, 1, 1], "hue")[3]).toBe(1);
  expect(blend([0.6, 0.6, 0.6, 1], [0.8, 0.8, 0.8, 1], "soft-light")[3]).toBe(
    1,
  );
});

it("returns transparent color when extrapolated opacities compose to zero", () => {
  // Low-level interpolation accepts extrapolation; these are not CSS opacity inputs.
  const back = interpolate([0, 0, 1, 0], blue, 2, "srgb");
  const source = interpolate([1, 0, 0, 0], red, 2, "srgb");
  expect(back).toEqual([0, 0, 1, 2]);
  expect(source).toEqual([1, 0, 0, 2]);
  expect(blend(back, source, "normal")).toEqual([0, 0, 0, 0]);
  expect(back).toEqual([0, 0, 1, 2]);
  expect(source).toEqual([1, 0, 0, 2]);
});

it("renders real pixels for linear, Oklch, radial, conic, alpha, and layers", async () => {
  const pixels = await renderGradientRaster({ layers: [basic] }, 4, 2);
  expect(pixels).toHaveLength(32);
  expect(Array.from(pixels.slice(0, 4))).toEqual([223, 0, 32, 255]);
  const layered = await renderGradientRaster(
    { layers: [{ ...basic, colorSpace: "oklch" }, basic] },
    3,
    3,
  );
  expect(layered).toHaveLength(36);
  expect(
    prepare(
      {
        ...basic,
        type: "radial",
        radialShape: "ellipse",
        radialSize: "closest-corner",
      },
      0,
      100,
    )(0, 0),
  ).toEqual(blue);
  expect(
    prepare(
      {
        ...basic,
        type: "radial",
        colorSpace: "oklch",
        stops: [
          { color: "red", position: 0 },
          { color: "blue", position: 0 },
          { color: "blue", position: 100 },
        ],
      },
      10,
      10,
    )(5, 5),
  ).toBeDefined();
  const transparent = await renderGradientRaster(
    {
      layers: [
        {
          ...basic,
          colorSpace: "oklch",
          stops: [
            { color: "#00000000", position: 0 },
            { color: "#00000000", position: 100 },
          ],
        },
      ],
    },
    2,
    2,
  );
  expect(Array.from(transparent)).toEqual(Array.from({ length: 16 }, () => 0));
  for (const type of ["radial", "conic"] as const) {
    const output = await renderGradientRaster(
      {
        layers: [
          {
            ...basic,
            type,
            radialShape: "ellipse",
            radialSize: "closest-corner",
          },
        ],
      },
      2,
      2,
    );
    expect(output).toHaveLength(16);
  }
  expect(prepare({ ...basic, type: "radial" }, 0, 100)(0, 0)).toEqual(blue);
});

it("observes pre-cancel and mid-render cancellation", async () => {
  const before = new AbortController();
  before.abort();
  await expect(
    renderGradientRaster({ layers: [basic] }, 1, 1, before.signal),
  ).rejects.toMatchObject({
    name: "AbortError",
  });
  const abort = new AbortController();
  const pending = renderGradientRaster(
    { layers: [{ ...basic, colorSpace: "oklch" }] },
    1000,
    1000,
    abort.signal,
  );
  setTimeout(() => abort.abort(), 5);
  await expect(pending).rejects.toMatchObject({ name: "AbortError" });
});

it("renders valid edge-centered closest radial gradients as the final stop", async () => {
  for (const radialShape of ["circle", "ellipse"] as const) {
    for (const radialSize of ["closest-side", "closest-corner"] as const) {
      const centers =
        radialShape === "circle" && radialSize === "closest-corner"
          ? [
              [0, 0],
              [100, 100],
            ]
          : [
              [0, 50],
              [50, 0],
              [100, 50],
              [50, 100],
            ];
      for (const [centerX, centerY] of centers) {
        const layer = {
          ...basic,
          type: "radial" as const,
          radialShape,
          radialSize,
          centerX,
          centerY,
        };
        const pixels = await renderGradientRaster({ layers: [layer] }, 3, 2);
        expect(Array.from(pixels)).toEqual(
          Array.from({ length: 6 }, () => [0, 0, 255, 255]).flat(),
        );
      }
    }
  }
});

it("handles dodge and burn endpoints without division by zero", () => {
  expect(blend([0.4, 0.7, 0.2, 1], [1, 1, 1, 1], "color-dodge")).toEqual([
    1, 1, 1, 1,
  ]);
  expect(blend([0.4, 0.7, 0.2, 1], [0, 0, 0, 1], "color-burn")).toEqual([
    0, 0, 0, 1,
  ]);
  expect(() => blend(red, blue, "unsupported" as never)).toThrow(
    "Unsupported blend mode",
  );
});

it.each(["linear", "radial", "conic"] as const)(
  "keeps prepared %s geometry stable when the caller changes its layer",
  (type) => {
    const layer = {
      ...basic,
      type: type as "linear" | "radial" | "conic",
      stops: basic.stops.map((stop) => ({ ...stop })),
    };
    const sample = prepare(layer, 100, 50);
    const points = [
      [50, 25],
      [0, 25],
      [100, 25],
      [50, 0],
    ];
    const expected = points.map(([x, y]) => sample(x, y));
    layer.type = type === "radial" ? "linear" : "radial";
    layer.angle = 0;
    layer.centerX = 0;
    layer.stops[0].color = "white";
    expect(points.map(([x, y]) => sample(x, y))).toEqual(expected);
  },
);

it("isolates endpoint and degenerate samples from caller mutations", () => {
  const regular = prepare(basic, 100, 50);
  const degenerate = prepare(
    { ...basic, type: "radial", radialSize: "closest-side", centerX: 0 },
    100,
    50,
  );
  for (const [sample, x, y] of [
    [regular, -100, 25],
    [regular, 200, 25],
    [degenerate, 25, 25],
  ] as const) {
    const result = sample(x, y);
    const expected = [...result];
    result[0] = 99;
    result[3] = 0;
    expect(sample(x, y)).toEqual(expected);
    expect(sample(x, y)).not.toBe(result);
  }
});

it.each([
  { back: [1, 0, 0, 1], source: [0, 0, 1, 0], expected: [1, 0, 0, 1] },
  { back: [1, 0, 0, 0], source: [0, 0, 1, 0.5], expected: [0, 0, 1, 0.5] },
  { back: [1, 0, 0, 0.5], source: [0, 0, 1, 1], expected: [0, 0, 1, 1] },
])(
  "keeps blend inputs independent from editable output: $expected",
  ({ back, source, expected }) => {
    const background = [...back] as Color;
    const foreground = [...source] as Color;
    const result = blend(background, foreground, "normal");
    expect(result).toEqual(expected);
    result[0] = 0.25;
    result[3] = 0.25;
    expect(background).toEqual(back);
    expect(foreground).toEqual(source);
    expect(blend(background, foreground, "normal")).toEqual(expected);
  },
);

it("rejects nonfinite raster dimensions before preparing samplers", async () => {
  for (const dimension of [NaN, Infinity, -Infinity]) {
    await expect(
      renderGradientRaster({ layers: [basic] }, dimension, 16),
    ).rejects.toThrow();
    await expect(
      renderGradientRaster({ layers: [basic] }, 16, dimension),
    ).rejects.toThrow();
  }
});
