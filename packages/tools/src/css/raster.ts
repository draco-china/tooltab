/** Shared font-free CSS gradient raster with premultiplied interpolation and blending. */

import { validateDimensions } from "../image/options";
import { parseColor } from "../color/convert";
import { type GradientLayer, gradientSchema } from "./generators";
export type Color = [number, number, number, number];
type Triple = [number, number, number];
const clamp = (v: number) => Math.max(0, Math.min(1, v));
const radians = (a: number) => (a * Math.PI) / 180;
const linear = (v: number) =>
  v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
const gamma = (v: number) =>
  v <= 0.0031308 ? 12.92 * v : 1.055 * v ** (1 / 2.4) - 0.055;
// Public-domain sRGB/Oklab matrices by Björn Ottosson, 2021 revision.
export function rgbToLch(c: Color): Triple {
  const [r, g, b] = c.slice(0, 3).map(linear);
  const l = Math.cbrt(0.4122214708 * r + 0.5363325363 * g + 0.0514459929 * b),
    m = Math.cbrt(0.2119034982 * r + 0.6806995451 * g + 0.1073969566 * b),
    s = Math.cbrt(0.0883024619 * r + 0.2817188376 * g + 0.6299787005 * b);
  const L = 0.2104542553 * l + 0.793617785 * m - 0.0040720468 * s,
    a = 1.9779984951 * l - 2.428592205 * m + 0.4505937099 * s,
    B = 0.0259040371 * l + 0.7827717662 * m - 0.808675766 * s;
  const chroma = Math.hypot(a, B);
  return [
    L,
    chroma,
    chroma <= 0.000004 ? NaN : ((Math.atan2(B, a) * 180) / Math.PI + 360) % 360,
  ];
}
export function lchToRgb([L, C, H]: Triple, alpha = 1): Color {
  const a = C * Math.cos(radians(H || 0)),
    b = C * Math.sin(radians(H || 0));
  const l = (L + 0.3963377774 * a + 0.2158037573 * b) ** 3,
    m = (L - 0.1055613458 * a - 0.0638541728 * b) ** 3,
    s = (L - 0.0894841775 * a - 1.291485548 * b) ** 3;
  return [
    clamp(gamma(4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s)),
    clamp(gamma(-1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s)),
    clamp(gamma(-0.0041960863 * l - 0.7034186147 * m + 1.707614701 * s)),
    alpha,
  ];
}
export function interpolate(
  a: Color,
  b: Color,
  t: number,
  space: "srgb" | "oklch",
): Color {
  const alpha = a[3] * (1 - t) + b[3] * t;
  if (!alpha) return [0, 0, 0, 0];
  const mix = (x: number, y: number) =>
    (x * a[3] * (1 - t) + y * b[3] * t) / alpha;
  if (space === "srgb")
    return [mix(a[0], b[0]), mix(a[1], b[1]), mix(a[2], b[2]), alpha];
  const A = rgbToLch(a),
    B = rgbToLch(b);
  let h1 = A[2],
    h2 = B[2];
  if (Number.isNaN(h1)) h1 = Number.isNaN(h2) ? 0 : h2;
  if (Number.isNaN(h2)) h2 = h1;
  let delta = h2 - h1;
  if (delta > 180) delta -= 360;
  if (delta < -180) delta += 360;
  return lchToRgb([mix(A[0], B[0]), mix(A[1], B[1]), h1 + delta * t], alpha);
}
const lum = (c: Triple) => 0.3 * c[0] + 0.59 * c[1] + 0.11 * c[2];
const sat = (c: Triple) => Math.max(...c) - Math.min(...c);
function setLum(c: Triple, value: number): Triple {
  const d = value - lum(c),
    out = c.map((v) => v + d) as Triple;
  const L = lum(out),
    n = Math.min(...out),
    x = Math.max(...out);
  if (n < 0)
    for (let i = 0; i < 3; i++) out[i] = L + ((out[i] - L) * L) / (L - n);
  if (x > 1)
    for (let i = 0; i < 3; i++) out[i] = L + ((out[i] - L) * (1 - L)) / (x - L);
  return out;
}
function setSat(c: Triple, value: number): Triple {
  const order = [0, 1, 2].sort((a, b) => c[a] - c[b]),
    [lo, mid, hi] = order,
    out = [0, 0, 0] as Triple;
  if (c[hi] > c[lo]) {
    out[mid] = ((c[mid] - c[lo]) * value) / (c[hi] - c[lo]);
    out[hi] = value;
  }
  return out;
}
export function blend(
  back: Color,
  source: Color,
  mode: GradientLayer["blendMode"],
): Color {
  if (source[3] === 0) return [...back];
  if (back[3] === 0 || (mode === "normal" && source[3] === 1))
    return [...source];
  const B = back.slice(0, 3) as Triple,
    S = source.slice(0, 3) as Triple;
  let mixed: Triple;
  if (mode === "hue") mixed = setLum(setSat(S, sat(B)), lum(B));
  else if (mode === "saturation") mixed = setLum(setSat(B, sat(S)), lum(B));
  else if (mode === "color") mixed = setLum(S, lum(B));
  else if (mode === "luminosity") mixed = setLum(B, lum(S));
  else
    mixed = B.map((b, i) => {
      const s = S[i];
      switch (mode) {
        case "normal":
          return s;
        case "multiply":
          return b * s;
        case "screen":
          return b + s - b * s;
        case "overlay":
          return b <= 0.5 ? 2 * b * s : 1 - 2 * (1 - b) * (1 - s);
        case "darken":
          return Math.min(b, s);
        case "lighten":
          return Math.max(b, s);
        case "color-dodge":
          return b === 0 ? 0 : s === 1 ? 1 : Math.min(1, b / (1 - s));
        case "color-burn":
          return b === 1 ? 1 : s === 0 ? 0 : 1 - Math.min(1, (1 - b) / s);
        case "hard-light":
          return s <= 0.5 ? 2 * b * s : 1 - 2 * (1 - b) * (1 - s);
        case "soft-light":
          return s <= 0.5
            ? b - (1 - 2 * s) * b * (1 - b)
            : b +
                (2 * s - 1) *
                  ((b <= 0.25 ? ((16 * b - 12) * b + 4) * b : Math.sqrt(b)) -
                    b);
        case "difference":
          return Math.abs(b - s);
        case "exclusion":
          return b + s - 2 * b * s;
        default:
          throw new Error("Unsupported blend mode");
      }
    }) as Triple;
  const ab = back[3],
    as = source[3],
    alpha = as + ab * (1 - as);
  if (!alpha) return [0, 0, 0, 0];
  return [
    ...B.map((b, i) =>
      clamp(
        (as * (1 - ab) * S[i] + as * ab * mixed[i] + (1 - as) * ab * b) / alpha,
      ),
    ),
    alpha,
  ] as Color;
}
export function prepare(layer: GradientLayer, width: number, height: number) {
  const { type, angle } = layer;
  const stops = [...layer.stops]
    .sort((a, b) => a.position - b.position)
    .map((s) => {
      const c = parseColor(s.color);
      return {
        position: s.position / 100,
        color: [c.r / 255, c.g / 255, c.b / 255, c.a] as Color,
      };
    });
  // Segment-local tables preserve exact hard-stop boundaries; channels are premultiplied to avoid transparent-edge halos.
  const tables =
    layer.colorSpace === "oklch"
      ? stops.slice(1).map((stop, i) => {
          if (stop.position === stops[i].position) return null;
          const table = new Float32Array(1025 * 4);
          for (let step = 0; step <= 1024; step++) {
            const color = interpolate(
              stops[i].color,
              stop.color,
              step / 1024,
              "oklch",
            );
            for (let c = 0; c < 3; c++)
              table[step * 4 + c] = color[c] * color[3];
            table[step * 4 + 3] = color[3];
          }
          return table;
        })
      : [];
  const sin = Math.sin(radians(angle)),
    cos = Math.cos(radians(angle));
  const length = Math.abs(width * sin) + Math.abs(height * cos),
    cx = (width * layer.centerX) / 100,
    cy = (height * layer.centerY) / 100;
  const close = layer.radialSize.startsWith("closest"),
    side = close ? Math.min : Math.max;
  let rx = side(cx, width - cx),
    ry = side(cy, height - cy);
  if (layer.radialShape === "circle")
    rx = ry = layer.radialSize.endsWith("side")
      ? side(rx, ry)
      : side(
          Math.hypot(cx, cy),
          Math.hypot(width - cx, cy),
          Math.hypot(cx, height - cy),
          Math.hypot(width - cx, height - cy),
        );
  else if (layer.radialSize.endsWith("corner")) {
    const factor = side(
      Math.hypot(cx / (rx || 1e-12), cy / (ry || 1e-12)),
      Math.hypot((width - cx) / (rx || 1e-12), cy / (ry || 1e-12)),
      Math.hypot(cx / (rx || 1e-12), (height - cy) / (ry || 1e-12)),
      Math.hypot((width - cx) / (rx || 1e-12), (height - cy) / (ry || 1e-12)),
    );
    rx *= factor;
    ry *= factor;
  }
  if (type === "radial" && (rx === 0 || ry === 0))
    return (): Color => [...stops[stops.length - 1].color];
  return (x: number, y: number): Color => {
    const t =
      type === "linear"
        ? 0.5 + ((x - width / 2) * sin - (y - height / 2) * cos) / length
        : type === "radial"
          ? Math.hypot((x - cx) / rx, (y - cy) / ry)
          : (((((Math.atan2(x - cx, -(y - cy)) * 180) / Math.PI - angle) %
              360) +
              360) %
              360) /
            360;
    if (t < stops[0].position) return [...stops[0].color];
    let i = 1;
    while (i < stops.length && t >= stops[i].position) i++;
    if (i === stops.length) return [...stops[i - 1].color];
    const tStop =
      (t - stops[i - 1].position) / (stops[i].position - stops[i - 1].position);
    const table = tables[i - 1];
    if (table) {
      const cursor = tStop * 1024,
        index = Math.min(1023, Math.floor(cursor)),
        f = cursor - index;
      const offset = index * 4,
        alpha = table[offset + 3] * (1 - f) + table[offset + 7] * f;
      if (alpha === 0) return [0, 0, 0, 0];
      return [0, 1, 2]
        .map(
          (c) =>
            (table[offset + c] * (1 - f) + table[offset + 4 + c] * f) / alpha,
        )
        .concat(alpha) as Color;
    }
    return interpolate(stops[i - 1].color, stops[i].color, tStop, "srgb");
  };
}
export async function renderGradientRaster(
  input: unknown,
  width: number,
  height: number,
  signal?: AbortSignal,
) {
  const config = gradientSchema.parse(input);
  validateDimensions({ width, height });
  signal?.throwIfAborted();
  const pixels = new Uint8Array(width * height * 4),
    layers = [...config.layers].reverse().map((layer) => ({
      sample: prepare(layer, width, height),
      blend: layer.blendMode,
    }));
  for (let y = 0; y < height; y++) {
    if (y % 8 === 0) {
      signal?.throwIfAborted();
      await new Promise<void>((resolve) => setTimeout(resolve, 0));
    }
    for (let x = 0; x < width; x++) {
      let color: Color = [0, 0, 0, 0];
      for (const layer of layers)
        color = blend(color, layer.sample(x + 0.5, y + 0.5), layer.blend);
      const offset = (y * width + x) * 4;
      for (let c = 0; c < 4; c++)
        pixels[offset + c] = Math.round(clamp(color[c]) * 255);
    }
  }
  signal?.throwIfAborted();
  return pixels;
}
