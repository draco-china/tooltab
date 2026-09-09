import { readFile } from "node:fs/promises";
import { z } from "zod";
import { sqlLintSchema, sqlOptionsSchema } from "@workspace/tools/format/sql";
import {
  FORMATTER_INPUT_LIMIT,
  FORMATTER_OUTPUT_LIMIT,
  FormatterError,
} from "@workspace/tools/format/contract";
import { prettierOptionsSchema } from "@workspace/tools/format/prettier-config";
import type {
  FormatterId,
  FormatterJob,
} from "@/features/tools/code-formatters/types";
import { runFormatterWorker } from "@/features/tools/code-formatters/worker-client";
import { streamAuthorizedFile } from "./files";
import type { WebpContext } from "./image-webp";
import type { Operation } from "./operation-contract";
import { serviceWorkerUrl } from "./worker-url";
export const formatterIds = [
  "prettier-code-formatter",
  "sql-formatter-and-linter",
] as const;
export function formatterSchemas(id: FormatterId) {
  const options =
    id === "prettier-code-formatter"
      ? { options: prettierOptionsSchema.optional() }
      : {
          options: sqlOptionsSchema.optional(),
          lint: sqlLintSchema.optional(),
        };
  const inline = z.union([
    z.strictObject({
      ...options,
      input: z.string().max(FORMATTER_INPUT_LIMIT),
    }),
    z.strictObject({ ...options, inputUploadId: z.uuid() }),
  ]);
  return {
    inline,
    mcp: z.union([
      inline,
      z.strictObject({ ...options, inputPath: z.string().min(1).max(4096) }),
    ]),
  };
}
const artifact = z.strictObject({
  id: z.string(),
  bytes: z.number(),
  mimeType: z.string(),
  filename: z.string(),
  expiresAt: z.number(),
  path: z.string().optional(),
  downloadUrl: z.string().optional(),
});
const issue = z.strictObject({
  code: z.string(),
  severity: z.enum(["error", "warning", "info"]),
  message: z.string(),
  line: z.number(),
  column: z.number(),
});
export const formatterOutputSchema = z.union([
  z.strictObject({
    mode: z.literal("inline"),
    output: z.string(),
    bytes: z.number(),
    filename: z.string(),
    issues: z.array(issue),
    formatError: z.string().nullable(),
  }),
  z.strictObject({
    mode: z.literal("artifacts"),
    bytes: z.number(),
    filename: z.string(),
    issueCount: z.number(),
    formatError: z.string().nullable(),
    artifacts: z.array(artifact),
  }),
]);
export async function runFormatterTool(
  id: FormatterId,
  input: unknown,
  signal?: AbortSignal,
  roots?: readonly string[],
  context?: WebpContext,
) {
  signal?.throwIfAborted();
  if (context?.transport === "http" && roots !== undefined)
    throw new FormatterError("invalid_input");
  const params = (
    roots === undefined ? formatterSchemas(id).inline : formatterSchemas(id).mcp
  ).parse(input);
  let source: string;
  if ("input" in params) source = params.input;
  else if ("inputPath" in params) {
    const decoder = new TextDecoder("utf8", { fatal: true }),
      parts: string[] = [];
    for await (const chunk of streamAuthorizedFile(
      params.inputPath,
      roots ?? [],
      signal,
      FORMATTER_INPUT_LIMIT,
    ))
      parts.push(decodeUtf8(decoder, chunk, true));
    parts.push(decodeUtf8(decoder));
    source = parts.join("");
  } else {
    if (!context) throw new FormatterError("invalid_input");
    const record = await context.artifacts.get(params.inputUploadId, "upload");
    if (record.bytes > FORMATTER_INPUT_LIMIT)
      throw new FormatterError("too_large");
    const bytes = await readFile(record.path, { signal });
    if (bytes.length > FORMATTER_INPUT_LIMIT)
      throw new FormatterError("too_large");
    source = decodeUtf8(new TextDecoder("utf8", { fatal: true }), bytes);
  }
  const job: FormatterJob =
    id === "prettier-code-formatter"
      ? {
          kind: "prettier",
          input: source,
          options: prettierOptionsSchema.parse(params.options ?? {}),
        }
      : {
          kind: "sql",
          input: source,
          options: sqlOptionsSchema.parse(params.options ?? {}),
          lint: sqlLintSchema.parse(
            "lint" in params ? (params.lint ?? {}) : {},
          ),
        };
  const {
    highlighted: _,
    previewLimited: __,
    ...result
  } = await runFormatterWorker(
    job,
    signal,
    import.meta.env.PROD
      ? () =>
          new Worker(
            serviceWorkerUrl("code-formatters-worker", import.meta.url),
            { type: "module" },
          )
      : undefined,
  );
  signal?.throwIfAborted();
  const serialized = JSON.stringify(result);
  if (new TextEncoder().encode(serialized).length <= 65536)
    return { mode: "inline" as const, ...result };
  if (!context) throw new FormatterError("unsupported");
  const saved: string[] = [];
  try {
    const artifacts = [];
    for (const [filename, value] of [
      [result.filename, result.output],
      ["report.json", serialized],
    ]) {
      const record = await context.artifacts.write(
        [new TextEncoder().encode(value)],
        {
          filename,
          mimeType: "text/plain;charset=utf-8",
          limit: FORMATTER_OUTPUT_LIMIT,
        },
        signal,
      );
      saved.push(record.id);
      signal?.throwIfAborted();
      artifacts.push({
        id: record.id,
        bytes: record.bytes,
        mimeType: record.mimeType,
        filename: record.filename,
        expiresAt: record.expiresAt,
        ...(context.transport === "mcp"
          ? { path: record.path }
          : { downloadUrl: `/api/v1/artifacts/${record.id}` }),
      });
    }
    return {
      mode: "artifacts" as const,
      bytes: result.bytes,
      filename: result.filename,
      issueCount: result.issues.length,
      formatError: result.formatError,
      artifacts,
    };
  } catch (error) {
    for (const id of saved) await context.artifacts.remove(id);
    throw error;
  }
}
export const formatterOperations: Operation[] = formatterIds.map((id) => ({
  id,
  name: `tooltab_${id.replaceAll("-", "_")}`,
  description:
    "Format code locally with fixed language plugins or SQL dialects and heuristic diagnostics. Never executes source, queries, user plugins or project configuration. Complete large results use temporary artifacts.",
  inputSchema: formatterSchemas(id).inline,
  outputSchema: formatterOutputSchema,
  bodyLimit: FORMATTER_INPUT_LIMIT * 6 + 4096,
  idempotent: false,
  run: (input, signal, context) =>
    runFormatterTool(id, input, signal, undefined, context),
}));

function decodeUtf8(decoder: TextDecoder, bytes?: Uint8Array, stream = false) {
  try {
    return decoder.decode(bytes, { stream });
  } catch {
    throw new FormatterError(
      "invalid_input",
      "Input file must contain valid UTF-8.",
    );
  }
}
