import * as z from "zod/v4";
import { hexColor, parseColor } from "../color/convert";
export class CssGeneratorError extends Error {
  constructor(
    public readonly code: "invalid_config" | "too_large" | "export_failed",
  ) {
    super(code);
  }
}
const color = z
  .string()
  .max(500)
  .refine((s) => {
    try {
      parseColor(s);
      return true;
    } catch {
      return false;
    }
  });
export const shadowLayerSchema = z.strictObject({
  offsetX: z.number().min(-120).max(120),
  offsetY: z.number().min(-120).max(120),
  blur: z.number().min(0).max(200),
  spread: z.number().min(-60).max(60),
  color,
  inset: z.boolean(),
});
export const shadowSchema = z.strictObject({
  layers: z.array(shadowLayerSchema).min(1).max(16),
});
export type ShadowLayer = z.infer<typeof shadowLayerSchema>;
export const DEFAULT_SHADOW: ShadowLayer = {
  offsetX: 0,
  offsetY: 12,
  blur: 32,
  spread: 0,
  color: "#00000033",
  inset: false,
};
export const BLENDS = [
  "normal",
  "multiply",
  "screen",
  "overlay",
  "darken",
  "lighten",
  "color-dodge",
  "color-burn",
  "hard-light",
  "soft-light",
  "difference",
  "exclusion",
  "hue",
  "saturation",
  "color",
  "luminosity",
] as const;
export const TYPES = ["linear", "radial", "conic"] as const;
export const SIZES = [
  "closest-side",
  "closest-corner",
  "farthest-side",
  "farthest-corner",
] as const;
export const gradientLayerSchema = z.strictObject({
  type: z.enum(TYPES),
  angle: z.number().min(0).max(360),
  centerX: z.number().min(0).max(100),
  centerY: z.number().min(0).max(100),
  radialShape: z.enum(["circle", "ellipse"]),
  radialSize: z.enum(SIZES),
  colorSpace: z.enum(["srgb", "oklch"]),
  blendMode: z.enum(BLENDS),
  stops: z
    .array(z.strictObject({ color, position: z.number().min(0).max(100) }))
    .min(2)
    .max(32),
});
export const gradientSchema = z.strictObject({
  layers: z.array(gradientLayerSchema).min(1).max(8),
  format: z.enum(["hex", "rgba"]).default("hex"),
});
export type GradientLayer = z.infer<typeof gradientLayerSchema>;
export type GradientConfig = z.infer<typeof gradientSchema>;
export const DEFAULT_GRADIENT: GradientLayer = {
  type: "linear",
  angle: 135,
  centerX: 50,
  centerY: 50,
  radialShape: "circle",
  radialSize: "farthest-corner",
  colorSpace: "srgb",
  blendMode: "normal",
  stops: [
    { color: "#0EA5E9", position: 0 },
    { color: "#8B5CF6", position: 52 },
    { color: "#F43F5E", position: 100 },
  ],
};
export const PRESETS = [
  ["#0EA5E9", "#8B5CF6", "#F43F5E"],
  ["#FDBA74", "#F43F5E", "#7C3AED"],
  ["#0F172A", "#0369A1", "#22D3EE"],
  ["#10B981", "#8B5CF6", "#EC4899"],
  ["#FECDD3", "#DDD6FE", "#BAE6FD"],
  ["#FDE047", "#84CC16", "#14B8A6"],
] as const;
export function preset(index: number): GradientLayer {
  const colors = PRESETS[index];
  if (!colors) throw new CssGeneratorError("invalid_config");
  return {
    ...DEFAULT_GRADIENT,
    stops: colors.map((color, i) => ({ color, position: i * 50 })),
  };
}
export function cssColor(input: string, format: "hex" | "rgba" = "rgba") {
  const c = parseColor(input);
  return format === "hex"
    ? hexColor(c, true)
    : `rgba(${c.r}, ${c.g}, ${c.b}, ${Number(c.a.toFixed(6))})`;
}
export function buildShadow(input: unknown) {
  const p = shadowSchema.safeParse(input);
  if (!p.success) throw new CssGeneratorError("invalid_config");
  const value = p.data.layers
    .map(
      (l) =>
        `${l.inset ? "inset " : ""}${l.offsetX}px ${l.offsetY}px ${l.blur}px ${l.spread}px ${cssColor(l.color)}`,
    )
    .join(", ");
  return { value, css: `box-shadow: ${value};` };
}
export function buildGradient(input: unknown) {
  const p = gradientSchema.safeParse(input);
  if (!p.success) throw new CssGeneratorError("invalid_config");
  const config = p.data;
  const backgroundImage = config.layers
    .map((l) => {
      const interpolation = l.colorSpace === "oklch" ? " in oklch" : "";
      const head =
        l.type === "linear"
          ? `${l.angle}deg${interpolation}`
          : l.type === "conic"
            ? `from ${l.angle}deg at ${l.centerX}% ${l.centerY}%${interpolation}`
            : `${l.radialShape} ${l.radialSize} at ${l.centerX}% ${l.centerY}%${interpolation}`;
      const stops = [...l.stops]
        .sort((a, b) => a.position - b.position)
        .map((s) => `${cssColor(s.color, config.format)} ${s.position}%`)
        .join(", ");
      return `${l.type}-gradient(${head}, ${stops})`;
    })
    .join(", ");
  const blendMode = config.layers.map((l) => l.blendMode).join(", ");
  return {
    backgroundImage,
    blendMode,
    background: `background: ${backgroundImage};`,
    css: `background-image: ${backgroundImage};\nbackground-blend-mode: ${blendMode};`,
    json: JSON.stringify(config, null, 2),
  };
}
export function importGradient(input: string) {
  if (input.length > 1000000) throw new CssGeneratorError("too_large");
  try {
    return gradientSchema.parse(JSON.parse(input));
  } catch {
    throw new CssGeneratorError("invalid_config");
  }
}
export function gradientSvg(input: unknown, width: number, height: number) {
  validateSize(width, height);
  const result = buildGradient(input);
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}"><foreignObject width="100%" height="100%"><div xmlns="http://www.w3.org/1999/xhtml" style="width:100%;height:100%;${result.css}"/></foreignObject></svg>`;
}
export function validateSize(width: number, height: number) {
  if (
    ![width, height].every((n) => Number.isInteger(n) && n > 0 && n <= 8192) ||
    width * height > 32000000
  )
    throw new CssGeneratorError("invalid_config");
}
export function randomLayer(
  layer: GradientLayer,
  // biome-ignore lint/style/noNonNullAssertion: validated fixed-width index or lookup invariant
  random = () => crypto.getRandomValues(new Uint32Array(1))[0]! / 4294967296,
): GradientLayer {
  return {
    ...layer,
    angle: Math.floor(random() * 361),
    stops: layer.stops.map((s) => ({
      ...s,
      color:
        "#" +
        Math.floor(random() * 16777216)
          .toString(16)
          .padStart(6, "0"),
    })),
  };
}
