import convert from "color-convert";
import names from "color-name";
export const CSS_KEYWORDS = Object.keys(names);
export const COLOR_FORMATS = [
  "hex",
  "rgb",
  "hsl",
  "hsv",
  "hwb",
  "lab",
  "lch",
  "cmyk",
  "keyword",
] as const;
export type ColorFormat = (typeof COLOR_FORMATS)[number];
export type Rgba = { r: number; g: number; b: number; a: number };
export class ColorError extends Error {
  constructor(public readonly code: "invalid_color" | "too_large") {
    super(code);
  }
}
const invalid = (): never => {
  throw new ColorError("invalid_color");
};
const clamp = (n: number, max = 255) => Math.min(max, Math.max(0, n));
function number(s: string) {
  if (!/^[+-]?(?:\d+\.?\d*|\.\d+)(?:e[+-]?\d+)?$/i.test(s)) return invalid();
  const n = Number(s);
  return Number.isFinite(n) && Math.abs(n) <= 1e9 ? n : invalid();
}
function percent(s: string) {
  return number(s.replace(/%$/, ""));
}
function range(n: number, min: number, max: number) {
  return n >= min && n <= max ? n : invalid();
}
function hue(s: string) {
  const unit = /(deg|grad|rad|turn)$/.exec(s)?.[0];
  const n = number(unit ? s.slice(0, -unit.length) : s);
  return (
    (((n *
      (unit === "turn"
        ? 360
        : unit === "rad"
          ? 180 / Math.PI
          : unit === "grad"
            ? 0.9
            : 1)) %
      360) +
      360) %
    360
  );
}
function rgba(rgb: readonly number[], a = 1): Rgba {
  return {
    // biome-ignore lint/style/noNonNullAssertion: validated fixed-width index or lookup invariant
    r: Math.round(clamp(rgb[0]!)),
    // biome-ignore lint/style/noNonNullAssertion: validated fixed-width index or lookup invariant
    g: Math.round(clamp(rgb[1]!)),
    // biome-ignore lint/style/noNonNullAssertion: validated fixed-width index or lookup invariant
    b: Math.round(clamp(rgb[2]!)),
    a: clamp(a, 1),
  };
}
export function parseColor(input: string, format?: ColorFormat): Rgba {
  if (input.length > 500) throw new ColorError("too_large");
  const s = input.trim().toLowerCase();
  if (format && !COLOR_FORMATS.includes(format)) return invalid();
  if ((!format || format === "keyword") && s === "transparent")
    return rgba([0, 0, 0], 0);
  if ((!format || format === "keyword") && Object.hasOwn(names, s))
    return rgba(names[s as keyof typeof names]);
  if (
    (!format || format === "hex") &&
    /^#?(?:[\da-f]{3,4}|[\da-f]{6}|[\da-f]{8})$/.test(s)
  ) {
    let hex = s.replace(/^#/, "");
    if (hex.length < 5) hex = Array.from(hex, (c) => c + c).join("");
    return rgba(
      [0, 2, 4].map((i) => Number.parseInt(hex.slice(i, i + 2), 16)),
      hex.length === 8 ? Number.parseInt(hex.slice(6), 16) / 255 : 1,
    );
  }
  const match = /^([a-z]+)\(([^()]*)\)$/.exec(s);
  if (!match) return invalid();
  if (
    ![
      "rgb",
      "rgba",
      "hsl",
      "hsla",
      "hsv",
      "hsva",
      "hwb",
      "lab",
      "lch",
      "cmyk",
      // biome-ignore lint/style/noNonNullAssertion: validated fixed-width index or lookup invariant
    ].includes(match[1]!)
  )
    return invalid();
  // biome-ignore lint/style/noNonNullAssertion: validated fixed-width index or lookup invariant
  const kind = match[1]!.replace(/a$/, ""),
    // biome-ignore lint/style/noNonNullAssertion: validated fixed-width index or lookup invariant
    body = match[2]!;
  if (
    !kind ||
    !["rgb", "hsl", "hsv", "hwb", "lab", "lch", "cmyk"].includes(kind) ||
    (format && kind !== format)
  )
    return invalid();
  const slash = body.split("/");
  if (slash.length > 2) return invalid();
  // biome-ignore lint/style/noNonNullAssertion: validated fixed-width index or lookup invariant
  const raw = slash[0]!.trim();
  const parts = raw.includes(",")
    ? raw.split(",").map((v) => v.trim())
    : raw.split(/\s+/);
  if (parts.some((v) => !v || /\s/.test(v))) return invalid();
  const supportsAlpha = ["rgb", "hsl", "hsv"].includes(kind);
  let alpha: string | undefined = slash[1]?.trim();
  if (slash.length === 2 && !alpha) return invalid();
  if (supportsAlpha && parts.length === 4 && alpha === undefined)
    alpha = parts.pop();
  if (!supportsAlpha && alpha !== undefined) return invalid();
  const a =
    alpha === undefined
      ? 1
      : clamp(alpha.endsWith("%") ? percent(alpha) / 100 : number(alpha), 1);
  if (parts.length !== (kind === "cmyk" ? 4 : 3)) return invalid();
  const [x, y, z] = parts;
  if (kind === "rgb")
    return rgba(
      parts.map((v) =>
        v.endsWith("%") ? (percent(v) * 255) / 100 : number(v),
      ),
      a,
    );
  if (kind === "hsl" || kind === "hsv" || kind === "hwb") {
    const h = hue(x),
      p = range(percent(y), 0, 100),
      q = range(percent(z), 0, 100);
    const rgb =
      kind === "hsl"
        ? convert.hsl.rgb.raw([h, p, q])
        : kind === "hsv"
          ? convert.hsv.rgb.raw([h, p, q])
          : convert.hwb.rgb.raw([h, p, q]);
    return rgba(rgb, a);
  }
  if (kind === "lab")
    return rgba(
      convert.lab.rgb.raw([range(number(x), 0, 100), number(y), number(z)]),
    );
  if (kind === "lch")
    return rgba(
      convert.lch.rgb.raw([
        range(number(x), 0, 100),
        range(number(y), 0, 1e9),
        range(number(z), 0, 360),
      ]),
    );
  const c = parts.map((v) => range(percent(v), 0, 100));
  // biome-ignore lint/style/noNonNullAssertion: validated fixed-width index or lookup invariant
  return rgba(convert.cmyk.rgb.raw([c[0]!, c[1]!, c[2]!, c[3]!]));
}
export function hexColor(c: Rgba, alpha = false) {
  return (
    "#" +
    [c.r, c.g, c.b, ...(alpha ? [c.a * 255] : [])]
      .map((v) => Math.round(v).toString(16).padStart(2, "0"))
      .join("")
      .toUpperCase()
  );
}
const dec = (n: number, d = 1) => String(Number(n.toFixed(d)));
export function colorValues(
  c: Rgba,
  showAlpha = true,
): Record<ColorFormat, string> {
  const rgb: [number, number, number] = [c.r, c.g, c.b];
  const hsl = convert.rgb.hsl(rgb),
    hsv = convert.rgb.hsv(rgb),
    hwb = convert.rgb.hwb(rgb),
    lab = convert.rgb.lab.raw(rgb),
    lch = convert.rgb.lch.raw(rgb),
    cmyk = convert.rgb.cmyk(rgb);
  const alpha = showAlpha ? `, ${dec(c.a, 3)}` : "";
  return {
    hex: hexColor(c, showAlpha),
    rgb: `rgb${showAlpha ? "a" : ""}(${rgb.join(", ")}${alpha})`,
    hsl: `hsl${showAlpha ? "a" : ""}(${hsl[0]}, ${hsl[1]}%, ${hsl[2]}%${alpha})`,
    hsv: `hsv${showAlpha ? "a" : ""}(${hsv[0]}, ${hsv[1]}%, ${hsv[2]}%${alpha})`,
    hwb: `hwb(${hwb[0]}, ${hwb[1]}%, ${hwb[2]}%)`,
    lab: `lab(${lab.map((n) => dec(n)).join(", ")})`,
    lch: `lch(${lch.map((n) => dec(n)).join(", ")})`,
    cmyk: `cmyk(${cmyk.map((n) => `${n}%`).join(", ")})`,
    keyword: convert.rgb.keyword(rgb),
  };
}
export function convertColor(
  input: string,
  format?: ColorFormat,
  showAlpha = true,
) {
  const color = parseColor(input, format);
  return { color, values: colorValues(color, showAlpha) };
}
export function relativeLuminance(c: Rgba) {
  const v = [c.r, c.g, c.b].map((n) => {
    const s = n / 255;
    return s <= 0.04045 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  });
  // biome-ignore lint/style/noNonNullAssertion: validated fixed-width index or lookup invariant
  return v[0]! * 0.2126 + v[1]! * 0.7152 + v[2]! * 0.0722;
}
function over(front: Rgba, back: Rgba): Rgba {
  return {
    r: front.r * front.a + back.r * (1 - front.a),
    g: front.g * front.a + back.g * (1 - front.a),
    b: front.b * front.a + back.b * (1 - front.a),
    a: 1,
  };
}
export function checkContrast(foreground: string, background: string) {
  const bg = over(parseColor(background), { r: 255, g: 255, b: 255, a: 1 }),
    fg = over(parseColor(foreground), bg);
  const f = relativeLuminance(fg),
    b = relativeLuminance(bg),
    ratio = (Math.max(f, b) + 0.05) / (Math.min(f, b) + 0.05);
  return {
    ratio,
    foreground: fg,
    background: bg,
    aaNormal: ratio >= 4.5,
    aaLarge: ratio >= 3,
    aaaNormal: ratio >= 7,
    aaaLarge: ratio >= 4.5,
  };
}
