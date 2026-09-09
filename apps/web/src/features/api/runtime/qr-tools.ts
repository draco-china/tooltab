import { readFile } from "node:fs/promises";
import sharp from "sharp";
import { z } from "zod";
import { validateSvg } from "@workspace/tools/image/svg";
import { qrPixels } from "@workspace/tools/encoding/qr-pixels";
import {
  QR_IMAGE_LIMIT,
  QR_PIXEL_LIMIT,
  QrError,
  qrContentSchema,
  qrOptionsSchema,
} from "@workspace/tools/encoding/qr-contract";
import { runQrWorker } from "@/features/tools/qr-tools/worker-client";
import { readAuthorizedFile } from "./files";
import { decodeImageCarrier } from "./image-resizer";
import type { WebpContext } from "./image-webp";
import type { Operation } from "./operation-contract";
import { serverSvgXml } from "./svg-image";
import { serviceWorkerUrl } from "./worker-url";
export const qrGenerateSchema = z.strictObject({
  content: qrContentSchema,
  options: qrOptionsSchema.optional(),
  format: z.enum(["png", "jpeg", "webp", "svg"]).default("png"),
});
export const qrReadSchema = z.union([
  z.strictObject({ input: z.string().max(Math.ceil(QR_IMAGE_LIMIT / 3) * 4) }),
  z.strictObject({ inputUploadId: z.uuid() }),
]);
export const qrReadMcpSchema = z.union([
  qrReadSchema,
  z.strictObject({ inputPath: z.string().min(1).max(4096) }),
]);
export const qrGenerateOutputSchema = z.strictObject({
  payload: z.string(),
  output: z.string(),
  encoding: z.literal("base64"),
  mimeType: z.string(),
  width: z.number(),
  height: z.number(),
  modules: z.number(),
  bytes: z.number(),
});
export const qrReadOutputSchema = z.strictObject({
  found: z.boolean(),
  result: z
    .strictObject({
      data: z.string(),
      width: z.number(),
      height: z.number(),
      kind: z.string(),
      href: z.string().nullable(),
    })
    .nullable(),
});
export async function runQrGenerate(input: unknown, signal?: AbortSignal) {
  const p = qrGenerateSchema.parse(input),
    options = qrOptionsSchema.parse(p.options ?? {});
  const matrix = await runQrWorker(
    { kind: "generate", content: p.content, options },
    signal,
    import.meta.env.PROD
      ? () =>
          new Worker(serviceWorkerUrl("qr-tools-worker", import.meta.url), {
            type: "module",
          })
      : undefined,
  );
  signal?.throwIfAborted();
  let bytes: Buffer,
    width = options.size,
    height = options.size;
  if (p.format === "svg") bytes = Buffer.from(matrix.svg);
  else {
    const pixels = qrPixels(matrix, options);
    width = pixels.width;
    height = pixels.height;
    const encoder = sharp(pixels.data, {
      raw: { width, height, channels: 4 },
    }).toFormat(p.format, { quality: 92 });
    const abort = () =>
      encoder.destroy(new DOMException("Aborted", "AbortError"));
    signal?.addEventListener("abort", abort, { once: true });
    try {
      bytes = await encoder.toBuffer();
      signal?.throwIfAborted();
    } finally {
      signal?.removeEventListener("abort", abort);
      pixels.data.fill(0);
      encoder.destroy();
    }
  }
  return {
    payload: matrix.payload,
    output: bytes.toString("base64"),
    encoding: "base64" as const,
    mimeType: p.format === "svg" ? "image/svg+xml" : `image/${p.format}`,
    width,
    height,
    modules: matrix.count,
    bytes: bytes.length,
  };
}
async function readQrInput(
  input: unknown,
  signal?: AbortSignal,
  context?: WebpContext,
) {
  signal?.throwIfAborted();
  const p = (
    context?.transport === "mcp" ? qrReadMcpSchema : qrReadSchema
  ).parse(input);
  let bytes: Buffer;
  if ("input" in p) bytes = decodeImageCarrier(p.input, QR_IMAGE_LIMIT);
  else if ("inputPath" in p)
    bytes = Buffer.from(
      await readAuthorizedFile(p.inputPath, context?.inputRoots ?? [], signal),
    );
  else {
    if (!context) throw new QrError("invalid_input");
    const record = await context.artifacts.get(p.inputUploadId, "upload");
    if (record.bytes > QR_IMAGE_LIMIT) throw new QrError("too_large");
    bytes = await readFile(record.path, { signal });
  }
  if (bytes.length > QR_IMAGE_LIMIT) throw new QrError("too_large");
  const first = bytes.findIndex((value) => value > 32);
  if (
    (bytes[0] === 255 && bytes[1] === 254) ||
    (bytes[0] === 254 && bytes[1] === 255)
  )
    throw new QrError("invalid_input");
  if (
    bytes[first] === 60 ||
    (bytes[0] === 239 && bytes[1] === 187 && bytes[2] === 191)
  ) {
    try {
      validateSvg(bytes.toString("utf8"), serverSvgXml);
    } catch {
      throw new QrError("invalid_input");
    }
  }
  const decoder = sharp(bytes, {
    limitInputPixels: QR_PIXEL_LIMIT,
    limitInputChannels: 4,
    pages: 1,
    failOn: "warning",
  })
    .rotate()
    .toColourspace("srgb")
    .ensureAlpha()
    .raw();
  const abort = () =>
    decoder.destroy(new DOMException("Aborted", "AbortError"));
  signal?.addEventListener("abort", abort, { once: true });
  try {
    const { data, info } = await decoder.toBuffer({ resolveWithObject: true });
    signal?.throwIfAborted();
    try {
      const result = await runQrWorker(
        {
          kind: "read",
          data: new Uint8ClampedArray(
            data.buffer,
            data.byteOffset,
            data.byteLength,
          ),
          width: info.width,
          height: info.height,
        },
        signal,
        import.meta.env.PROD
          ? () =>
              new Worker(serviceWorkerUrl("qr-tools-worker", import.meta.url), {
                type: "module",
              })
          : undefined,
      );
      return { found: result !== null, result };
    } finally {
      data.fill(0);
    }
  } catch (error) {
    signal?.throwIfAborted();
    if (error instanceof QrError) throw error;
    throw new QrError(
      error instanceof Error && /pixel|limit/i.test(error.message)
        ? "too_large"
        : "decode_failed",
    );
  } finally {
    signal?.removeEventListener("abort", abort);
    decoder.destroy();
  }
}
let reading = 0;
export async function runQrRead(
  input: unknown,
  signal?: AbortSignal,
  context?: WebpContext,
) {
  signal?.throwIfAborted();
  if (reading >= 2) throw new QrError("busy");
  reading++;
  try {
    return await readQrInput(input, signal, context);
  } finally {
    reading--;
  }
}
export const qrOperations: Operation[] = [
  {
    id: "qr-code-generator",
    name: "tooltab_qr_code_generator",
    description:
      "Generate actual QR code image bytes locally for all eight content modes and four output formats. Never persists or sends content.",
    inputSchema: qrGenerateSchema,
    outputSchema: qrGenerateOutputSchema,
    bodyLimit: 1000000,
    idempotent: true,
    run: runQrGenerate,
  },
  {
    id: "qr-code-reader",
    name: "tooltab_qr_code_reader",
    description:
      "Read a QR code from actual local image bytes. Never opens decoded links. Camera capture remains an explicit browser-only capability.",
    inputSchema: qrReadSchema,
    outputSchema: qrReadOutputSchema,
    bodyLimit: Math.ceil(QR_IMAGE_LIMIT / 3) * 4 + 4096,
    idempotent: true,
    run: runQrRead,
  },
];
