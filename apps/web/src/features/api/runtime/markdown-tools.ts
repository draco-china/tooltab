import { readFile } from "node:fs/promises";
import * as z from "zod/v4";
import {
  MAX_MARKDOWN_INPUT,
  MAX_MARKDOWN_OUTPUT,
  MarkdownError,
  htmlToMarkdownOptionsSchema,
} from "@workspace/tools/text/markdown-contract";
import { markdownDefaults } from "@/features/tools/markdown-tools/types";
import { runMarkdownWorker } from "@/features/tools/markdown-tools/worker-client";
import { streamAuthorizedFile } from "./files";
import type { WebpContext } from "./image-webp";
import type { Operation } from "./operation-contract";
import { serviceWorkerUrl } from "./worker-url";
export const markdownDefinitions = [
  ["markdown-previewer", "preview"],
  ["markdown-to-html-converter", "to-html"],
  ["html-to-markdown-converter", "to-markdown"],
] as const;
const options = {
  sanitize: z.boolean().default(true),
  theme: z.enum(["clean", "slate"]).default("clean"),
  language: z
    .string()
    .regex(/^[A-Za-z0-9-]{1,35}$/)
    .default("en-US"),
  direction: z.enum(["ltr", "rtl"]).default("ltr"),
  ...htmlToMarkdownOptionsSchema.shape,
};
export const markdownInputSchema = z
  .strictObject({
    input: z.string().max(MAX_MARKDOWN_INPUT).optional(),
    inputUploadId: z.string().min(1).optional(),
    ...options,
  })
  .refine((p) => (p.input !== undefined) !== (p.inputUploadId !== undefined));
export const markdownMcpInputSchema = z.union([
  markdownInputSchema,
  z.strictObject({ inputPath: z.string().min(1).max(4096), ...options }),
]);
const artifact = z.strictObject({
  id: z.string(),
  bytes: z.number(),
  mimeType: z.string(),
  filename: z.string(),
  expiresAt: z.number(),
  path: z.string().optional(),
  downloadUrl: z.string().optional(),
});
const stats = z.strictObject({
  words: z.number(),
  characters: z.number(),
  headings: z.number(),
  links: z.number(),
  images: z.number(),
  readTimeMinutes: z.number(),
});
const summary = {
  kind: z.enum(["preview", "to-html", "to-markdown"]),
  bytes: z.number(),
  stats,
  previewLimited: z.boolean(),
};
export const markdownOutputSchema = z.union([
  z.strictObject({
    ...summary,
    mode: z.literal("inline"),
    output: z.string(),
    document: z.string().nullable(),
    preview: z.string(),
    previewWithOutline: z.string(),
    printDocument: z.string(),
    printWithOutline: z.string(),
    highlighted: z.string(),
    toc: z.array(
      z.strictObject({ id: z.string(), text: z.string(), level: z.number() }),
    ),
  }),
  z.strictObject({
    ...summary,
    mode: z.literal("artifacts"),
    artifacts: z.array(artifact),
  }),
]);
export async function runMarkdownTool(
  id: string,
  input: unknown,
  signal?: AbortSignal,
  roots?: readonly string[],
  context?: WebpContext,
) {
  signal?.throwIfAborted();
  const definition = markdownDefinitions.find(([slug]) => slug === id);
  if (!definition) throw new MarkdownError("invalid_input");
  if (context?.transport === "http" && roots !== undefined)
    throw new MarkdownError("invalid_input");
  const params = (
    roots === undefined ? markdownInputSchema : markdownMcpInputSchema
  ).parse(input);
  let text: string;
  if ("inputPath" in params) {
    const decoder = new TextDecoder("utf8", { fatal: true });
    const parts: string[] = [];
    try {
      for await (const chunk of streamAuthorizedFile(
        params.inputPath,
        roots ?? [],
        signal,
        MAX_MARKDOWN_INPUT,
      ))
        parts.push(decoder.decode(chunk, { stream: true }));
      parts.push(decoder.decode());
    } catch (e) {
      if (e instanceof TypeError) throw new MarkdownError("read_failed");
      throw e;
    }
    text = parts.join("");
  } else if (params.input !== undefined) text = params.input;
  else {
    if (!context || !params.inputUploadId)
      throw new MarkdownError("invalid_input");
    const record = await context.artifacts.get(params.inputUploadId, "upload");
    if (record.bytes > MAX_MARKDOWN_INPUT) throw new MarkdownError("too_large");
    const bytes = await readFile(record.path, { signal });
    if (bytes.length > MAX_MARKDOWN_INPUT) throw new MarkdownError("too_large");
    try {
      text = new TextDecoder("utf8", { fatal: true }).decode(bytes);
    } catch {
      throw new MarkdownError("read_failed");
    }
  }
  const {
    input: _,
    inputUploadId: __,
    inputPath: ___,
    ...settings
  } = params as typeof params & {
    input?: string;
    inputUploadId?: string;
    inputPath?: string;
  };
  const result = await runMarkdownWorker(
    { ...markdownDefaults, ...settings, kind: definition[1], input: text },
    signal,
    import.meta.env.PROD
      ? () =>
          new Worker(
            serviceWorkerUrl("markdown-tools-worker", import.meta.url),
            { type: "module" },
          )
      : undefined,
  );
  signal?.throwIfAborted();
  const encoded = new TextEncoder().encode(JSON.stringify(result));
  if (encoded.length > MAX_MARKDOWN_OUTPUT)
    throw new MarkdownError("too_large");
  if (encoded.length <= 65536) return { mode: "inline" as const, ...result };
  if (!context) throw new MarkdownError("unsupported");
  const saved: string[] = [];
  try {
    const files = [
      { filename: "result.json", mimeType: "application/json", bytes: encoded },
      {
        filename:
          definition[1] === "to-markdown" ? "converted.md" : "converted.html",
        mimeType: "text/plain;charset=utf-8",
        bytes: new TextEncoder().encode(result.output),
      },
      ...(result.document
        ? [
            {
              filename: "document.html",
              mimeType: "text/plain;charset=utf-8",
              bytes: new TextEncoder().encode(result.document),
            },
          ]
        : []),
    ];
    const artifacts = [];
    for (const file of files) {
      const record = await context.artifacts.write(
        [file.bytes],
        {
          filename: file.filename,
          mimeType: file.mimeType,
          limit: MAX_MARKDOWN_OUTPUT,
        },
        signal,
      );
      saved.push(record.id);
      signal?.throwIfAborted();
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
    return {
      mode: "artifacts" as const,
      kind: result.kind,
      bytes: result.bytes,
      stats: result.stats,
      previewLimited: result.previewLimited,
      artifacts,
    };
  } catch (error) {
    await Promise.all(saved.map((id) => context.artifacts.remove(id)));
    throw error;
  }
}
export const markdownOperations: Operation[] = markdownDefinitions.map(
  ([id]) => ({
    id,
    name: `tooltab_${id.replaceAll("-", "_")}`,
    description:
      "Local complete Markdown/HTML conversion, GFM Markdown, Turndown formatting options, heading outline/statistics and source highlighting. Raw output is data and never executed; preview is separately sanitized with all remote resource loads disabled. Cancellable Worker; full large results are temporary artifacts.",
    inputSchema: markdownInputSchema,
    outputSchema: markdownOutputSchema,
    bodyLimit: MAX_MARKDOWN_INPUT * 6 + 4096,
    idempotent: false,
    run: (input, signal, context) =>
      runMarkdownTool(id, input, signal, undefined, context),
  }),
);
