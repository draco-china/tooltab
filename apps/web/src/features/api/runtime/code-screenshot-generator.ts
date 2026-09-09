import * as z from "zod/v4";
import {
  backgroundPresets,
  CODE_SCREENSHOT_MAX_INPUT,
  CODE_SCREENSHOT_MAX_PIXELS,
  CodeScreenshotError,
  type CodeScreenshotOptions,
  codeScreenshotLanguages,
  codeThemes,
  defaultCodeScreenshotOptions,
} from "@workspace/tools/image/code-screenshot";
import { renderCodeScreenshotServer } from "@/features/tools/code-screenshot-generator/server-worker-client";
import type { WebpContext } from "./image-webp";
import type { Operation } from "./operation-contract";
import { serviceWorkerUrl } from "./worker-url";

const formats = ["png", "jpeg", "webp", "svg", "html"] as const;
const optionShape = {
  code: z.string().min(1).max(CODE_SCREENSHOT_MAX_INPUT),
  language: z
    .enum(codeScreenshotLanguages)
    .default(defaultCodeScreenshotOptions.language),
  renderMode: z
    .enum(["highlight", "plain"])
    .default(defaultCodeScreenshotOptions.renderMode),
  theme: z
    .enum(
      Object.keys(codeThemes) as [
        keyof typeof codeThemes,
        ...(keyof typeof codeThemes)[],
      ],
    )
    .default(defaultCodeScreenshotOptions.theme),
  backgroundMode: z
    .enum(["preset", "solid", "transparent", "none"])
    .default(defaultCodeScreenshotOptions.backgroundMode),
  backgroundPreset: z
    .enum(
      Object.keys(backgroundPresets) as [
        keyof typeof backgroundPresets,
        ...(keyof typeof backgroundPresets)[],
      ],
    )
    .default(defaultCodeScreenshotOptions.backgroundPreset),
  backgroundColor: z
    .string()
    .regex(/^#[0-9a-f]{6}$/i)
    .default(defaultCodeScreenshotOptions.backgroundColor),
  windowStyle: z
    .enum(["mac", "windows", "none"])
    .default(defaultCodeScreenshotOptions.windowStyle),
  lineNumbers: z.boolean().default(defaultCodeScreenshotOptions.lineNumbers),
  fontSize: z
    .number()
    .int()
    .min(10)
    .max(32)
    .default(defaultCodeScreenshotOptions.fontSize),
  lineHeight: z
    .number()
    .min(1)
    .max(2.2)
    .default(defaultCodeScreenshotOptions.lineHeight),
  cardPadding: z
    .number()
    .int()
    .min(8)
    .max(80)
    .default(defaultCodeScreenshotOptions.cardPadding),
  framePadding: z
    .number()
    .int()
    .min(0)
    .max(120)
    .default(defaultCodeScreenshotOptions.framePadding),
  radius: z
    .number()
    .int()
    .min(0)
    .max(40)
    .default(defaultCodeScreenshotOptions.radius),
  shadow: z.boolean().default(defaultCodeScreenshotOptions.shadow),
  tabSize: z
    .number()
    .int()
    .min(1)
    .max(8)
    .default(defaultCodeScreenshotOptions.tabSize),
  format: z.enum(formats).default("png"),
  scale: z.number().int().min(1).max(3).default(2),
  quality: z.number().int().min(1).max(100).default(94),
  delivery: z.enum(["inline", "artifact"]).default("artifact"),
  filename: z.string().min(1).max(100).default("code-shot"),
};
export const codeScreenshotInputSchema = z.strictObject(optionShape);
const artifactSchema = z.strictObject({
  id: z.string(),
  bytes: z.number().int().positive(),
  mimeType: z.string(),
  filename: z.string(),
  expiresAt: z.number(),
  path: z.string().optional(),
  downloadUrl: z.string().optional(),
});
const facts = {
  format: z.enum(formats),
  width: z.number().int().positive(),
  height: z.number().int().positive(),
  lines: z.number().int().positive(),
  bytes: z.number().int().positive(),
  renderer: z.literal("server-canvas"),
  fontFamily: z.literal("system-monospace"),
};
export const codeScreenshotOutputSchema = z.union([
  z.strictObject({
    ...facts,
    delivery: z.literal("inline"),
    encoding: z.literal("base64"),
    output: z.string(),
  }),
  z.strictObject({
    ...facts,
    delivery: z.literal("artifact"),
    artifact: artifactSchema,
  }),
]);
const mimeTypes = {
  png: "image/png",
  jpeg: "image/jpeg",
  webp: "image/webp",
  svg: "image/svg+xml",
  html: "text/html;charset=utf-8",
} as const;
function filename(value: string, format: (typeof formats)[number]) {
  const stem =
    value
      .trim()
      .replace(/[^a-z0-9._-]+/gi, "-")
      .replace(/^[-.]+|[-.]+$/g, "")
      .slice(0, 80) || "code-shot";
  return `${stem.replace(/\.(png|jpe?g|webp|svg|html)$/i, "")}.${format === "jpeg" ? "jpg" : format}`;
}
export async function runCodeScreenshot(
  input: unknown,
  signal?: AbortSignal,
  context?: WebpContext,
) {
  const checked = codeScreenshotInputSchema.safeParse(input);
  if (!checked.success) throw new CodeScreenshotError("invalid_input");
  const parsed = checked.data;
  const {
    format,
    scale,
    quality,
    delivery,
    filename: requestedName,
    ...rawOptions
  } = parsed;
  const options = rawOptions as CodeScreenshotOptions;
  const result = await renderCodeScreenshotServer(
    { options, format, scale, quality },
    signal,
    import.meta.env.PROD
      ? () =>
          new Worker(
            serviceWorkerUrl("code-screenshot-server-worker", import.meta.url),
            { type: "module" },
          )
      : undefined,
  );
  signal?.throwIfAborted();
  if (result.width * result.height > CODE_SCREENSHOT_MAX_PIXELS * 2)
    throw new CodeScreenshotError("too_large");
  const max = delivery === "inline" ? 8 * 1024 * 1024 : 32 * 1024 * 1024;
  if (!result.output.length || result.output.length > max)
    throw new CodeScreenshotError("output_too_large");
  const common = {
    format,
    width: result.width,
    height: result.height,
    lines: result.lines,
    bytes: result.output.length,
    renderer: "server-canvas" as const,
    fontFamily: "system-monospace" as const,
  };
  if (delivery === "inline")
    return {
      ...common,
      delivery: "inline" as const,
      encoding: "base64" as const,
      output: Buffer.from(result.output).toString("base64"),
    };
  if (!context) throw new CodeScreenshotError("unsupported");
  const record = await context.artifacts.write(
    [result.output],
    {
      limit: 32 * 1024 * 1024,
      mimeType: mimeTypes[format],
      filename: filename(requestedName, format),
    },
    signal,
  );
  return {
    ...common,
    delivery: "artifact" as const,
    artifact: {
      id: record.id,
      bytes: record.bytes,
      mimeType: record.mimeType,
      filename: record.filename,
      expiresAt: record.expiresAt,
      ...(context.transport === "mcp"
        ? { path: record.path }
        : { downloadUrl: `/api/v1/artifacts/${record.id}` }),
    },
  };
}
export const codeScreenshotOperation: Operation = {
  id: "code-screenshot-generator",
  name: "tooltab_code_screenshot_generator",
  description:
    "Render code as PNG, JPEG, WebP, SVG or HTML with syntax highlighting, code themes, backgrounds, window chrome and line numbers. Server rendering uses a bounded isolated Canvas worker and system monospace fonts; no browser capture, network font fetch, or Bearer token is required. Inline output is limited to 8 MiB; artifacts to 32 MiB and expire after one hour.",
  inputSchema: codeScreenshotInputSchema,
  outputSchema: codeScreenshotOutputSchema,
  bodyLimit: 150_000,
  idempotent: false,
  run: (input, signal, context) => runCodeScreenshot(input, signal, context),
};
