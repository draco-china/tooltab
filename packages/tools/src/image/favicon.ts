export type DisplayMode =
  | "fullscreen"
  | "standalone"
  | "minimal-ui"
  | "browser";

export type FaviconSite = Readonly<{
  name: string;
  shortName: string;
  description: string;
  startUrl: string;
  assetPath: string;
  display?: DisplayMode;
  themeColor: string;
  enableDarkThemeColor?: boolean;
  darkThemeColor: string;
  backgroundColor: string;
  includeMaskable: boolean;
}>;

export type PlatformIconConfig = Readonly<{
  useDifferentImage: boolean;
  margin: number;
  addBackground: boolean;
  backgroundColor: string;
  backgroundRadius: number;
}>;

export type PwaIconConfig = PlatformIconConfig &
  Readonly<{
    maskableBackgroundColor: string;
    maskableMargin: number;
  }>;

export const faviconSizes = [16, 32, 48, 180, 192, 512] as const;

export const defaultPlatformIconConfig: PlatformIconConfig = {
  useDifferentImage: false,
  margin: 0,
  addBackground: false,
  backgroundColor: "#ffffff",
  backgroundRadius: 0,
};

export const defaultPwaIconConfig: PwaIconConfig = {
  ...defaultPlatformIconConfig,
  maskableBackgroundColor: "#ffffff",
  maskableMargin: 40,
};

export function clampPercent(value: number) {
  return Number.isFinite(value) ? Math.min(100, Math.max(0, value)) : 0;
}

export function squareLayout(
  sourceWidth: number,
  sourceHeight: number,
  targetSize: number,
  margin: number,
) {
  const safeWidth = Math.max(1, sourceWidth);
  const safeHeight = Math.max(1, sourceHeight);
  const size = Math.max(1, Math.round(targetSize));
  const drawable = Math.max(1, size * (1 - clampPercent(margin) / 100));
  const scale = drawable / Math.max(safeWidth, safeHeight);
  const width = Math.max(1, Math.round(safeWidth * scale));
  const height = Math.max(1, Math.round(safeHeight * scale));
  return {
    x: Math.round((size - width) / 2),
    y: Math.round((size - height) / 2),
    width,
    height,
  };
}

export function normalizePath(value: string) {
  const trimmed = value.trim() || "/";
  const leading = trimmed.startsWith("/") ? trimmed : `/${trimmed}`;
  return leading.endsWith("/") ? leading : `${leading}/`;
}

export function faviconManifest(site: FaviconSite) {
  const path = normalizePath(site.assetPath);
  const icons = [
    {
      src: `${path}pwa-192x192.png`,
      sizes: "192x192",
      type: "image/png",
      purpose: "any",
    },
    {
      src: `${path}pwa-512x512.png`,
      sizes: "512x512",
      type: "image/png",
      purpose: "any",
    },
  ];
  if (site.includeMaskable) {
    icons.push(
      {
        src: `${path}pwa-maskable-192x192.png`,
        sizes: "192x192",
        type: "image/png",
        purpose: "maskable",
      },
      {
        src: `${path}pwa-maskable-512x512.png`,
        sizes: "512x512",
        type: "image/png",
        purpose: "maskable",
      },
    );
  }
  return {
    name: site.name.trim() || "App",
    short_name: site.shortName.trim() || site.name.trim() || "App",
    ...(site.description.trim()
      ? { description: site.description.trim() }
      : {}),
    icons,
    start_url: site.startUrl.trim() || "/",
    display: site.display ?? "standalone",
    background_color: site.backgroundColor,
    theme_color: site.themeColor,
  };
}

const escapeAttribute = (value: string) =>
  value
    .replaceAll("&", "&amp;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;");

export function faviconHead(site: FaviconSite, includeSvg = false) {
  const path = escapeAttribute(normalizePath(site.assetPath));
  const light = escapeAttribute(site.themeColor);
  const colors =
    site.enableDarkThemeColor === false
      ? [`<meta name="theme-color" content="${light}">`]
      : [
          `<meta name="theme-color" content="${light}" media="(prefers-color-scheme: light)">`,
          `<meta name="theme-color" content="${escapeAttribute(site.darkThemeColor)}" media="(prefers-color-scheme: dark)">`,
        ];
  return [
    `<link rel="icon" type="image/x-icon" href="${path}favicon.ico">`,
    `<link rel="icon" type="image/png" sizes="16x16" href="${path}favicon-16x16.png">`,
    `<link rel="icon" type="image/png" sizes="32x32" href="${path}favicon-32x32.png">`,
    ...(includeSvg
      ? [`<link rel="icon" type="image/svg+xml" href="${path}favicon.svg">`]
      : []),
    `<link rel="apple-touch-icon" href="${path}apple-touch-icon.png">`,
    `<link rel="manifest" href="${path}site.webmanifest">`,
    ...colors,
  ].join("\n");
}

export function faviconNames(includeMaskable: boolean, includeSvg = false) {
  return [
    "favicon.ico",
    "favicon-16x16.png",
    "favicon-32x32.png",
    ...(includeSvg ? ["favicon.svg"] : []),
    "apple-touch-icon.png",
    "pwa-192x192.png",
    "pwa-512x512.png",
    ...(includeMaskable
      ? ["pwa-maskable-192x192.png", "pwa-maskable-512x512.png"]
      : []),
    "site.webmanifest",
    "head.html",
  ];
}

export function encodePngIco(
  entries: readonly { size: number; bytes: Uint8Array }[],
) {
  const header = 6 + entries.length * 16;
  const output = new Uint8Array(
    header + entries.reduce((sum, entry) => sum + entry.bytes.length, 0),
  );
  const view = new DataView(output.buffer);
  view.setUint16(2, 1, true);
  view.setUint16(4, entries.length, true);
  let offset = header;
  entries.forEach((entry, index) => {
    const at = 6 + index * 16;
    output[at] = entry.size >= 256 ? 0 : entry.size;
    output[at + 1] = entry.size >= 256 ? 0 : entry.size;
    view.setUint16(at + 4, 1, true);
    view.setUint16(at + 6, 32, true);
    view.setUint32(at + 8, entry.bytes.length, true);
    view.setUint32(at + 12, offset, true);
    output.set(entry.bytes, offset);
    offset += entry.bytes.length;
  });
  return output;
}
