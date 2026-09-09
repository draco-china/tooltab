import { readFile } from "node:fs/promises";
import * as z from "zod/v4";
import {
  MAX_PDF_INPUT,
  MAX_PDF_OUTPUT,
  MAX_PDF_PAGES,
  PdfEditingError,
} from "@workspace/tools/pdf/core";
import type { PdfJob, PdfSource } from "@workspace/tools/pdf/editing";
import {
  NUMBER_POSITIONS,
  numberDefaults,
} from "@workspace/tools/pdf/numbering";
import { runPdfWorker } from "@/features/tools/pdf-editing/worker-client";
import { streamAuthorizedFile } from "./files";
import type { WebpContext } from "./image-webp";
import type { Operation } from "./operation-contract";
import { serviceWorkerUrl } from "./worker-url";

const inlineSource = z.strictObject({
  input: z.string().max(Math.ceil(MAX_PDF_INPUT / 3) * 4),
  name: z.string().max(255).default("document.pdf"),
});
const uploadSource = z.strictObject({
  inputUploadId: z.string().min(1),
  name: z.string().max(255).default("document.pdf"),
});
const pathSource = z.strictObject({
  inputPath: z.string().min(1).max(4096),
  name: z.string().max(255).default("document.pdf"),
});
const source = z.union([inlineSource, uploadSource]),
  mcpSource = z.union([inlineSource, uploadSource, pathSource]);
const common = {
  filename: z.string().max(255).default("result.pdf"),
  delivery: z.enum(["inline", "artifact"]).default("artifact"),
};
const options = z.strictObject({
  pages: z.string().max(100000).default(numberDefaults.pages),
  startNumber: z
    .number()
    .int()
    .min(1)
    .max(999999)
    .default(numberDefaults.startNumber),
  format: z.enum(["number", "number-total"]).default(numberDefaults.format),
  position: z.enum(NUMBER_POSITIONS).default(numberDefaults.position),
  fontFamily: z
    .enum(["serif", "sans-serif"])
    .default(numberDefaults.fontFamily),
  fontSize: z.number().int().min(6).max(72).default(numberDefaults.fontSize),
  marginX: z.number().int().min(0).max(144).default(numberDefaults.marginX),
  marginY: z.number().int().min(0).max(144).default(numberDefaults.marginY),
});
const split = {
  ranges: z.string().min(1).max(100000),
  outputMode: z.enum(["single", "multiple"]).default("single"),
  multipleMode: z.enum(["ranges", "pages"]).default("ranges"),
};
const plan = z
  .array(
    z.strictObject({
      page: z.number().int().min(1).max(MAX_PDF_PAGES),
      rotation: z.union([
        z.literal(0),
        z.literal(90),
        z.literal(180),
        z.literal(270),
      ]),
    }),
  )
  .min(1)
  .max(MAX_PDF_PAGES);
export const pdfEditingSchemas = {
  "pdf-merger": {
    inline: z.strictObject({
      ...common,
      inputs: z.array(source).min(2).max(100),
    }),
    path: z.strictObject({
      ...common,
      inputs: z.array(mcpSource).min(2).max(100),
    }),
  },
  "pdf-splitter": {
    inline: z.strictObject({ ...common, ...split, source }),
    path: z.strictObject({ ...common, ...split, source: mcpSource }),
  },
  "pdf-page-organizer": {
    inline: z.strictObject({ ...common, source, plan }),
    path: z.strictObject({ ...common, source: mcpSource, plan }),
  },
  "pdf-page-number-adder": {
    inline: z.strictObject({
      ...common,
      source,
      options: options.default(() => options.parse({})),
    }),
    path: z.strictObject({
      ...common,
      source: mcpSource,
      options: options.default(() => options.parse({})),
    }),
  },
};
export type PdfToolId = keyof typeof pdfEditingSchemas;
const artifact = z.strictObject({
  id: z.string(),
  bytes: z.number(),
  filename: z.string(),
  mimeType: z.string(),
  expiresAt: z.number(),
  downloadUrl: z.string().optional(),
  path: z.string().optional(),
});
const details = {
  files: z
    .array(
      z.strictObject({
        name: z.string(),
        pages: z.number(),
        bytes: z.number(),
      }),
    )
    .max(100),
  totalFiles: z.number(),
  fileListTruncated: z.boolean(),
  warnings: z.array(z.string()),
  mimeType: z.enum(["application/pdf", "application/zip"]),
  bytes: z.number(),
};
export const pdfEditingOutputSchema = z.union([
  z.strictObject({
    ...details,
    delivery: z.literal("inline"),
    encoding: z.literal("base64"),
    output: z.string(),
  }),
  z.strictObject({ ...details, delivery: z.literal("artifact"), artifact }),
]);
let active = false;
export async function runPdfEditingTool(
  id: PdfToolId,
  input: unknown,
  signal?: AbortSignal,
  roots: readonly string[] = [],
  context?: WebpContext,
) {
  signal?.throwIfAborted();
  if (active) throw new PdfEditingError("busy");
  active = true;
  let saved: string | undefined;
  try {
    let total = 0;
    async function read(s: z.infer<typeof mcpSource>): Promise<PdfSource> {
      let bytes: Uint8Array;
      if ("input" in s) {
        if (s.input.length % 4 !== 0) throw new PdfEditingError("invalid_pdf");
        const b = Buffer.from(s.input, "base64");
        if (b.toString("base64") !== s.input)
          throw new PdfEditingError("invalid_pdf");
        bytes = b;
      } else if ("inputPath" in s) {
        if (context?.transport === "http")
          throw new PdfEditingError("invalid_pdf");
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
        let p = 0;
        for (const chunk of chunks) {
          bytes.set(chunk, p);
          p += chunk.length;
        }
      } else {
        if (!context) throw new PdfEditingError("invalid_pdf");
        const record = await context.artifacts.get(s.inputUploadId, "upload");
        if (record.bytes + total > MAX_PDF_INPUT)
          throw new PdfEditingError("too_large");
        bytes = new Uint8Array(await readFile(record.path, { signal }));
      }
      total += bytes.length;
      if (total > MAX_PDF_INPUT) throw new PdfEditingError("too_large");
      return { name: s.name, bytes };
    }
    let job: PdfJob, delivery: "inline" | "artifact";
    if (id === "pdf-merger") {
      const p = pdfEditingSchemas[id].path.parse(input),
        sources: PdfSource[] = [];
      for (const s of p.inputs) sources.push(await read(s));
      job = { kind: "merge", sources, filename: p.filename };
      delivery = p.delivery;
    } else if (id === "pdf-splitter") {
      const p = pdfEditingSchemas[id].path.parse(input);
      job = {
        kind: "split",
        source: await read(p.source),
        ranges: p.ranges,
        outputMode: p.outputMode,
        multipleMode: p.multipleMode,
        filename: p.filename,
      };
      delivery = p.delivery;
    } else if (id === "pdf-page-organizer") {
      const p = pdfEditingSchemas[id].path.parse(input);
      job = {
        kind: "organize",
        source: await read(p.source),
        plan: p.plan,
        filename: p.filename,
      };
      delivery = p.delivery;
    } else {
      const p = pdfEditingSchemas["pdf-page-number-adder"].path.parse(input);
      job = {
        kind: "number",
        source: await read(p.source),
        options: p.options,
        filename: p.filename,
      };
      delivery = p.delivery;
    }
    const result = await runPdfWorker(
      job,
      signal,
      undefined,
      undefined,
      import.meta.env.PROD
        ? () =>
            new Worker(
              serviceWorkerUrl("pdf-editing-worker", import.meta.url),
              { type: "module" },
            )
        : undefined,
    );
    if (result.kind !== "output") throw new PdfEditingError("invalid_pdf");
    signal?.throwIfAborted();
    const bytes = result.archive ?? result.files[0].bytes,
      mimeType = result.archive
        ? ("application/zip" as const)
        : ("application/pdf" as const),
      name = result.archive ? "split-results.zip" : result.files[0].name;
    const summary = {
      files: result.files
        .slice(0, 100)
        .map((f) => ({ name: f.name, pages: f.pages, bytes: f.bytes.length })),
      totalFiles: result.files.length,
      fileListTruncated: result.files.length > 100,
      warnings: result.warnings,
      mimeType,
      bytes: bytes.length,
    };
    if (delivery === "inline") {
      if (bytes.length > 16384) throw new PdfEditingError("artifact_required");
      const out = {
        ...summary,
        delivery: "inline" as const,
        encoding: "base64" as const,
        output: Buffer.from(bytes).toString("base64"),
      };
      if (Buffer.byteLength(JSON.stringify(out)) > 65536)
        throw new PdfEditingError("artifact_required");
      return out;
    }
    if (!context) throw new PdfEditingError("artifact_required");
    const record = await context.artifacts.write(
      (async function* () {
        for (let p = 0; p < bytes.length; p += 65536) {
          signal?.throwIfAborted();
          yield bytes.subarray(p, p + 65536);
        }
      })(),
      { filename: name, mimeType, limit: MAX_PDF_OUTPUT },
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
  } catch (e) {
    if (saved && context) await context.artifacts.remove(saved).catch(() => {});
    throw e;
  } finally {
    active = false;
  }
}
export const pdfEditingOperations: Operation[] = (
  Object.keys(pdfEditingSchemas) as PdfToolId[]
).map((id) => ({
  id,
  name: id.replaceAll("-", "_"),
  description:
    "Edit complete local PDFs. Encrypted documents are rejected; copied pages do not retain all document-level structures. Not secure redaction.",
  inputSchema: pdfEditingSchemas[id].inline,
  outputSchema: pdfEditingOutputSchema,
  idempotent: false,
  bodyLimit: Math.ceil(MAX_PDF_INPUT / 3) * 4 + 2 * 1048576,
  run: (input, signal, context) =>
    runPdfEditingTool(id, input, signal, [], context),
}));
