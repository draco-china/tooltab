import { readFile } from "node:fs/promises";
import * as z from "zod/v4";
import {
  type AnalysisJob,
  type AnalysisResult,
  MAX_RESULT_BYTES,
  MAX_TEXT_BYTES,
  TextAnalysisError,
} from "@workspace/tools/text/analysis";
import { runTextAnalysisWorker } from "@/features/tools/text-analysis/worker-client";
import { streamAuthorizedFile } from "./files";
import type { WebpContext } from "./image-webp";
import type { Operation } from "./operation-contract";
import { serviceWorkerUrl } from "./worker-url";

const text = z.string().max(MAX_TEXT_BYTES),
  upload = z.string().min(1),
  path = z.string().min(1).max(4096);
const diffShape = {
  original: text.optional(),
  originalUploadId: upload.optional(),
  modified: text.optional(),
  modifiedUploadId: upload.optional(),
  ignoreCase: z.boolean().default(false),
  ignoreWhitespace: z.boolean().default(false),
  hideUnchanged: z.boolean().default(false),
};
const regexShape = {
  input: text.optional(),
  inputUploadId: upload.optional(),
  pattern: z.string().max(65536),
  flags: z.string().max(32).default("g"),
  replacement: z
    .string()
    .max(1024 * 1024)
    .default(""),
};
const exactly = (...v: unknown[]) =>
  v.filter((x) => x !== undefined).length === 1;
export const textDiffInputSchema = z
  .strictObject(diffShape)
  .refine(
    (p) =>
      exactly(p.original, p.originalUploadId) &&
      exactly(p.modified, p.modifiedUploadId),
  );
export const regexInputSchema = z
  .strictObject(regexShape)
  .refine((p) => exactly(p.input, p.inputUploadId));
export const textDiffMcpInputSchema = z
  .strictObject({
    ...diffShape,
    originalPath: path.optional(),
    modifiedPath: path.optional(),
  })
  .refine(
    (p) =>
      exactly(p.original, p.originalUploadId, p.originalPath) &&
      exactly(p.modified, p.modifiedUploadId, p.modifiedPath),
  );
export const regexMcpInputSchema = z
  .strictObject({ ...regexShape, inputPath: path.optional() })
  .refine((p) => exactly(p.input, p.inputUploadId, p.inputPath));
const diffStats = z.strictObject({
  originalLineCount: z.number(),
  modifiedLineCount: z.number(),
  unchanged: z.number(),
  changed: z.number(),
  added: z.number(),
  removed: z.number(),
});
const regexStats = z.strictObject({
  matchCount: z.number(),
  groupCount: z.number(),
  zeroLengthCount: z.number(),
});
const token = z.strictObject({
  kind: z.enum(["equal", "add", "remove"]),
  value: z.string(),
});
const side = z.strictObject({
  lineNumber: z.number().nullable(),
  text: z.string(),
  tokens: z.array(token),
});
const match = z.strictObject({
  index: z.number(),
  end: z.number(),
  match: z.string(),
  groups: z.array(z.string().nullable()),
  namedGroups: z.record(z.string(), z.string().nullable()),
});
const result = z.union([
  z.strictObject({
    kind: z.literal("diff"),
    rows: z.array(
      z.strictObject({
        kind: z.enum(["equal", "add", "remove", "replace"]),
        original: side,
        modified: side,
      }),
    ),
    rowsTruncated: z.boolean(),
    unifiedText: z.string(),
    stats: diffStats,
  }),
  z.strictObject({
    kind: z.literal("regex"),
    flags: z.string(),
    matches: z.array(match),
    matchesTruncated: z.boolean(),
    segments: z.array(
      z.strictObject({
        text: z.string(),
        isMatch: z.boolean(),
        index: z.number(),
      }),
    ),
    previewTruncated: z.boolean(),
    replacementOutput: z.string(),
    replacementJson: z.string().nullable(),
    matchesTsv: z.string(),
    matchesPreviewText: z.string(),
    summary: regexStats,
  }),
]);
export const textAnalysisOutputSchema = z.union([
  z.strictObject({ mode: z.literal("inline"), result }),
  z.strictObject({
    mode: z.literal("artifacts"),
    kind: z.enum(["diff", "regex"]),
    summary: z.union([diffStats, regexStats]),
    artifacts: z.array(
      z.strictObject({
        id: z.string(),
        bytes: z.number(),
        mimeType: z.string(),
        filename: z.string(),
        expiresAt: z.number(),
        path: z.string().optional(),
        downloadUrl: z.string().optional(),
      }),
    ),
  }),
]);
async function source(
  input: string | undefined,
  uploadId: string | undefined,
  inputPath: string | undefined,
  signal?: AbortSignal,
  roots: readonly string[] = [],
  context?: WebpContext,
) {
  if (input !== undefined) return input;
  const decoder = new TextDecoder("utf-8", { fatal: true }),
    parts: string[] = [];
  if (inputPath) {
    for await (const bytes of streamAuthorizedFile(
      inputPath,
      roots,
      signal,
      MAX_TEXT_BYTES,
    )) {
      try {
        parts.push(decoder.decode(bytes, { stream: true }));
      } catch {
        throw new TextAnalysisError("read_failed");
      }
    }
    try {
      parts.push(decoder.decode());
    } catch {
      throw new TextAnalysisError("read_failed");
    }
    return parts.join("");
  }
  if (!uploadId || !context) throw new TextAnalysisError("invalid_options");
  const record = await context.artifacts.get(uploadId, "upload");
  if (record.bytes > MAX_TEXT_BYTES) throw new TextAnalysisError("too_large");
  const bytes = await readFile(record.path, { signal });
  if (bytes.byteLength > MAX_TEXT_BYTES)
    throw new TextAnalysisError("too_large");
  try {
    return decoder.decode(bytes);
  } catch {
    throw new TextAnalysisError("read_failed");
  }
}
let active = 0;
export async function runTextAnalysis(
  id: string,
  input: unknown,
  signal?: AbortSignal,
  roots: readonly string[] = [],
  context?: WebpContext,
) {
  signal?.throwIfAborted();
  if (active) throw new TextAnalysisError("busy");
  active++;
  const saved: string[] = [];
  try {
    let job: AnalysisJob;
    if (id === "text-diff") {
      const p = textDiffMcpInputSchema.parse(input);
      job = {
        kind: "diff",
        original: await source(
          p.original,
          p.originalUploadId,
          p.originalPath,
          signal,
          roots,
          context,
        ),
        modified: await source(
          p.modified,
          p.modifiedUploadId,
          p.modifiedPath,
          signal,
          roots,
          context,
        ),
        ignoreCase: p.ignoreCase,
        ignoreWhitespace: p.ignoreWhitespace,
        hideUnchanged: p.hideUnchanged,
      };
    } else if (id === "regex-tester-replacer") {
      const p = regexMcpInputSchema.parse(input);
      job = {
        kind: "regex",
        input: await source(
          p.input,
          p.inputUploadId,
          p.inputPath,
          signal,
          roots,
          context,
        ),
        pattern: p.pattern,
        flags: p.flags,
        replacement: p.replacement,
      };
    } else throw new TextAnalysisError("invalid_options");
    const output = await runTextAnalysisWorker(
      job,
      signal,
      undefined,
      import.meta.env.PROD
        ? () =>
            new Worker(
              serviceWorkerUrl("text-analysis-worker", import.meta.url),
              { type: "module" },
            )
        : undefined,
    );
    signal?.throwIfAborted();
    const files = analysisFiles(output);
    if (files.reduce((n, f) => n + f.text.length, 0) <= 4000) {
      const payload = { mode: "inline" as const, result: output };
      if (new TextEncoder().encode(JSON.stringify(payload)).length <= 65536)
        return payload;
    }
    if (!context) throw new TextAnalysisError("artifact_required");
    const artifacts = [];
    for (const file of files) {
      async function* chunks() {
        for (let i = 0; i < file.text.length; ) {
          signal?.throwIfAborted();
          let end = Math.min(i + 65536, file.text.length);
          if (
            end < file.text.length &&
            /[\uD800-\uDBFF]/.test(file.text[end - 1] ?? "")
          )
            end--;
          yield new TextEncoder().encode(file.text.slice(i, end));
          i = end;
        }
      }
      const record = await context.artifacts.write(
        chunks(),
        {
          limit: MAX_RESULT_BYTES,
          mimeType: file.mimeType,
          filename: file.filename,
        },
        signal,
      );
      saved.push(record.id);
      const { id, bytes, mimeType, filename, expiresAt } = record;
      artifacts.push({
        id,
        bytes,
        mimeType,
        filename,
        expiresAt,
        ...(context.transport === "mcp"
          ? { path: record.path }
          : { downloadUrl: `/api/v1/artifacts/${id}` }),
      });
    }
    signal?.throwIfAborted();
    return {
      mode: "artifacts" as const,
      kind: output.kind,
      summary: output.kind === "diff" ? output.stats : output.summary,
      artifacts,
    };
  } catch (error) {
    if (context)
      await Promise.allSettled(saved.map((id) => context.artifacts.remove(id)));
    throw error;
  } finally {
    active--;
  }
}
export function analysisFiles(result: AnalysisResult) {
  return result.kind === "diff"
    ? [
        {
          filename: "comparison.diff",
          mimeType: "text/plain;charset=utf-8",
          text: result.unifiedText,
        },
      ]
    : [
        {
          filename: "matches.tsv",
          mimeType: "text/tab-separated-values;charset=utf-8",
          text: result.matchesTsv,
        },
        {
          filename: "replacement.txt",
          mimeType: "text/plain;charset=utf-8",
          text: result.replacementOutput,
        },
        ...(result.replacementJson
          ? [
              {
                filename: "replacement.json",
                mimeType: "application/json",
                text: result.replacementJson,
              },
            ]
          : []),
      ];
}
export const textAnalysisOperations: Operation[] = [
  {
    id: "text-diff",
    name: "tooltab_text_diff",
    description:
      "Compare normalized lines and inline word changes with optional case/all-whitespace ignoring. Reports line counts and a complete readable unified diff (not a patch). Large output becomes a complete artifact. 16 MiB per input, 200k lines, 10-second cancellable Worker.",
    inputSchema: textDiffInputSchema,
    outputSchema: textAnalysisOutputSchema,
    bodyLimit: MAX_TEXT_BYTES * 12 + 100000,
    idempotent: false,
    run(input, signal, context) {
      return runTextAnalysis(
        "text-diff",
        textDiffInputSchema.parse(input),
        signal,
        [],
        context,
      );
    },
  },
  {
    id: "regex-tester-replacer",
    name: "tooltab_regex_tester_replacer",
    description:
      "JavaScript regex g/i/m/s/u/y matching, capture groups, named groups, zero-length counts and full replacement semantics. Preview is bounded; exported TSV and replacement cover all matches, up to 128 MiB each. 16 MiB input, 64 KiB pattern, 1 MiB replacement; 10-second cancellable Worker. Lone-surrogate replacements additionally export a lossless JSON string.",
    inputSchema: regexInputSchema,
    outputSchema: textAnalysisOutputSchema,
    bodyLimit: MAX_TEXT_BYTES * 6 + 7 * 1024 * 1024,
    idempotent: false,
    run(input, signal, context) {
      return runTextAnalysis(
        "regex-tester-replacer",
        regexInputSchema.parse(input),
        signal,
        [],
        context,
      );
    },
  },
];
