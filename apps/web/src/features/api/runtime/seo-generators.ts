import { readFile } from "node:fs/promises";
import * as z from "zod/v4";
import { robotsSchema, sitemapSchema } from "@workspace/tools/project/seo";
import {
  MAX_SEO_INPUT,
  MAX_SEO_OUTPUT,
  SeoError,
  type SeoJob,
} from "@workspace/tools/project/seo";
import { runSeoWorker } from "@/features/tools/seo-generators/worker-client";
import { streamAuthorizedFile } from "./files";
import type { WebpContext } from "./image-webp";
import type { Operation } from "./operation-contract";
import { serviceWorkerUrl } from "./worker-url";
export const seoDefinitions = [
  ["robots-txt-generator", "robots"],
  ["sitemap-xml-generator", "sitemap"],
] as const;
export function seoSchemas(id: string) {
  const state = id === "robots-txt-generator" ? robotsSchema : sitemapSchema,
    inline = z.union([
      z.strictObject({ state }),
      z.strictObject({ inputUploadId: z.string().min(1) }),
    ]);
  return {
    inline,
    mcp: z.union([
      inline,
      z.strictObject({ inputPath: z.string().min(1).max(4096) }),
    ]),
  };
}
const summary = {
  bytes: z.number(),
  count: z.number(),
  warnings: z.array(z.string()),
  filename: z.string(),
};
export const seoOutputSchema = z.union([
  z.strictObject({ ...summary, mode: z.literal("inline"), output: z.string() }),
  z.strictObject({
    ...summary,
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
export async function runSeoTool(
  id: string,
  input: unknown,
  signal?: AbortSignal,
  roots?: readonly string[],
  context?: WebpContext,
) {
  signal?.throwIfAborted();
  const definition = seoDefinitions.find(([slug]) => id === slug);
  if (!definition) throw new SeoError("invalid_input");
  if (context?.transport === "http" && roots !== undefined)
    throw new SeoError("invalid_input");
  const params = (
    roots === undefined ? seoSchemas(id).inline : seoSchemas(id).mcp
  ).parse(input);
  let state: unknown;
  if ("state" in params) state = params.state;
  else {
    let text: string;
    if ("inputPath" in params) {
      const parts: string[] = [],
        decoder = new TextDecoder("utf8", { fatal: true });
      for await (const chunk of streamAuthorizedFile(
        params.inputPath,
        roots ?? [],
        signal,
        MAX_SEO_INPUT,
      ))
        parts.push(decoder.decode(chunk, { stream: true }));
      parts.push(decoder.decode());
      text = parts.join("");
    } else {
      if (!context) throw new SeoError("invalid_input");
      const record = await context.artifacts.get(
        params.inputUploadId,
        "upload",
      );
      if (record.bytes > MAX_SEO_INPUT) throw new SeoError("too_large");
      const bytes = await readFile(record.path, { signal });
      if (bytes.length > MAX_SEO_INPUT) throw new SeoError("too_large");
      text = new TextDecoder("utf8", { fatal: true }).decode(bytes);
    }
    try {
      state = JSON.parse(text);
    } catch {
      throw new SeoError("invalid_input");
    }
  }
  const job =
    definition[1] === "robots"
      ? { kind: "robots", state: robotsSchema.parse(state) }
      : { kind: "sitemap", state: sitemapSchema.parse(state) };
  const { highlighted: _, ...result } = await runSeoWorker(
    job as SeoJob,
    signal,
    import.meta.env.PROD
      ? () =>
          new Worker(
            serviceWorkerUrl("seo-generators-worker", import.meta.url),
            { type: "module" },
          )
      : undefined,
  );
  signal?.throwIfAborted();
  if (new TextEncoder().encode(JSON.stringify(result)).length <= 65536)
    return { mode: "inline" as const, ...result };
  if (!context) throw new SeoError("unsupported");
  let saved: string | undefined;
  try {
    const record = await context.artifacts.write(
      [new TextEncoder().encode(result.output)],
      {
        filename: result.filename,
        mimeType:
          definition[1] === "robots"
            ? "text/plain;charset=utf-8"
            : "application/xml",
        limit: MAX_SEO_OUTPUT,
      },
      signal,
    );
    saved = record.id;
    signal?.throwIfAborted();
    const { output: _, ...summary } = result;
    const { id, bytes, mimeType, filename, expiresAt } = record;
    return {
      mode: "artifact" as const,
      ...summary,
      artifact: {
        id,
        bytes,
        mimeType,
        filename,
        expiresAt,
        ...(context.transport === "mcp"
          ? { path: record.path }
          : { downloadUrl: `/api/v1/artifacts/${id}` }),
      },
    };
  } catch (error) {
    if (saved) await context.artifacts.remove(saved);
    throw error;
  }
}
export const seoOperations: Operation[] = seoDefinitions.map(([id]) => ({
  id,
  name: `tooltab_${id.replaceAll("-", "_")}`,
  description:
    "Generate complete robots.txt or sitemap XML locally, including all audited groups, directives, modes and entry options. Does not fetch URLs or persist drafts. Cancellable Worker; full large output becomes a temporary artifact.",
  inputSchema: seoSchemas(id).inline,
  outputSchema: seoOutputSchema,
  bodyLimit: MAX_SEO_INPUT * 6 + 4096,
  idempotent: false,
  run: (input, signal, context) =>
    runSeoTool(id, input, signal, undefined, context),
}));
