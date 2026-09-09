import { readFile } from "node:fs/promises";
import * as z from "zod/v4";
import {
  MAX_SCHEMA_INPUT,
  MAX_SCHEMA_OUTPUT,
  SchemaToolError,
} from "@workspace/tools/json/schema-contract";
import type { SchemaJob } from "@/features/tools/json-schema-tools/jobs";
import { runSchemaWorker } from "@/features/tools/json-schema-tools/worker-client";
import { streamAuthorizedFile } from "./files";
import type { WebpContext } from "./image-webp";
import type { Operation } from "./operation-contract";
import { serviceWorkerUrl } from "./worker-url";
export const schemaToolDefinitions = [
  ["json-diff-path", "diff"],
  ["json-schema-generator", "generate"],
  ["json-schema-validator", "validate"],
] as const;
const source = (prefix: string, path: boolean) => ({
  [prefix]: z.string().max(MAX_SCHEMA_INPUT).optional(),
  [`${prefix}UploadId`]: z.uuid().optional(),
  ...(path
    ? { [`${prefix}Path`]: z.string().min(1).max(4096).optional() }
    : {}),
});
const one = (p: Record<string, unknown>, prefix: string) =>
  [p[prefix], p[`${prefix}UploadId`], p[`${prefix}Path`]].filter(
    (v) => v !== undefined,
  ).length === 1;
export function schemaToolInputSchema(id: string, path = false) {
  const kind = schemaToolDefinitions.find(([slug]) => slug === id)?.[1];
  if (!kind) throw new SchemaToolError("invalid_options");
  const fields =
    kind === "diff"
      ? {
          ...source("modified", path),
          operations: z
            .array(z.enum(["add", "remove", "replace"]))
            .max(3)
            .default(["add", "remove", "replace"]),
          mode: z.enum(["paths", "patch"]).default("paths"),
        }
      : kind === "generate"
        ? {
            options: z
              .strictObject({
                draft: z
                  .enum(["2020-12", "2019-09", "draft-07"])
                  .default("2020-12"),
                inferRequired: z.boolean().default(true),
                allowAdditionalProperties: z.boolean().default(true),
                detectFormat: z.boolean().default(true),
              })
              .default({
                draft: "2020-12",
                inferRequired: true,
                allowAdditionalProperties: true,
                detectFormat: true,
              }),
          }
        : {
            ...source("schema", path),
            allErrors: z.boolean().default(true),
            validateFormats: z.boolean().default(true),
          };
  return z
    .strictObject({ ...source("input", path), ...fields })
    .refine(
      (p) =>
        one(p, "input") &&
        (kind === "generate" ||
          one(p, kind === "diff" ? "modified" : "schema")),
    );
}
const summary = {
  kind: z.enum(["diff", "generate", "validate"]),
  bytes: z.number().int(),
  count: z.number().int(),
  valid: z.boolean().nullable(),
  draft: z.string().nullable(),
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
export const schemaToolOutputSchema = z.union([
  z.strictObject({ mode: z.literal("inline"), ...summary, output: z.string() }),
  z.strictObject({ mode: z.literal("artifact"), ...summary, artifact }),
]);
async function readSource(
  p: Record<string, unknown>,
  prefix: string,
  signal?: AbortSignal,
  context?: WebpContext,
) {
  const text = p[prefix];
  if (typeof text === "string") return text;
  const path = p[`${prefix}Path`];
  if (typeof path === "string") {
    if (context?.transport !== "mcp")
      throw new SchemaToolError("invalid_options");
    const decoder = new TextDecoder("utf-8", { fatal: true }),
      parts: string[] = [];
    try {
      for await (const bytes of streamAuthorizedFile(
        path,
        context.inputRoots ?? [],
        signal,
        MAX_SCHEMA_INPUT,
      ))
        parts.push(decoder.decode(bytes, { stream: true }));
      parts.push(decoder.decode());
      return parts.join("");
    } catch (e) {
      if (e instanceof TypeError) throw new SchemaToolError("read_failed");
      throw e;
    }
  }
  if (!context) throw new SchemaToolError("invalid_options");
  const record = await context.artifacts.get(
    String(p[`${prefix}UploadId`]),
    "upload",
  );
  if (record.bytes > MAX_SCHEMA_INPUT) throw new SchemaToolError("too_large");
  const bytes = await readFile(record.path, { signal });
  if (bytes.length > MAX_SCHEMA_INPUT) throw new SchemaToolError("too_large");
  try {
    return new TextDecoder("utf-8", { fatal: true }).decode(bytes);
  } catch {
    throw new SchemaToolError("read_failed");
  }
}
export async function runSchemaTool(
  id: string,
  input: unknown,
  signal?: AbortSignal,
  context?: WebpContext,
) {
  signal?.throwIfAborted();
  const kind = schemaToolDefinitions.find(([slug]) => slug === id)?.[1];
  if (!kind) throw new SchemaToolError("invalid_options");
  const p = schemaToolInputSchema(id, context?.transport === "mcp").parse(
    input,
  );
  const text = await readSource(p, "input", signal, context);
  const secondary =
    kind === "generate"
      ? null
      : await readSource(
          p,
          kind === "diff" ? "modified" : "schema",
          signal,
          context,
        );
  const job = {
    ...p,
    kind,
    input: text,
    ...(kind === "diff"
      ? { modified: secondary }
      : kind === "validate"
        ? { schema: secondary }
        : {}),
  } as SchemaJob;
  const result = await runSchemaWorker(
    job,
    signal,
    import.meta.env.PROD
      ? () =>
          new Worker(serviceWorkerUrl("json-schema-worker", import.meta.url), {
            type: "module",
          })
      : undefined,
  );
  signal?.throwIfAborted();
  if (result.bytes <= 65536) return { mode: "inline" as const, ...result };
  if (!context) throw new SchemaToolError("unsupported");
  let saved: string | undefined;
  try {
    const record = await context.artifacts.write(
      [new TextEncoder().encode(result.output)],
      {
        limit: MAX_SCHEMA_OUTPUT,
        mimeType: "application/json;charset=utf-8",
        filename: `${kind}-result.json`,
      },
      signal,
    );
    saved = record.id;
    signal?.throwIfAborted();
    const { output, ...summary } = result;
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
  } catch (e) {
    if (saved) await context.artifacts.remove(saved);
    throw e;
  }
}
export const schemaToolOperations: Operation[] = schemaToolDefinitions.map(
  ([id, kind]) => ({
    id,
    name: `tooltab_${id.replaceAll("-", "_")}`,
    description: `Local JSON ${kind} with complete output. Diff supports paths/JSON Patch and operation filters; generator supports all three drafts and inference options; validation supports draft07/2019-09/2020-12, formats and allErrors. No remote/file schema fetching. Precision loss is explicit. Input32MiB each/output128MiB/depth128; terminable Worker, complete large artifacts.`,
    inputSchema: schemaToolInputSchema(id),
    outputSchema: schemaToolOutputSchema,
    bodyLimit: MAX_SCHEMA_INPUT * 12 + 10000,
    idempotent: false,
    run: (input, signal, context) => runSchemaTool(id, input, signal, context),
  }),
);
