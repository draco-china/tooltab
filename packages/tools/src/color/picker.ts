import {
  COLOR_FORMATS,
  type ColorFormat,
  colorValues,
  hexColor,
  parseColor,
  type Rgba,
} from "./convert";

export const PICKER_FORMATS = [
  "hex",
  "rgb",
  "hsl",
  "hsv",
  "cmyk",
  "oklch",
] as const;
export const PICKER_INPUT_FORMATS = [...COLOR_FORMATS, "oklch"] as const;
export type PickerInputFormat = ColorFormat | "oklch";
export type PickerValue = (typeof PICKER_FORMATS)[number] | "alpha";

export class ColorPickerError extends Error {
  constructor(public readonly code: "invalid_color" | "too_large") {
    super(code);
  }
}

const clamp = (value: number, max = 1) => Math.min(max, Math.max(0, value));
const round = (value: number, places = 4) =>
  Number(value.toFixed(places)).toString();
const srgbToLinear = (value: number) => {
  const channel = value / 255;
  return channel <= 0.04045
    ? channel / 12.92
    : ((channel + 0.055) / 1.055) ** 2.4;
};
const linearToSrgb = (value: number) =>
  255 *
  (value <= 0.0031308 ? 12.92 * value : 1.055 * value ** (1 / 2.4) - 0.055);

export function rgbaToOklch(color: Rgba, showAlpha = true) {
  const r = srgbToLinear(color.r);
  const g = srgbToLinear(color.g);
  const b = srgbToLinear(color.b);
  const l = Math.cbrt(0.4122214708 * r + 0.5363325363 * g + 0.0514459929 * b);
  const m = Math.cbrt(0.2119034982 * r + 0.6806995451 * g + 0.1073969566 * b);
  const s = Math.cbrt(0.0883024619 * r + 0.2817188376 * g + 0.6299787005 * b);
  const lightness = 0.2104542553 * l + 0.793617785 * m - 0.0040720468 * s;
  const a = 1.9779984951 * l - 2.428592205 * m + 0.4505937099 * s;
  const axisB = 0.0259040371 * l + 0.7827717662 * m - 0.808675766 * s;
  const chroma = Math.hypot(a, axisB);
  const hue = chroma < 0.000004 ? 0 : (Math.atan2(axisB, a) * 180) / Math.PI;
  const normalizedHue = ((hue % 360) + 360) % 360;
  const alpha = showAlpha ? ` / ${round(clamp(color.a), 3)}` : "";
  return `oklch(${round(lightness * 100, 2)}% ${round(chroma)} ${round(normalizedHue, 2)}${alpha})`;
}

function number(value: string) {
  if (!/^[+-]?(?:\d+\.?\d*|\.\d+)$/.test(value))
    throw new ColorPickerError("invalid_color");
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) throw new ColorPickerError("invalid_color");
  return parsed;
}

export function parseOklch(input: string) {
  const match = /^oklch\((.*)\)$/i.exec(input.trim());
  if (!match) throw new ColorPickerError("invalid_color");
  const divided = match[1].split("/");
  if (divided.length > 2) throw new ColorPickerError("invalid_color");
  const parts = divided[0].trim().split(/\s+/);
  if (parts.length !== 3) throw new ColorPickerError("invalid_color");
  const lightness = parts[0].endsWith("%")
    ? number(parts[0].slice(0, -1)) / 100
    : number(parts[0]);
  const chroma = number(parts[1]);
  const hue = number(parts[2].replace(/deg$/i, ""));
  const alphaPart = divided[1]?.trim();
  const alpha = alphaPart
    ? alphaPart.endsWith("%")
      ? number(alphaPart.slice(0, -1)) / 100
      : number(alphaPart)
    : 1;
  if (
    lightness < 0 ||
    lightness > 1 ||
    chroma < 0 ||
    chroma > 10 ||
    hue < -1e6 ||
    hue > 1e6 ||
    alpha < 0 ||
    alpha > 1
  )
    throw new ColorPickerError("invalid_color");
  const radians = (hue * Math.PI) / 180;
  const a = chroma * Math.cos(radians);
  const axisB = chroma * Math.sin(radians);
  const l = (lightness + 0.3963377774 * a + 0.2158037573 * axisB) ** 3;
  const m = (lightness - 0.1055613458 * a - 0.0638541728 * axisB) ** 3;
  const s = (lightness - 0.0894841775 * a - 1.291485548 * axisB) ** 3;
  const raw = [
    linearToSrgb(4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s),
    linearToSrgb(-1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s),
    linearToSrgb(-0.0041960863 * l - 0.7034186147 * m + 1.707614701 * s),
  ];
  const gamutClipped = raw.some((channel) => channel < 0 || channel > 255);
  return {
    color: {
      r: Math.round(clamp(raw[0], 255)),
      g: Math.round(clamp(raw[1], 255)),
      b: Math.round(clamp(raw[2], 255)),
      a: alpha,
    },
    gamutClipped,
  };
}

export function parsePickerColor(input: string, format?: PickerInputFormat) {
  if (input.length > 500) throw new ColorPickerError("too_large");
  if (format === "oklch" || (!format && /^oklch\(/i.test(input.trim())))
    return parseOklch(input);
  try {
    return { color: parseColor(input, format), gamutClipped: false };
  } catch {
    throw new ColorPickerError("invalid_color");
  }
}

export function pickerValues(color: Rgba, showAlpha = true) {
  const values = colorValues(color, showAlpha);
  return {
    hex: hexColor(color, showAlpha),
    rgb: values.rgb,
    hsl: values.hsl,
    hsv: values.hsv,
    cmyk: values.cmyk,
    oklch: rgbaToOklch(color, showAlpha),
    alpha: `${Math.round(clamp(color.a) * 100)}%`,
  } satisfies Record<PickerValue, string>;
}

export function convertPickerColor(
  input: string,
  format?: PickerInputFormat,
  showAlpha = true,
) {
  const { color, gamutClipped } = parsePickerColor(input, format);
  return {
    capability: "color-conversion" as const,
    screenAccess: false as const,
    color,
    values: pickerValues(color, showAlpha),
    gamutClipped,
  };
}
