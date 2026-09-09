export type ShadowConfig = {
  offsetX: number;
  offsetY: number;
  blur: number;
  spread: number;
  color: string;
  inset: boolean;
};

type Rgba = {
  r: number;
  g: number;
  b: number;
  a: number;
};

const MAX_CHANNEL = 255;
const FALLBACK_RGBA = "rgba(0, 0, 0, 0.2)";

export const DEFAULT_SHADOW_CONFIG: ShadowConfig = {
  offsetX: 0,
  offsetY: 8,
  blur: 24,
  spread: 0,
  color: "#00000033",
  inset: false,
};

function clampChannel(value: number) {
  return Math.min(MAX_CHANNEL, Math.max(0, Math.round(value)));
}

function clampAlpha(value: number) {
  return Math.min(1, Math.max(0, value));
}

function clampPercentage(value: number) {
  return Math.min(100, Math.max(0, Math.round(value)));
}

export function parseHexColor(value: string): Rgba | null {
  const normalized = value.trim().replace(/^#/, "");
  if (![3, 4, 6, 8].includes(normalized.length)) return null;

  let expanded = normalized.toLowerCase();
  if (expanded.length === 3 || expanded.length === 4) {
    expanded = expanded
      .split("")
      .map((character) => `${character}${character}`)
      .join("");
  }
  if (expanded.length === 6) expanded += "ff";
  if (!/^[0-9a-f]+$/i.test(expanded)) return null;

  const r = Number.parseInt(expanded.slice(0, 2), 16);
  const g = Number.parseInt(expanded.slice(2, 4), 16);
  const b = Number.parseInt(expanded.slice(4, 6), 16);
  const a = Number.parseInt(expanded.slice(6, 8), 16);
  return {
    r: clampChannel(r),
    g: clampChannel(g),
    b: clampChannel(b),
    a: clampAlpha(a / MAX_CHANNEL),
  };
}

export function rgbaToHex(color: Rgba, includeAlpha = true) {
  const channels = [
    clampChannel(color.r),
    clampChannel(color.g),
    clampChannel(color.b),
  ].map((channel) => channel.toString(16).padStart(2, "0").toUpperCase());
  if (includeAlpha) {
    channels.push(
      clampChannel(color.a * MAX_CHANNEL)
        .toString(16)
        .padStart(2, "0")
        .toUpperCase(),
    );
  }
  return `#${channels.join("")}`;
}

function formatRgba(color: Rgba) {
  const alpha = Number(clampAlpha(color.a).toFixed(3));
  return `rgba(${clampChannel(color.r)}, ${clampChannel(color.g)}, ${clampChannel(color.b)}, ${alpha})`;
}

export function formatShadowLayer(layer: ShadowConfig) {
  const parsedColor = parseHexColor(layer.color);
  const parts = [
    `${Math.round(layer.offsetX)}px`,
    `${Math.round(layer.offsetY)}px`,
    `${Math.max(0, Math.round(layer.blur))}px`,
    `${Math.round(layer.spread)}px`,
    parsedColor ? formatRgba(parsedColor) : FALLBACK_RGBA,
  ];
  if (layer.inset) parts.unshift("inset");
  return parts.join(" ");
}

export function buildBoxShadow(layers: readonly ShadowConfig[]) {
  return layers.length ? layers.map(formatShadowLayer).join(", ") : "none";
}

export function getOpaqueHexColor(value: string) {
  const parsed =
    parseHexColor(value) ?? parseHexColor(DEFAULT_SHADOW_CONFIG.color);
  return rgbaToHex(parsed as Rgba, false);
}

export function getAlphaPercentage(value: string) {
  const parsed =
    parseHexColor(value) ?? parseHexColor(DEFAULT_SHADOW_CONFIG.color);
  return clampPercentage((parsed?.a ?? 0.2) * 100);
}

export function updateHexColorRgb(currentColor: string, nextHex: string) {
  const reference =
    parseHexColor(currentColor) ?? parseHexColor(DEFAULT_SHADOW_CONFIG.color);
  const nextColor = parseHexColor(nextHex);
  if (!nextColor || !reference) return currentColor;
  return rgbaToHex({ ...nextColor, a: reference.a });
}

export function updateHexAlpha(
  currentColor: string,
  nextAlphaPercentage: number,
) {
  const reference =
    parseHexColor(currentColor) ?? parseHexColor(DEFAULT_SHADOW_CONFIG.color);
  return rgbaToHex({
    ...(reference as Rgba),
    a: clampPercentage(nextAlphaPercentage) / 100,
  });
}

export function normalizeShadowConfig(
  config: Partial<ShadowConfig> = {},
): ShadowConfig {
  return {
    offsetX: Number.isFinite(config.offsetX)
      ? Math.round(config.offsetX as number)
      : DEFAULT_SHADOW_CONFIG.offsetX,
    offsetY: Number.isFinite(config.offsetY)
      ? Math.round(config.offsetY as number)
      : DEFAULT_SHADOW_CONFIG.offsetY,
    blur: Number.isFinite(config.blur)
      ? Math.max(0, Math.round(config.blur as number))
      : DEFAULT_SHADOW_CONFIG.blur,
    spread: Number.isFinite(config.spread)
      ? Math.round(config.spread as number)
      : DEFAULT_SHADOW_CONFIG.spread,
    color: parseHexColor(config.color ?? "")
      ? (config.color as string)
      : DEFAULT_SHADOW_CONFIG.color,
    inset:
      typeof config.inset === "boolean"
        ? config.inset
        : DEFAULT_SHADOW_CONFIG.inset,
  };
}
