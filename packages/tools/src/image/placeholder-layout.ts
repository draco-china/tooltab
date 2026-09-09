import { isXmlText } from "./placeholder";

export type PlaceholderBackgroundType =
  | "solid"
  | "linear-gradient"
  | "radial-gradient";
export type PlaceholderExportFormat = "png" | "jpeg" | "svg" | "webp";
export type PlaceholderScale = 1 | 2 | 3;
export type PagePlaceholderOptions = {
  backgroundColor: string;
  backgroundType: PlaceholderBackgroundType;
  fontSize: number;
  gradientAngle: number;
  gradientColor1: string;
  gradientColor2: string;
  height: number;
  text: string;
  textColor: string;
  width: number;
};

export const PAGE_PLACEHOLDER_DEFAULTS: PagePlaceholderOptions = {
  backgroundColor: "#d4d4d8",
  backgroundType: "solid",
  fontSize: 0,
  gradientAngle: 45,
  gradientColor1: "#667eea",
  gradientColor2: "#764ba2",
  height: 600,
  text: "",
  textColor: "#52525b",
  width: 800,
};

const MAX_DIMENSION = 4096;
const MAX_FONT_SIZE = 500;

export function normalizePageOptions(
  options: Partial<PagePlaceholderOptions>,
): PagePlaceholderOptions {
  const width = clampInteger(
    options.width,
    PAGE_PLACEHOLDER_DEFAULTS.width,
    1,
    MAX_DIMENSION,
  );
  const height = clampInteger(
    options.height,
    PAGE_PLACEHOLDER_DEFAULTS.height,
    1,
    MAX_DIMENSION,
  );
  const fontSize = clampInteger(
    options.fontSize,
    PAGE_PLACEHOLDER_DEFAULTS.fontSize,
    0,
    MAX_FONT_SIZE,
  );
  const rawAngle = Number.isFinite(options.gradientAngle)
    ? // biome-ignore lint/style/noNonNullAssertion: validated fixed-width index or lookup invariant
      Math.round(options.gradientAngle!)
    : PAGE_PLACEHOLDER_DEFAULTS.gradientAngle;
  return {
    backgroundColor:
      options.backgroundColor ?? PAGE_PLACEHOLDER_DEFAULTS.backgroundColor,
    backgroundType:
      options.backgroundType ?? PAGE_PLACEHOLDER_DEFAULTS.backgroundType,
    fontSize,
    gradientAngle: ((rawAngle % 360) + 360) % 360,
    gradientColor1:
      options.gradientColor1 ?? PAGE_PLACEHOLDER_DEFAULTS.gradientColor1,
    gradientColor2:
      options.gradientColor2 ?? PAGE_PLACEHOLDER_DEFAULTS.gradientColor2,
    height,
    text: options.text ?? PAGE_PLACEHOLDER_DEFAULTS.text,
    textColor: options.textColor ?? PAGE_PLACEHOLDER_DEFAULTS.textColor,
    width,
  };
}

export function buildPlaceholderSvg(
  options: Partial<PagePlaceholderOptions>,
  scale: PlaceholderScale = 1,
) {
  const normalized = normalizePageOptions(options);
  const width = normalized.width * scale;
  const height = normalized.height * scale;
  const fontSize =
    (normalized.fontSize ||
      Math.round(Math.min(normalized.width, normalized.height) / 8)) * scale;
  const text = escapeXml(
    normalized.text.trim() || `${normalized.width} × ${normalized.height}`,
  );
  const background = buildBackground(normalized);
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">${background.defs}<rect width="100%" height="100%" fill="${background.fill}"/><text x="50%" y="50%" fill="${escapeXml(normalized.textColor)}" font-size="${fontSize}" font-family="system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif" text-anchor="middle" dominant-baseline="middle">${text}</text></svg>`;
}

export function buildPlaceholderPreviewDataUri(
  options: Partial<PagePlaceholderOptions>,
) {
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(buildPlaceholderSvg(options))}`;
}

export function buildPlaceholderFilename(
  options: Partial<PagePlaceholderOptions>,
  format: PlaceholderExportFormat,
  scale: PlaceholderScale,
) {
  const normalized = normalizePageOptions(options);
  const suffix = scale > 1 ? `@${scale}x` : "";
  return `placeholder-${normalized.width}x${normalized.height}${suffix}.${
    format === "jpeg" ? "jpg" : format
  }`;
}

export function resolvePlaceholderText(options: PagePlaceholderOptions) {
  return options.text.trim() || `${options.width} × ${options.height}`;
}

function buildBackground(options: PagePlaceholderOptions) {
  const color1 = escapeXml(options.gradientColor1);
  const color2 = escapeXml(options.gradientColor2);
  if (options.backgroundType === "linear-gradient")
    return {
      defs: `<defs><linearGradient id="placeholder-gradient" gradientTransform="rotate(${options.gradientAngle}, 0.5, 0.5)"><stop offset="0%" stop-color="${color1}"/><stop offset="100%" stop-color="${color2}"/></linearGradient></defs>`,
      fill: "url(#placeholder-gradient)",
    };
  if (options.backgroundType === "radial-gradient")
    return {
      defs: `<defs><radialGradient id="placeholder-gradient" cx="50%" cy="50%" r="50%"><stop offset="0%" stop-color="${color1}"/><stop offset="100%" stop-color="${color2}"/></radialGradient></defs>`,
      fill: "url(#placeholder-gradient)",
    };
  return { defs: "", fill: escapeXml(options.backgroundColor) };
}

function clampInteger(
  value: number | undefined,
  fallback: number,
  minimum: number,
  maximum: number,
) {
  if (!Number.isFinite(value)) return fallback;
  // biome-ignore lint/style/noNonNullAssertion: validated fixed-width index or lookup invariant
  return Math.min(maximum, Math.max(minimum, Math.round(value!)));
}

function escapeXml(value: string) {
  if (!isXmlText(value)) throw new Error("invalid_character");
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}
