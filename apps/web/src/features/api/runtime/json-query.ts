import { readFile } from "node:fs/promises";
import * as z from "zod/v4";
import { runQueryWorker } from "@/features/tools/json-query/worker-client";
import {
  MAX_QUERY_INPUT,
  MAX_QUERY_OUTPUT,
  QueryError,
} from "@workspace/tools/json/value";
import { streamAuthorizedFile } from "./files";
import type { WebpContext } from "./image-webp";
import type { Operation } from "./operation-contract";
import { serviceWorkerUrl } from "./worker-url";
export const queryDefinitions = [
  ["jsonpath-tester", "jsonpath"],
  ["jmespath-tester", "jmespath"],
] as const;
const query = z.string().min(1).max(65536);
export const queryInputSchema = z
  .strictObject({
    input: z.string().max(MAX_QUERY_INPUT).optional(),
    inputUploadId: z.uuid().optional(),
    query,
  })
  .refine((p) => (p.input !== undefined) !== (p.inputUploadId !== undefined));
export const queryPathSchema = z.strictObject({
  inputPath: z.string().min(1).max(4096),
  query,
});
export const queryMcpSchema = z.union([queryInputSchema, queryPathSchema]);
const summary = {
  kind: z.enum(["jsonpath", "jmespath"]),
  count: z.number().int(),
  bytes: z.number().int(),
};
const artifact = z.strictObject({
  id: z.string(),
  bytes: z.number(),
  mimeType: z.string(),
  filename: z.string(),
  expiresAt: z.number(),
  path: z.string().optional(),
  downloadUrl: z.string().optional(),
});
export const queryOutputSchema = z.union([
  z.strictObject({
    mode: z.literal("inline"),
    ...summary,
    output: z.string(),
    paths: z.string().nullable(),
  }),
  z.strictObject({
    mode: z.literal("artifacts"),
    ...summary,
    artifacts: z.array(artifact),
  }),
]);
export async function runJsonQuery(
  id: string,
  input: unknown,
  signal?: AbortSignal,
  roots?: readonly string[],
  context?: WebpContext,
) {
  signal?.throwIfAborted();
  const definition = queryDefinitions.find(([slug]) => slug === id);
  if (!definition) throw new QueryError("invalid_query");
  const params = (
    roots === undefined ? queryInputSchema : queryMcpSchema
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
        MAX_QUERY_INPUT,
      ))
        parts.push(decoder.decode(chunk, { stream: true }));
      parts.push(decoder.decode());
    } catch (e) {
      if (e instanceof TypeError) throw new QueryError("read_failed");
      throw e;
    }
    text = parts.join("");
  } else if (params.input !== undefined) text = params.input;
  else {
    if (!context || !params.inputUploadId)
      throw new QueryError("invalid_query");
    const record = await context.artifacts.get(params.inputUploadId, "upload");
    if (record.bytes > MAX_QUERY_INPUT) throw new QueryError("too_large");
    const bytes = await readFile(record.path, { signal });
    if (bytes.length > MAX_QUERY_INPUT) throw new QueryError("too_large");
    try {
      text = new TextDecoder("utf8", { fatal: true }).decode(bytes);
    } catch {
      throw new QueryError("read_failed");
    }
  }
  const result = await runQueryWorker(
    { kind: definition[1], input: text, query: params.query },
    signal,
    import.meta.env.PROD
      ? () =>
          new Worker(serviceWorkerUrl("json-query-worker", import.meta.url), {
            type: "module",
          })
      : undefined,
  );
  signal?.throwIfAborted();
  if (result.bytes <= 65536) return { mode: "inline" as const, ...result };
  if (!context) throw new QueryError("unsupported");
  const saved: string[] = [],
    artifacts = [];
  try {
    for (const [filename, output] of [
      ["query-result.json", result.output],
      ...(result.paths === null ? [] : [["query-paths.json", result.paths]]),
    ]) {
      const record = await context.artifacts.write(
        [new TextEncoder().encode(output)],
        {
          limit: MAX_QUERY_OUTPUT,
          mimeType: "application/json;charset=utf-8",
          filename,
        },
        signal,
      );
      saved.push(record.id);
      signal?.throwIfAborted();
      const { id, bytes, mimeType, expiresAt } = record;
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
      count: result.count,
      bytes: result.bytes,
      artifacts,
    };
  } catch (e) {
    for (const id of saved) await context.artifacts.remove(id);
    throw e;
  }
}
export const jsonQueryOperations: Operation[] = queryDefinitions.map(
  ([id, kind]) => ({
    id,
    name: `tooltab_${id.replaceAll("-", "_")}`,
    description: `Evaluate ${kind} locally in a cancellable Worker. Complete values and JSONPath matching paths, exact large integers and own object keys. Pure bounded filters only, no arbitrary JavaScript. Input32MiB/query64KiB/output128MiB; large results become complete temporary JSON artifacts. Precision-losing numeric operations fail explicitly.`,
    inputSchema: queryInputSchema,
    outputSchema: queryOutputSchema,
    bodyLimit: MAX_QUERY_INPUT * 6 + 400000,
    idempotent: false,
    run: (input, signal, context) =>
      runJsonQuery(
        id,
        input,
        signal,
        context?.transport === "mcp" ? (context.inputRoots ?? []) : undefined,
        context,
      ),
  }),
);
