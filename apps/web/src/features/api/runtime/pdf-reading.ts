import { readFile } from "node:fs/promises";
import * as z from "zod/v4";
import {
  MAX_PDF_INPUT,
  MAX_PDF_OUTPUT,
  PdfEditingError,
} from "@workspace/tools/pdf/core";
import type { ReadingJob } from "@/features/tools/pdf-reading/types";
import { outputName } from "@workspace/tools/pdf/core";
import type { ReadingSource } from "@workspace/tools/pdf/reading";
import { imageFormats, imageDefaults } from "@workspace/tools/pdf/rendering";
import { streamAuthorizedFile } from "./files";
import type { WebpContext } from "./image-webp";
import type { Operation } from "./operation-contract";
import { runServiceReadingWorker } from "./pdf-reading-worker-client";

const sourceMeta = {
  name: z.string().max(255).default("document.pdf"),
  type: z.string().max(255).default("application/pdf"),
  lastModified: z.number().int().min(0).max(8640000000000000).optional(),
};
const inline = z.strictObject({
    ...sourceMeta,
    input: z.string().max(Math.ceil(MAX_PDF_INPUT / 3) * 4),
  }),
  upload = z.strictObject({ ...sourceMeta, inputUploadId: z.string().min(1) }),
  path = z.strictObject({
    ...sourceMeta,
    inputPath: z.string().min(1).max(4096),
  });
const delivery = { delivery: z.enum(["inline", "artifact"]).default("inline") };
const options = {
  pages: z.string().max(100000).default(""),
  dpi: z.number().int().min(72).max(600).default(imageDefaults.dpi),
  format: z.enum(imageFormats).default(imageDefaults.format),
  quality: z.number().min(0.1).max(1).default(imageDefaults.quality),
};
export const pdfReadingSchemas = {
  "pdf-info-viewer": {
    inline: z.strictObject({ ...delivery, source: z.union([inline, upload]) }),
    path: z.strictObject({
      ...delivery,
      source: z.union([inline, upload, path]),
    }),
  },
  "pdf-text-extractor": {
    inline: z.strictObject({
      ...delivery,
      source: z.union([inline, upload]),
      outputFormat: z.enum(["txt", "json"]).default("txt"),
    }),
    path: z.strictObject({
      ...delivery,
      source: z.union([inline, upload, path]),
      outputFormat: z.enum(["txt", "json"]).default("txt"),
    }),
  },
  "pdf-to-image-converter": {
    inline: z.strictObject({
      ...options,
      delivery: z.enum(["inline", "artifact"]).default("artifact"),
      source: z.union([inline, upload]),
    }),
    path: z.strictObject({
      ...options,
      delivery: z.enum(["inline", "artifact"]).default("artifact"),
      source: z.union([inline, upload, path]),
    }),
  },
};
export type PdfReadingId = keyof typeof pdfReadingSchemas;
const summary = {
  kind: z.enum(["info", "text", "image"]),
  mimeType: z.string(),
  bytes: z.number(),
  pageCount: z.number().optional(),
  encrypted: z.boolean().optional(),
  characterCount: z.number().optional(),
  wordCount: z.number().optional(),
  emptyTextPages: z.number().optional(),
  likelyScannedPages: z.number().optional(),
  files: z
    .array(
      z.strictObject({
        name: z.string(),
        page: z.number(),
        width: z.number(),
        height: z.number(),
        bytes: z.number(),
      }),
    )
    .max(100)
    .optional(),
  totalFiles: z.number().optional(),
  fileListTruncated: z.boolean().optional(),
};
export const pdfReadingOutputSchema = z.union([
  z.strictObject({
    ...summary,
    delivery: z.literal("inline"),
    encoding: z.enum(["utf8", "base64"]),
    output: z.string(),
  }),
  z.strictObject({
    ...summary,
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
export async function runPdfReadingTool(
  id: PdfReadingId,
  input: unknown,
  signal?: AbortSignal,
  roots: readonly string[] = [],
  context?: WebpContext,
) {
  signal?.throwIfAborted();
  if (!Object.hasOwn(pdfReadingSchemas, id))
    throw new PdfEditingError("invalid_options");
  if (active) throw new PdfEditingError("busy");
  active = true;
  let saved: string | undefined;
  try {
    const p = pdfReadingSchemas[id].path.parse(input),
      s = p.source;
    let bytes: Uint8Array;
    if ("input" in s) {
      const b = Buffer.from(s.input, "base64");
      if (b.toString("base64") !== s.input)
        throw new PdfEditingError("invalid_pdf");
      bytes = new Uint8Array(b);
    } else if ("inputPath" in s) {
      if (context?.transport === "http")
        throw new PdfEditingError("invalid_pdf");
      const chunks: Uint8Array[] = [];
      let length = 0;
      for await (const chunk of streamAuthorizedFile(
        s.inputPath,
        roots,
        signal,
        MAX_PDF_INPUT,
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
      if (!context) throw new PdfEditingError("invalid_pdf");
      const record = await context.artifacts.get(s.inputUploadId, "upload");
      if (record.bytes > MAX_PDF_INPUT) throw new PdfEditingError("too_large");
      bytes = new Uint8Array(await readFile(record.path, { signal }));
    }
    const source: ReadingSource = {
      bytes,
      name: s.name,
      type: s.type,
      lastModified: s.lastModified,
    };
    let job: ReadingJob;
    if (id === "pdf-to-image-converter") {
      const image = pdfReadingSchemas[id].path.parse(input);
      job = {
        kind: "image",
        source,
        pages: image.pages,
        dpi: image.dpi,
        format: image.format,
        quality: image.quality,
      };
    } else job = { kind: id === "pdf-info-viewer" ? "info" : "text", source };
    const result = await runServiceReadingWorker(job, signal);
    signal?.throwIfAborted();
    let output: Uint8Array,
      mimeType: string,
      name: string,
      encoding: "utf8" | "base64" = "utf8";
    const details: Record<string, unknown> = { kind: result.kind };
    if (result.kind === "info") {
      output = new TextEncoder().encode(JSON.stringify(result, null, 2));
      mimeType = "application/json";
      name = outputName(source.name, "json");
      details.encrypted = result.document.encrypted;
      if (result.document.pageCount !== undefined)
        details.pageCount = result.document.pageCount;
    } else if (result.kind === "text") {
      const json = "outputFormat" in p && p.outputFormat === "json";
      output = new TextEncoder().encode(
        json ? JSON.stringify(result, null, 2) : result.text,
      );
      mimeType = json ? "application/json" : "text/plain;charset=utf-8";
      name = outputName(source.name, json ? "json" : "txt");
      Object.assign(details, {
        pageCount: result.pageCount,
        characterCount: result.characterCount,
        wordCount: result.wordCount,
        emptyTextPages: result.emptyTextPages,
        likelyScannedPages: result.likelyScannedPages,
      });
    } else {
      output = result.archive ?? result.files[0].bytes;
      mimeType = result.archive ? "application/zip" : `image/${result.format}`;
      name = result.archive
        ? outputName(source.name, "zip")
        : result.files[0].name;
      encoding = "base64";
      Object.assign(details, {
        pageCount: result.pageCount,
        files: result.files.slice(0, 100).map((f) => ({
          name: f.name,
          page: f.page,
          width: f.width,
          height: f.height,
          bytes: f.bytes.length,
        })),
        totalFiles: result.files.length,
        fileListTruncated: result.files.length > 100,
      });
    }
    Object.assign(details, { mimeType, bytes: output.length });
    if (output.length > MAX_PDF_OUTPUT) throw new PdfEditingError("too_large");
    if (p.delivery === "inline") {
      if (output.length > 16384) throw new PdfEditingError("artifact_required");
      const out = {
        ...details,
        delivery: "inline",
        encoding,
        output: Buffer.from(output).toString(
          encoding === "utf8" ? "utf8" : "base64",
        ),
      };
      if (Buffer.byteLength(JSON.stringify(out)) > 65536)
        throw new PdfEditingError("artifact_required");
      return pdfReadingOutputSchema.parse(out);
    }
    if (!context) throw new PdfEditingError("artifact_required");
    const record = await context.artifacts.write(
      (async function* () {
        for (let offset = 0; offset < output.length; offset += 65536) {
          signal?.throwIfAborted();
          yield output.subarray(offset, offset + 65536);
        }
      })(),
      { filename: name, mimeType, limit: MAX_PDF_OUTPUT },
      signal,
    );
    saved = record.id;
    signal?.throwIfAborted();
    return pdfReadingOutputSchema.parse({
      ...details,
      delivery: "artifact",
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
    });
  } catch (error) {
    if (saved && context) await context.artifacts.remove(saved).catch(() => {});
    throw error;
  } finally {
    active = false;
  }
}
export const pdfReadingOperations: Operation[] = (
  Object.keys(pdfReadingSchemas) as PdfReadingId[]
).map((id) => ({
  id,
  name: id.replaceAll("-", "_"),
  description:
    "Read local PDF metadata, extract complete selectable text without OCR, or render full pages to PNG/JPEG/WebP. No external PDF URL is loaded.",
  inputSchema: pdfReadingSchemas[id].inline,
  outputSchema: pdfReadingOutputSchema,
  idempotent: false,
  bodyLimit: Math.ceil(MAX_PDF_INPUT / 3) * 4 + 2 * 1048576,
  run: (input, signal, context) =>
    runPdfReadingTool(id, input, signal, [], context),
}));
