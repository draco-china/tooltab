import { readFile } from "node:fs/promises";
import * as z from "zod/v4";
import {
  MAX_PDF_INPUT,
  MAX_PDF_OUTPUT,
  PdfEditingError,
  pdfFilename,
} from "@workspace/tools/pdf/core";
import {
  type FinishingJob,
  imagePageSizes,
  MAX_IMAGE_COUNT,
} from "@workspace/tools/pdf/finishing";
import { streamAuthorizedFile } from "./files";
import type { WebpContext } from "./image-webp";
import type { Operation } from "./operation-contract";
import { runServiceFinishingWorker } from "./pdf-finishing-worker-client";

const meta = {
  name: z.string().max(255).default("input"),
  rotation: z
    .union([z.literal(0), z.literal(90), z.literal(180), z.literal(270)])
    .default(0),
};
const inline = z.strictObject({
    ...meta,
    input: z.string().max(Math.ceil(MAX_PDF_INPUT / 3) * 4),
  }),
  upload = z.strictObject({ ...meta, inputUploadId: z.string().min(1) }),
  path = z.strictObject({ ...meta, inputPath: z.string().min(1).max(4096) }),
  source = z.union([inline, upload]),
  mcpSource = z.union([inline, upload, path]);
const common = {
  filename: z.string().max(255).default("result.pdf"),
  delivery: z.enum(["inline", "artifact"]).default("artifact"),
};
const options = z.strictObject({
  pageSize: z.enum(imagePageSizes).default("a4"),
  orientation: z.enum(["auto", "portrait", "landscape"]).default("auto"),
  fit: z.enum(["contain", "cover"]).default("contain"),
  marginMm: z.number().int().min(0).max(40).default(12),
  quality: z.enum(["best", "balanced", "small"]).default("balanced"),
});
export const pdfFinishingSchemas = {
  "image-to-pdf-converter": {
    inline: z.strictObject({
      ...common,
      inputs: z.array(source).min(1).max(MAX_IMAGE_COUNT),
      options: options.default(() => options.parse({})),
    }),
    path: z.strictObject({
      ...common,
      inputs: z.array(mcpSource).min(1).max(MAX_IMAGE_COUNT),
      options: options.default(() => options.parse({})),
    }),
  },
  "remove-pdf-owner-password": {
    inline: z.strictObject({ ...common, source }),
    path: z.strictObject({ ...common, source: mcpSource }),
  },
};
export type PdfFinishingId = keyof typeof pdfFinishingSchemas;
const result = {
  pages: z.number(),
  wasEncrypted: z.boolean().optional(),
  warnings: z.array(z.string()),
  bytes: z.number(),
  mimeType: z.literal("application/pdf"),
};
export const pdfFinishingOutputSchema = z.union([
  z.strictObject({
    ...result,
    delivery: z.literal("inline"),
    encoding: z.literal("base64"),
    output: z.string(),
  }),
  z.strictObject({
    ...result,
    delivery: z.literal("artifact"),
    artifact: z.strictObject({
      id: z.string(),
      bytes: z.number(),
      filename: z.string(),
      mimeType: z.string(),
      expiresAt: z.number(),
      path: z.string().optional(),
      downloadUrl: z.string().optional(),
    }),
  }),
]);
let active = false;
export async function runPdfFinishingTool(
  id: PdfFinishingId,
  input: unknown,
  signal?: AbortSignal,
  roots: readonly string[] = [],
  context?: WebpContext,
) {
  signal?.throwIfAborted();
  if (!Object.hasOwn(pdfFinishingSchemas, id))
    throw new PdfEditingError("invalid_options");
  if (active) throw new PdfEditingError("busy");
  active = true;
  let saved: string | undefined;
  try {
    let total = 0;
    const read = async (s: z.infer<typeof mcpSource>) => {
      let bytes: Uint8Array;
      if ("input" in s) {
        const b = Buffer.from(s.input, "base64");
        if (b.toString("base64") !== s.input)
          throw new PdfEditingError("read_failed");
        bytes = new Uint8Array(b);
      } else if ("inputPath" in s) {
        if (context?.transport === "http")
          throw new PdfEditingError("read_failed");
        const chunks: Uint8Array[] = [];
        let length = 0;
        for await (const chunk of streamAuthorizedFile(
          s.inputPath,
          roots,
          signal,
          MAX_PDF_INPUT - total,
        )) {
          chunks.push(chunk);
          length += chunk.length;
        }
        bytes = new Uint8Array(length);
        let offset = 0;
        for (const chunk of chunks) {
          bytes.set(chunk, offset);
          offset += chunk.length;
        }
      } else {
        if (!context) throw new PdfEditingError("read_failed");
        const record = await context.artifacts.get(s.inputUploadId, "upload");
        if (record.bytes + total > MAX_PDF_INPUT)
          throw new PdfEditingError("too_large");
        bytes = new Uint8Array(await readFile(record.path, { signal }));
      }
      total += bytes.length;
      if (total > MAX_PDF_INPUT) throw new PdfEditingError("too_large");
      return { bytes, name: s.name, rotation: s.rotation };
    };
    let job: FinishingJob, filename: string, delivery: "inline" | "artifact";
    if (id === "image-to-pdf-converter") {
      const p = pdfFinishingSchemas[id].path.parse(input),
        sources = [];
      for (const source of p.inputs) sources.push(await read(source));
      job = { kind: "images", sources, options: p.options };
      filename = p.filename;
      delivery = p.delivery;
    } else {
      const p = pdfFinishingSchemas[id].path.parse(input);
      if (p.source.rotation !== 0) throw new PdfEditingError("invalid_options");
      job = { kind: "unlock", bytes: (await read(p.source)).bytes };
      filename = p.filename;
      delivery = p.delivery;
    }
    const result = await runServiceFinishingWorker(job, signal);
    signal?.throwIfAborted();
    const summary = {
      pages: result.pages,
      wasEncrypted: result.wasEncrypted,
      warnings: result.warnings,
      bytes: result.bytes.length,
      mimeType: "application/pdf" as const,
    };
    if (delivery === "inline") {
      if (result.bytes.length > 16384)
        throw new PdfEditingError("artifact_required");
      const out = {
        ...summary,
        delivery: "inline" as const,
        encoding: "base64" as const,
        output: Buffer.from(result.bytes).toString("base64"),
      };
      if (Buffer.byteLength(JSON.stringify(out)) > 65536)
        throw new PdfEditingError("artifact_required");
      return out;
    }
    if (!context) throw new PdfEditingError("artifact_required");
    const record = await context.artifacts.write(
      (async function* () {
        for (let offset = 0; offset < result.bytes.length; offset += 65536) {
          signal?.throwIfAborted();
          yield result.bytes.subarray(offset, offset + 65536);
        }
      })(),
      {
        filename: pdfFilename(filename),
        mimeType: "application/pdf",
        limit: MAX_PDF_OUTPUT,
      },
      signal,
    );
    saved = record.id;
    signal?.throwIfAborted();
    return {
      ...summary,
      delivery: "artifact" as const,
      artifact: {
        id: record.id,
        bytes: record.bytes,
        filename: record.filename,
        mimeType: record.mimeType,
        expiresAt: record.expiresAt,
        ...(context.transport === "mcp"
          ? { path: record.path }
          : { downloadUrl: `/api/v1/artifacts/${record.id}` }),
      },
    };
  } catch (error) {
    if (saved && context) await context.artifacts.remove(saved).catch(() => {});
    throw error;
  } finally {
    active = false;
  }
}
export const pdfFinishingOperations: Operation[] = (
  Object.keys(pdfFinishingSchemas) as PdfFinishingId[]
).map((id) => ({
  id,
  name: id.replaceAll("-", "_"),
  description:
    id === "image-to-pdf-converter"
      ? "Create complete image PDFs using white-background JPEG pages, ordered inputs and exact paper layout."
      : "Remove permission encryption only when the PDF opens without a user password; no password recovery or bypass. Rewriting invalidates signatures.",
  inputSchema: pdfFinishingSchemas[id].inline,
  outputSchema: pdfFinishingOutputSchema,
  idempotent: false,
  bodyLimit: Math.ceil(MAX_PDF_INPUT / 3) * 4 + 2 * 1048576,
  run: (input, signal, context) =>
    runPdfFinishingTool(id, input, signal, [], context),
}));
