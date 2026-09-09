import { readFile } from "node:fs/promises";
import sharp from "sharp";
import { z } from "zod";

import {
  BARCODE_IMAGE_LIMIT,
  BARCODE_PIXEL_LIMIT,
  BarcodeError,
  barcodeOptionsSchema,
} from "@workspace/tools/encoding/barcode-contract";
import { validateSvg } from "@workspace/tools/image/svg";
import { runBarcodeWorker } from "./barcode-worker-client";
import { readAuthorizedFile } from "./files";
import { decodeImageCarrier } from "./image-resizer";
import type { WebpContext } from "./image-webp";
import type { Operation } from "./operation-contract";
import { serverSvgXml } from "./svg-image";
export const barcodeGenerateSchema = z.strictObject({
  options: barcodeOptionsSchema.optional(),
  format: z.enum(["png", "jpeg", "webp", "svg"]).default("png"),
});
export const barcodeReadSchema = z.union([
  z.strictObject({
    input: z.string().max(Math.ceil(BARCODE_IMAGE_LIMIT / 3) * 4),
  }),
  z.strictObject({ inputUploadId: z.uuid() }),
]);
export const barcodeReadMcpSchema = z.union([
  barcodeReadSchema,
  z.strictObject({ inputPath: z.string().min(1).max(4096) }),
]);
export const barcodeGenerateOutputSchema = z.strictObject({
  output: z.string(),
  encoding: z.literal("base64"),
  mimeType: z.string(),
  width: z.number(),
  height: z.number(),
  bytes: z.number(),
});
export const barcodeReadOutputSchema = z.strictObject({
  found: z.boolean(),
  result: z
    .strictObject({
      text: z.string(),
      format: z.string(),
      width: z.number(),
      height: z.number(),
      kind: z.string(),
      href: z.string().nullable(),
    })
    .nullable(),
});
export async function runBarcodeGenerate(input: unknown, signal?: AbortSignal) {
  const p = barcodeGenerateSchema.parse(input),
    options = barcodeOptionsSchema.parse(p.options ?? {});
  const image = await runBarcodeWorker({ kind: "generate", options }, signal);
  signal?.throwIfAborted();
  let bytes: Buffer;
  if (p.format === "svg") bytes = Buffer.from(image.svg);
  else {
    const encoder = sharp(Buffer.from(image.svg), {
      limitInputPixels: BARCODE_PIXEL_LIMIT,
    }).toFormat(p.format, { quality: 95 });
    const abort = () =>
      encoder.destroy(new DOMException("Aborted", "AbortError"));
    signal?.addEventListener("abort", abort, { once: true });
    try {
      bytes = await encoder.toBuffer();
      signal?.throwIfAborted();
    } finally {
      signal?.removeEventListener("abort", abort);
      encoder.destroy();
    }
  }
  if (bytes.length > BARCODE_IMAGE_LIMIT) throw new BarcodeError("too_large");
  return {
    output: bytes.toString("base64"),
    encoding: "base64" as const,
    mimeType: p.format === "svg" ? "image/svg+xml" : `image/${p.format}`,
    width: image.width,
    height: image.height,
    bytes: bytes.length,
  };
}

async function readBarcodeInput(
  input: unknown,
  signal?: AbortSignal,
  context?: WebpContext,
) {
  signal?.throwIfAborted();
  const p = (
    context?.transport === "mcp" ? barcodeReadMcpSchema : barcodeReadSchema
  ).parse(input);
  let bytes: Buffer;
  if ("input" in p) bytes = decodeImageCarrier(p.input, BARCODE_IMAGE_LIMIT);
  else if ("inputPath" in p)
    bytes = Buffer.from(
      await readAuthorizedFile(p.inputPath, context?.inputRoots ?? [], signal),
    );
  else {
    if (!context) throw new BarcodeError("invalid_input");
    const record = await context.artifacts.get(p.inputUploadId, "upload");
    if (record.bytes > BARCODE_IMAGE_LIMIT) throw new BarcodeError("too_large");
    bytes = await readFile(record.path, { signal });
  }
  if (bytes.length > BARCODE_IMAGE_LIMIT) throw new BarcodeError("too_large");
  const first = bytes.findIndex((value) => value > 32);
  if (
    (bytes[0] === 255 && bytes[1] === 254) ||
    (bytes[0] === 254 && bytes[1] === 255)
  )
    throw new BarcodeError("invalid_input");
  if (
    bytes[first] === 60 ||
    (bytes[0] === 239 && bytes[1] === 187 && bytes[2] === 191)
  ) {
    try {
      validateSvg(bytes.toString("utf8"), serverSvgXml);
    } catch {
      throw new BarcodeError("invalid_input");
    }
  }
  const decoder = sharp(bytes, {
    limitInputPixels: BARCODE_PIXEL_LIMIT,
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
      const result = await runBarcodeWorker(
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
      );
      return { found: result !== null, result };
    } finally {
      data.fill(0);
    }
  } catch (error) {
    signal?.throwIfAborted();
    if (error instanceof BarcodeError) throw error;
    throw new BarcodeError(
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
export async function runBarcodeRead(
  input: unknown,
  signal?: AbortSignal,
  context?: WebpContext,
) {
  signal?.throwIfAborted();
  if (reading >= 2) throw new BarcodeError("busy");
  reading++;
  try {
    return await readBarcodeInput(input, signal, context);
  } finally {
    reading--;
  }
}
export const barcodeOperations: Operation[] = [
  {
    id: "barcode-generator",
    name: "tooltab_barcode_generator",
    description:
      "Generate actual barcode bytes for 21 symbologies and four output formats, with all appearance options; no input persistence.",
    inputSchema: barcodeGenerateSchema,
    outputSchema: barcodeGenerateOutputSchema,
    bodyLimit: 1000000,
    idempotent: true,
    run: runBarcodeGenerate,
  },
  {
    id: "barcode-reader",
    name: "tooltab_barcode_reader",
    description:
      "Read 13 barcode symbologies from actual local image bytes. Never opens decoded links. Camera capture remains an explicit browser-only capability.",
    inputSchema: barcodeReadSchema,
    outputSchema: barcodeReadOutputSchema,
    bodyLimit: Math.ceil(BARCODE_IMAGE_LIMIT / 3) * 4 + 4096,
    idempotent: true,
    run: runBarcodeRead,
  },
];
