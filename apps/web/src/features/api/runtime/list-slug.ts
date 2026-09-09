import { readFile } from "node:fs/promises";
import * as z from "zod/v4";
import {
  compareLists,
  DEFAULT_LIST_OPTIONS,
  DELIMITERS,
  generateSlug,
  ListSlugError,
  MAX_LIST_TEXT,
  MAX_SLUG_TEXT,
  RESULT_KEYS,
} from "@workspace/tools/text/lists";
import type { WebpContext } from "./image-webp";
import {
  type ListSlugServiceJob,
  startListSlugWorker,
  type WorkerReady,
} from "./list-slug-worker-client";
import type { Operation } from "./operation-contract";

const options = z.strictObject({
  delimiterMode: z.enum(DELIMITERS).default("newline"),
  customDelimiter: z.string().max(100).default("|"),
  trimItems: z.boolean().default(true),
  ignoreCase: z.boolean().default(false),
  omitEmptyItems: z.boolean().default(true),
  sortResults: z.boolean().default(false),
  locale: z.string().max(100).default("en-US"),
});
export const listInputSchema = z
  .strictObject({
    left: z.string().max(MAX_LIST_TEXT).optional(),
    leftUploadId: z.string().min(1).optional(),
    right: z.string().max(MAX_LIST_TEXT).optional(),
    rightUploadId: z.string().min(1).optional(),
    options: options.default(DEFAULT_LIST_OPTIONS),
  })
  .refine(
    (p) =>
      (p.left !== undefined) !== (p.leftUploadId !== undefined) &&
      (p.right !== undefined) !== (p.rightUploadId !== undefined),
  );
const summary = z.strictObject({
  totalCount: z.number(),
  uniqueCount: z.number(),
  duplicateCount: z.number(),
  uniqueItems: z.array(z.string()),
  duplicateItems: z.array(
    z.strictObject({ value: z.string(), count: z.number() }),
  ),
});
export const slugInputSchema = z
  .strictObject({
    input: z.string().max(MAX_SLUG_TEXT).optional(),
    inputUploadId: z.string().min(1).optional(),
    separator: z.enum(["-", "_", "."]).default("-"),
    caseMode: z.enum(["lower", "preserve"]).default("lower"),
  })
  .refine((p) => (p.input !== undefined) !== (p.inputUploadId !== undefined));
const countSummary = z.strictObject({
  totalCount: z.number(),
  uniqueCount: z.number(),
  duplicateCount: z.number(),
});
const artifactOutput = z.strictObject({
  mode: z.literal("artifacts"),
  summary: z.union([
    z.strictObject({ characters: z.number() }),
    z.strictObject({
      left: countSummary,
      right: countSummary,
      counts: z.record(z.enum(RESULT_KEYS), z.number()),
    }),
  ]),
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
});
async function source(
  text: string | undefined,
  uploadId: string | undefined,
  context?: WebpContext,
  signal?: AbortSignal,
) {
  if (text !== undefined) return text;
  if (!uploadId || !context) throw new ListSlugError("invalid_options");
  const record = await context.artifacts.get(uploadId, "upload");
  if (record.bytes > 30000000) throw new ListSlugError("too_large");
  const bytes = await readFile(record.path, { signal });
  if (bytes.byteLength > 30000000) throw new ListSlugError("too_large");
  try {
    return new TextDecoder("utf-8", { fatal: true, ignoreBOM: true }).decode(
      bytes,
    );
  } catch {
    throw new ListSlugError("read_failed");
  }
}
async function execute(
  job: ListSlugServiceJob,
  signal?: AbortSignal,
  context?: WebpContext,
) {
  signal?.throwIfAborted();
  const length =
    job.kind === "slug" ? job.input.length : job.left.length + job.right.length;
  if (length <= 4000)
    return job.kind === "slug"
      ? { output: generateSlug(job.input, job.separator, job.caseMode) }
      : compareLists(job.left, job.right, job.options);
  const worker = startListSlugWorker(signal);
  const saved: string[] = [];
  try {
    const ready = await worker.request<WorkerReady>(job);
    signal?.throwIfAborted();
    if (ready.inline !== undefined) return ready.inline;
    if (!context || !ready.files) throw new ListSlugError("invalid_options");
    const artifacts = [];
    for (const [index, file] of ready.files.entries()) {
      async function* chunks() {
        while (true) {
          signal?.throwIfAborted();
          const chunk = await worker.request<{
            data: Uint8Array;
            done: boolean;
          }>({ pull: index });
          if (chunk.data.length) yield chunk.data;
          if (chunk.done) return;
        }
      }
      const record = await context.artifacts.write(
        chunks(),
        {
          limit: 512 * 1024 * 1024,
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
    return { mode: "artifacts" as const, summary: ready.summary, artifacts };
  } catch (e) {
    if (context)
      await Promise.allSettled(saved.map((id) => context.artifacts.remove(id)));
    throw e;
  } finally {
    worker.close();
  }
}
export const listSlugOperations: Operation[] = [
  {
    id: "list-comparer",
    name: "tooltab_list_comparer",
    description:
      "Compare normalized item sets, preserving first-seen spelling and duplicate counts. Literal separators; comma is not a CSV parser. Sorting uses configurable locale and numeric collation. Large results become complete authenticated artifacts; uploaded text IDs avoid large JSON bodies.",
    inputSchema: listInputSchema,
    outputSchema: z.union([
      artifactOutput,
      z.strictObject({
        left: summary,
        right: summary,
        sharedItems: z.array(z.string()),
        leftOnlyItems: z.array(z.string()),
        rightOnlyItems: z.array(z.string()),
        allUniqueItems: z.array(z.string()),
      }),
    ]),
    bodyLimit: 120100000,
    idempotent: false,
    async run(input, signal, context) {
      signal?.throwIfAborted();
      const p = listInputSchema.parse(input);
      return execute(
        {
          kind: "list",
          left: await source(p.left, p.leftUploadId, context, signal),
          right: await source(p.right, p.rightUploadId, context, signal),
          options: p.options,
        },
        signal,
        context,
      );
    },
  },
  {
    id: "slug-generator",
    name: "tooltab_slug_generator",
    description:
      "Transliterate multilingual text into a Latin slug with hyphen/underscore/dot separator and lowercase/preserved case. Transliteration is not translation. Large output becomes a complete TXT artifact.",
    inputSchema: slugInputSchema,
    outputSchema: z.union([
      artifactOutput,
      z.strictObject({ output: z.string() }),
    ]),
    bodyLimit: 12010000,
    idempotent: false,
    async run(input, signal, context) {
      signal?.throwIfAborted();
      const p = slugInputSchema.parse(input);
      return execute(
        {
          kind: "slug",
          input: await source(p.input, p.inputUploadId, context, signal),
          separator: p.separator,
          caseMode: p.caseMode,
        },
        signal,
        context,
      );
    },
  },
];
