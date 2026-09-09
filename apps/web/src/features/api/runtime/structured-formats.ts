import { readFile } from "node:fs/promises";
import * as z from "zod/v4";
import {
  MAX_STRUCTURED_INPUT,
  MAX_STRUCTURED_OUTPUT,
  StructuredError,
  type StructuredFormat,
} from "@workspace/tools/encoding/structured";
import { runStructuredWorker } from "@/features/tools/structured-formats/worker-client";
import { streamAuthorizedFile } from "./files";
import type { WebpContext } from "./image-webp";
import type { Operation } from "./operation-contract";
import { serviceWorkerUrl } from "./worker-url";
export const structuredDefinitions = [
  ["json-to-yaml-converter", "json", "yaml"],
  ["yaml-to-json-converter", "yaml", "json"],
  ["json-to-toml-converter", "json", "toml"],
  ["toml-to-json-converter", "toml", "json"],
  ["yaml-to-toml-converter", "yaml", "toml"],
  ["toml-to-yaml-converter", "toml", "yaml"],
] as const;
export const structuredInputSchema = z
  .strictObject({
    input: z.string().max(MAX_STRUCTURED_INPUT).optional(),
    inputUploadId: z.string().min(1).optional(),
  })
  .refine((p) => (p.input !== undefined) !== (p.inputUploadId !== undefined));
export const structuredPathSchema = z.strictObject({
  inputPath: z.string().min(1).max(4096),
});
export const structuredMcpInputSchema = z.union([
  structuredInputSchema,
  structuredPathSchema,
]);
export const structuredOutputSchema = z.union([
  z.strictObject({
    mode: z.literal("inline"),
    output: z.string(),
    bytes: z.number(),
  }),
  z.strictObject({
    mode: z.literal("artifact"),
    bytes: z.number(),
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
export async function runStructured(
  id: string,
  input: unknown,
  signal?: AbortSignal,
  roots?: readonly string[],
  context?: WebpContext,
) {
  signal?.throwIfAborted();
  const definition = structuredDefinitions.find(([slug]) => slug === id);
  if (!definition) throw new StructuredError("invalid_input");
  const params = (
    roots === undefined ? structuredInputSchema : structuredMcpInputSchema
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
        MAX_STRUCTURED_INPUT,
      ))
        parts.push(decoder.decode(chunk, { stream: true }));
      parts.push(decoder.decode());
    } catch (e) {
      if (e instanceof TypeError) throw new StructuredError("read_failed");
      throw e;
    }
    text = parts.join("");
  } else if (params.input !== undefined) text = params.input;
  else {
    if (!context || !params.inputUploadId)
      throw new StructuredError("invalid_input");
    const record = await context.artifacts.get(params.inputUploadId, "upload");
    if (record.bytes > MAX_STRUCTURED_INPUT)
      throw new StructuredError("too_large");
    const bytes = await readFile(record.path, { signal });
    if (bytes.length > MAX_STRUCTURED_INPUT)
      throw new StructuredError("too_large");
    try {
      text = new TextDecoder("utf8", { fatal: true }).decode(bytes);
    } catch {
      throw new StructuredError("read_failed");
    }
  }
  const result = await runStructuredWorker(
    {
      input: text,
      from: definition[1] as StructuredFormat,
      to: definition[2] as StructuredFormat,
    },
    signal,
    import.meta.env.PROD
      ? () =>
          new Worker(
            serviceWorkerUrl("structured-formats-worker", import.meta.url),
            { type: "module" },
          )
      : undefined,
  );
  signal?.throwIfAborted();
  if (result.bytes <= 65536) return { mode: "inline" as const, ...result };
  if (!context) throw new StructuredError("unsupported");
  const bytes = new TextEncoder().encode(result.output);
  let saved: string | undefined;
  try {
    const record = await context.artifacts.write(
      [bytes],
      {
        limit: MAX_STRUCTURED_OUTPUT,
        mimeType: "text/plain;charset=utf-8",
        filename: `converted.${definition[2]}`,
      },
      signal,
    );
    saved = record.id;
    signal?.throwIfAborted();
    const { id, bytes: count, mimeType, filename, expiresAt } = record;
    return {
      mode: "artifact" as const,
      bytes: count,
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
    if (saved) await context.artifacts.remove(saved);
    throw e;
  }
}
export const structuredOperations: Operation[] = structuredDefinitions.map(
  ([id, from, to]) => ({
    id,
    name: `tooltab_${id.replaceAll("-", "_")}`,
    description: `Convert ${from} to ${to} locally. Preserves large integer values and rejects unsupported numeric/date precision or target values. Input32MiB/output128MiB/depth128; cancellable Worker, large results become complete temporary artifacts.`,
    inputSchema: structuredInputSchema,
    outputSchema: structuredOutputSchema,
    bodyLimit: MAX_STRUCTURED_INPUT * 6 + 1024,
    idempotent: false,
    run: (input, signal, context) =>
      runStructured(id, input, signal, undefined, context),
  }),
);
