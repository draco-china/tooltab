import { strToU8, zipSync } from "fflate";
import sharp from "sharp";
import * as z from "zod/v4";
import {
  encodePngIco,
  faviconHead,
  faviconManifest,
  faviconNames,
} from "@workspace/tools/image/favicon";
import type { WebpContext } from "./image-webp";
import type { Operation } from "./operation-contract";

const BASE64_LIMIT = 2 * 1024 * 1024;
const ENCODED_LIMIT = Math.ceil(BASE64_LIMIT / 3) * 4;
const color = z.string().regex(/^#[0-9a-f]{6}$/i);
const mimeType = z.enum([
  "image/png",
  "image/jpeg",
  "image/webp",
  "image/svg+xml",
]);
const sourceOverride = z.strictObject({
  source: z.string().max(ENCODED_LIMIT),
  sourceMimeType: mimeType,
});
const platform = z.strictObject({
  source: sourceOverride.optional(),
  margin: z.number().min(0).max(100).default(0),
  addBackground: z.boolean().default(false),
  backgroundColor: color.default("#ffffff"),
  backgroundRadius: z.number().min(0).max(100).default(0),
});
const iosPlatform = z.strictObject({
  source: sourceOverride.optional(),
  margin: z.number().min(0).max(100).default(0),
  backgroundColor: color.default("#ffffff"),
});
const pwaPlatform = platform.extend({
  maskableBackgroundColor: color.default("#ffffff"),
  maskableMargin: z.number().min(0).max(100).default(40),
});
const siteShape = {
  name: z.string().max(120).default("App"),
  shortName: z.string().max(60).default("App"),
  description: z.string().max(500).default(""),
  startUrl: z.string().max(500).default("/"),
  assetPath: z.string().max(500).default("/"),
  display: z
    .enum(["fullscreen", "standalone", "minimal-ui", "browser"])
    .default("standalone"),
  themeColor: color.default("#0066cc"),
  enableDarkThemeColor: z.boolean().default(true),
  darkThemeColor: color.default("#2997ff"),
  backgroundColor: color.default("#ffffff"),
  includeMaskable: z.boolean().default(true),
};
export const faviconAssetsInputSchema = z.strictObject({
  source: z.string().max(ENCODED_LIMIT),
  sourceMimeType: mimeType,
  ...siteShape,
  desktop: platform.default(() => platform.parse({})),
  ios: iosPlatform.default(() => iosPlatform.parse({})),
  pwa: pwaPlatform.default(() => pwaPlatform.parse({})),
  preserveSvg: z.boolean().default(true),
  optimizePng: z.boolean().default(true),
  delivery: z.enum(["metadata", "artifact"]).default("metadata"),
});
const baseOutput = {
  files: z.array(z.string()),
  manifest: z.record(z.string(), z.unknown()),
  headHtml: z.string(),
};
export const faviconAssetsOutputSchema = z.union([
  z.strictObject({ ...baseOutput, delivery: z.literal("metadata") }),
  z.strictObject({
    ...baseOutput,
    delivery: z.literal("artifact"),
    artifact: z.strictObject({
      id: z.string(),
      bytes: z.number(),
      mimeType: z.string(),
      filename: z.string(),
      expiresAt: z.number(),
      path: z.string().optional(),
      downloadUrl: z.string().optional(),
    }),
  }),
]);

export class FaviconAssetsError extends Error {
  constructor(
    readonly code: "invalid_source" | "too_large" | "artifact_required",
  ) {
    super(code);
  }
}

type DecodedSource = {
  bytes: Buffer;
  mimeType: z.infer<typeof mimeType>;
  width: number;
  height: number;
};

async function decodeSource(value: z.infer<typeof sourceOverride>) {
  if (!value.source || value.source.length % 4)
    throw new FaviconAssetsError("invalid_source");
  const bytes = Buffer.from(value.source, "base64");
  if (bytes.length > BASE64_LIMIT) throw new FaviconAssetsError("too_large");
  if (bytes.toString("base64") !== value.source)
    throw new FaviconAssetsError("invalid_source");
  const meta = await sharp(bytes, {
    failOn: "error",
    limitInputPixels: 16_777_216,
  })
    .metadata()
    .catch(() => {
      throw new FaviconAssetsError("invalid_source");
    });
  if (!meta.width || !meta.height)
    throw new FaviconAssetsError("invalid_source");
  const expectedFormat = {
    "image/png": "png",
    "image/jpeg": "jpeg",
    "image/webp": "webp",
    "image/svg+xml": "svg",
  }[value.sourceMimeType];
  if (meta.format !== expectedFormat)
    throw new FaviconAssetsError("invalid_source");
  return {
    bytes,
    mimeType: value.sourceMimeType,
    width: meta.width,
    height: meta.height,
  } satisfies DecodedSource;
}

function roundedRect(size: number, radius: number, fill: string) {
  return Buffer.from(
    `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}"><rect width="${size}" height="${size}" rx="${radius}" fill="${fill}"/></svg>`,
  );
}

async function renderPng(
  source: DecodedSource,
  size: number,
  options: {
    margin: number;
    background?: string;
    radius?: number;
    optimize: boolean;
  },
) {
  const drawable = Math.max(1, Math.round(size * (1 - options.margin / 100)));
  const icon = await sharp(source.bytes)
    .resize(drawable, drawable, { fit: "contain" })
    .png()
    .toBuffer({ resolveWithObject: true });
  const left = Math.round((size - icon.info.width) / 2);
  const top = Math.round((size - icon.info.height) / 2);
  const radius = options.background
    ? Math.round((options.radius ?? 0) * size * 0.005)
    : 0;
  const layers: Array<{
    input: Buffer;
    left?: number;
    top?: number;
    blend?: "dest-in";
  }> = [];
  if (options.background)
    layers.push({ input: roundedRect(size, radius, options.background) });
  layers.push({ input: icon.data, left, top });
  if (radius)
    layers.push({
      input: roundedRect(size, radius, "#ffffff"),
      blend: "dest-in",
    });
  return new Uint8Array(
    await sharp({
      create: {
        width: size,
        height: size,
        channels: 4,
        background: { r: 0, g: 0, b: 0, alpha: 0 },
      },
    })
      .composite(layers)
      .png({
        compressionLevel: options.optimize ? 9 : 6,
        effort: options.optimize ? 10 : 1,
      })
      .toBuffer(),
  );
}

export async function runFaviconAssets(
  value: unknown,
  signal?: AbortSignal,
  context?: WebpContext,
) {
  const input = faviconAssetsInputSchema.parse(value);
  signal?.throwIfAborted();
  const global = await decodeSource({
    source: input.source,
    sourceMimeType: input.sourceMimeType,
  });
  const desktop = input.desktop.source
    ? await decodeSource(input.desktop.source)
    : global;
  const ios = input.ios.source ? await decodeSource(input.ios.source) : global;
  const pwa = input.pwa.source ? await decodeSource(input.pwa.source) : global;
  signal?.throwIfAborted();
  const site = {
    name: input.name,
    shortName: input.shortName,
    description: input.description,
    startUrl: input.startUrl,
    assetPath: input.assetPath,
    display: input.display,
    themeColor: input.themeColor,
    enableDarkThemeColor: input.enableDarkThemeColor,
    darkThemeColor: input.darkThemeColor,
    backgroundColor: input.backgroundColor,
    includeMaskable: input.includeMaskable,
  };
  const includeSvg = input.preserveSvg && desktop.mimeType === "image/svg+xml";
  const result = {
    files: faviconNames(site.includeMaskable, includeSvg),
    manifest: faviconManifest(site),
    headHtml: faviconHead(site, includeSvg),
  };
  if (input.delivery === "metadata")
    return { ...result, delivery: "metadata" as const };
  if (!context) throw new FaviconAssetsError("artifact_required");

  const files: Record<string, Uint8Array> = {};
  const desktopOptions = {
    margin: input.desktop.margin,
    background: input.desktop.addBackground
      ? input.desktop.backgroundColor
      : undefined,
    radius: input.desktop.backgroundRadius,
    optimize: input.optimizePng,
  };
  const desktopPng = new Map<number, Uint8Array>();
  for (const size of [16, 32, 48]) {
    signal?.throwIfAborted();
    desktopPng.set(size, await renderPng(desktop, size, desktopOptions));
  }
  files["favicon-16x16.png"] = desktopPng.get(16) as Uint8Array;
  files["favicon-32x32.png"] = desktopPng.get(32) as Uint8Array;
  files["favicon.ico"] = encodePngIco(
    [16, 32, 48].map((size) => ({
      size,
      bytes: desktopPng.get(size) as Uint8Array,
    })),
  );
  if (includeSvg) files["favicon.svg"] = new Uint8Array(desktop.bytes);
  files["apple-touch-icon.png"] = await renderPng(ios, 180, {
    margin: input.ios.margin,
    background: input.ios.backgroundColor,
    optimize: input.optimizePng,
  });
  for (const size of [192, 512]) {
    signal?.throwIfAborted();
    files[`pwa-${size}x${size}.png`] = await renderPng(pwa, size, {
      margin: input.pwa.margin,
      background: input.pwa.addBackground
        ? input.pwa.backgroundColor
        : undefined,
      radius: input.pwa.backgroundRadius,
      optimize: input.optimizePng,
    });
    if (site.includeMaskable)
      files[`pwa-maskable-${size}x${size}.png`] = await renderPng(pwa, size, {
        margin: input.pwa.maskableMargin,
        background: input.pwa.maskableBackgroundColor,
        optimize: input.optimizePng,
      });
  }
  files["site.webmanifest"] = strToU8(
    `${JSON.stringify(result.manifest, null, 2)}\n`,
  );
  files["head.html"] = strToU8(`${result.headHtml}\n`);
  signal?.throwIfAborted();
  const zip = zipSync(files, { level: input.optimizePng ? 9 : 6 });
  const artifact = await context.artifacts.write(
    (async function* () {
      yield zip;
    })(),
    {
      filename: "favicon-assets.zip",
      mimeType: "application/zip",
      limit: 8 * 1024 * 1024,
    },
    signal,
  );
  return {
    ...result,
    delivery: "artifact" as const,
    artifact: {
      id: artifact.id,
      bytes: artifact.bytes,
      mimeType: artifact.mimeType,
      filename: artifact.filename,
      expiresAt: artifact.expiresAt,
      ...(context.transport === "mcp"
        ? { path: artifact.path }
        : { downloadUrl: `/api/v1/artifacts/${artifact.id}` }),
    },
  };
}

export const faviconAssetsOperation: Operation = {
  id: "favicon-assets-generator",
  name: "tooltab_generate_favicon_assets",
  description:
    "Generate configurable Desktop favicon PNG/ICO files, an optional original SVG, an Apple touch icon, PWA any and maskable icons, a web manifest, head markup and an optional ZIP artifact. Each platform can use its own Base64 PNG, JPEG, WebP or SVG source and margin/background settings. Metadata and artifact delivery are public and require no authentication.",
  inputSchema: faviconAssetsInputSchema,
  outputSchema: faviconAssetsOutputSchema,
  bodyLimit: ENCODED_LIMIT * 4 + 32_768,
  idempotent: false,
  run: (input, signal, context) => runFaviconAssets(input, signal, context),
};
