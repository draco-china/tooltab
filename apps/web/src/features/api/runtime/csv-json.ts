import { readFile } from "node:fs/promises";
import * as z from "zod/v4";
import {
  CSV_DEFAULTS,
  CsvJsonError,
  type CsvJsonJob,
  JSON_DEFAULTS,
  MAX_INPUT_BYTES,
  MAX_OUTPUT_BYTES,
  MAX_ROWS,
} from "@workspace/tools/encoding/csv-json";
import { runCsvJsonWorker } from "@/features/tools/csv-json/worker-client";
import type { WebpContext } from "./image-webp";
import type { Operation } from "./operation-contract";
import { serviceWorkerUrl } from "./worker-url";

const csvOptions = z.strictObject({
  noHeader: z.boolean().default(false),
  headersText: z.string().max(8192).default(""),
  delimiter: z.string().max(32).default(","),
  quoteChar: z.string().max(1).default('"'),
  trim: z.boolean().default(true),
  checkType: z.boolean().default(false),
  skipEmptyLines: z.enum(["none", "true", "greedy"]).default("none"),
  escapeChar: z.string().max(1).default('"'),
  newline: z
    .enum(["", "auto", "\r", "\n", "\r\n", "\\r", "\\n", "\\r\\n"])
    .default(""),
  preview: z.number().int().min(0).max(MAX_ROWS).default(0),
  comments: z.string().max(8192).default(""),
  fastMode: z.boolean().default(false),
  skipFirstNLines: z.number().int().min(0).max(MAX_ROWS).default(0),
  delimitersToGuessText: z.string().max(8192).default(""),
  includeColumns: z.string().max(8192).default(""),
  ignoreColumns: z.string().max(8192).default(""),
  indentSize: z.number().int().min(0).max(8).default(2),
});
const jsonOptions = z.strictObject({
  delimiter: z.string().min(1).max(32).default(","),
  quoteChar: z.string().max(1).default('"'),
  includeHeaderRow: z.boolean().default(true),
  escapeFormulae: z.boolean().default(true),
});
const sourceShape = {
  input: z.string().max(MAX_INPUT_BYTES).optional(),
  inputUploadId: z.string().min(1).optional(),
};
export const csvToJsonInputSchema = z
  .strictObject({
    ...sourceShape,
    options: csvOptions.default({ ...CSV_DEFAULTS, newline: "" as const }),
  })
  .refine((p) => (p.input !== undefined) !== (p.inputUploadId !== undefined));
export const jsonToCsvInputSchema = z
  .strictObject({ ...sourceShape, options: jsonOptions.default(JSON_DEFAULTS) })
  .refine((p) => (p.input !== undefined) !== (p.inputUploadId !== undefined));
const summarySchema = z.strictObject({
  rows: z.number(),
  columns: z.number(),
  bytes: z.number(),
  limited: z.boolean(),
  renamedHeaders: z.record(z.string(), z.string()),
});
export const csvJsonOutputSchema = z.union([
  summarySchema.extend({ mode: z.literal("inline"), output: z.string() }),
  summarySchema.extend({
    mode: z.literal("artifact"),
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
let active = 0;
async function run(
  job: CsvJsonJob,
  signal?: AbortSignal,
  context?: WebpContext,
) {
  signal?.throwIfAborted();
  if (active >= 1) throw new CsvJsonError("busy");
  active++;
  let saved: string | undefined;
  try {
    const { output, ...summary } = await runCsvJsonWorker(
      job,
      signal,
      undefined,
      import.meta.env.PROD
        ? () =>
            new Worker(serviceWorkerUrl("csv-json-worker", import.meta.url), {
              type: "module",
            })
        : undefined,
    );
    signal?.throwIfAborted();
    if (summary.bytes <= 65536)
      return { mode: "inline" as const, output, ...summary };
    if (!context) throw new CsvJsonError("artifact_required");
    const bytes = new TextEncoder().encode(output);
    async function* chunks() {
      for (let i = 0; i < bytes.length; i += 65536) {
        signal?.throwIfAborted();
        yield bytes.subarray(i, i + 65536);
      }
    }
    const json = job.kind === "csv-to-json";
    const record = await context.artifacts.write(
      chunks(),
      {
        limit: MAX_OUTPUT_BYTES,
        mimeType: json ? "application/json" : "text/csv;charset=utf-8",
        filename: json ? "converted.json" : "converted.csv",
      },
      signal,
    );
    saved = record.id;
    signal?.throwIfAborted();
    const { id, bytes: count, mimeType, filename, expiresAt } = record;
    return {
      mode: "artifact" as const,
      ...summary,
      artifact: {
        id,
        bytes: count,
        mimeType,
        filename,
        expiresAt,
        ...(context.transport === "mcp"
          ? { path: record.path }
          : { downloadUrl: `/api/v1/artifacts/${id}` }),
      },
    };
  } catch (e) {
    if (saved && context) await context.artifacts.remove(saved);
    throw e;
  } finally {
    active--;
  }
}
async function inputText(
  input: string | undefined,
  uploadId: string | undefined,
  context?: WebpContext,
  signal?: AbortSignal,
) {
  if (input !== undefined) return input;
  if (!uploadId || !context) throw new CsvJsonError("invalid_options");
  const record = await context.artifacts.get(uploadId, "upload");
  if (record.bytes > MAX_INPUT_BYTES) throw new CsvJsonError("too_large");
  const bytes = await readFile(record.path, { signal });
  if (bytes.byteLength > MAX_INPUT_BYTES) throw new CsvJsonError("too_large");
  try {
    return new TextDecoder("utf-8", { fatal: true }).decode(bytes);
  } catch {
    throw new CsvJsonError("read_failed");
  }
}
export const csvJsonOperations: Operation[] = [
  {
    id: "csv-to-json-converter",
    name: "tooltab_csv_to_json_converter",
    description:
      "Parse CSV with all header, delimiter, quote, type inference, row limit, comments and regex column options. 32 MiB UTF-8 input; 128 MiB output; 1,000,000 rows and 4,000,000 cells. preview limits the actual result. Outputs above 64 KiB are complete authenticated artifacts. Runs in a cancellable Bun Worker.",
    inputSchema: csvToJsonInputSchema,
    outputSchema: csvJsonOutputSchema,
    bodyLimit: MAX_INPUT_BYTES * 6 + 100000,
    idempotent: false,
    async run(input, signal, context) {
      signal?.throwIfAborted();
      const p = csvToJsonInputSchema.parse(input);
      return run(
        {
          kind: "csv-to-json",
          input: await inputText(p.input, p.inputUploadId, context, signal),
          options: p.options,
        },
        signal,
        context,
      );
    },
  },
  {
    id: "json-to-csv-converter",
    name: "tooltab_json_to_csv_converter",
    description:
      "Convert arrays of objects, arrays of arrays or {fields,data} to CSV with delimiter, quote, headers and formula escaping. Columns follow explicit fields or first object; nested cells use Papa string conversion. 32 MiB UTF-8 input and 128 MiB output; large results are complete artifacts. Runs in a cancellable Bun Worker.",
    inputSchema: jsonToCsvInputSchema,
    outputSchema: csvJsonOutputSchema,
    bodyLimit: MAX_INPUT_BYTES * 6 + 100000,
    idempotent: false,
    async run(input, signal, context) {
      signal?.throwIfAborted();
      const p = jsonToCsvInputSchema.parse(input);
      return run(
        {
          kind: "json-to-csv",
          input: await inputText(p.input, p.inputUploadId, context, signal),
          options: p.options,
        },
        signal,
        context,
      );
    },
  },
];

const csvPathSchema = z.strictObject({
  inputPath: z.string().min(1).max(4096),
  options: csvOptions.default({ ...CSV_DEFAULTS, newline: "" as const }),
});
const jsonPathSchema = z.strictObject({
  inputPath: z.string().min(1).max(4096),
  options: jsonOptions.default(JSON_DEFAULTS),
});
export const csvToJsonMcpInputSchema = z.union([
  csvToJsonInputSchema,
  csvPathSchema,
]);
export const jsonToCsvMcpInputSchema = z.union([
  jsonToCsvInputSchema,
  jsonPathSchema,
]);
export async function runCsvJson(
  id: string,
  input: unknown,
  signal?: AbortSignal,
  roots: readonly string[] = [],
  context?: WebpContext,
) {
  signal?.throwIfAborted();
  const kind =
    id === "csv-to-json-converter"
      ? "csv-to-json"
      : id === "json-to-csv-converter"
        ? "json-to-csv"
        : undefined;
  if (!kind) throw new CsvJsonError("invalid_options");
  if (input && typeof input === "object" && "inputPath" in input) {
    const parsed =
      kind === "csv-to-json"
        ? csvPathSchema.parse(input)
        : jsonPathSchema.parse(input);
    const { streamAuthorizedFile } = await import("./files");
    const decoder = new TextDecoder("utf-8", { fatal: true });
    const chunks: string[] = [];
    for await (const chunk of streamAuthorizedFile(
      parsed.inputPath,
      roots,
      signal,
      MAX_INPUT_BYTES,
    )) {
      try {
        chunks.push(decoder.decode(chunk, { stream: true }));
      } catch {
        throw new CsvJsonError("read_failed");
      }
    }
    try {
      chunks.push(decoder.decode());
    } catch {
      throw new CsvJsonError("read_failed");
    }
    const text = chunks.join("");
    return run(
      kind === "csv-to-json"
        ? { kind, input: text, options: parsed.options }
        : { kind, input: text, options: parsed.options },
      signal,
      context,
    );
  }
  const op = csvJsonOperations.find((item) => item.id === id);
  if (!op) throw new CsvJsonError("invalid_options");
  return op.run(input, signal, context);
}
