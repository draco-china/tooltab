import { readFile } from "node:fs/promises";
import * as z from "zod/v4";
import {
  jsonDefaults,
  MAX_XML_INPUT,
  MAX_XML_OUTPUT,
  XmlJsonError,
  type XmlJsonJob,
  xmlDefaults,
} from "@workspace/tools/encoding/xml-json";
import { runXmlJsonWorker } from "@/features/tools/xml-json/worker-client";
import { streamAuthorizedFile } from "./files";
import type { WebpContext } from "./image-webp";
import type { Operation } from "./operation-contract";
import { serviceWorkerUrl } from "./worker-url";
export const xmlJsonDefinitions = [
  ["json-to-xml-converter", "json", "xml"],
  ["xml-to-json-converter", "xml", "json"],
] as const;
export function xmlJsonSchemas(id: string) {
  const defaults = id === "json-to-xml-converter" ? jsonDefaults : xmlDefaults;
  const options = z
    .strictObject(
      Object.fromEntries(
        Object.entries(defaults).map(([key, value]) => [
          key,
          typeof value === "boolean"
            ? z.boolean().default(value)
            : typeof value === "number"
              ? z.number().int().min(0).max(8).default(value)
              : z.string().min(1).max(256).default(value),
        ]),
      ),
    )
    .optional();
  const inline = z
    .strictObject({
      input: z.string().max(MAX_XML_INPUT).optional(),
      inputUploadId: z.string().min(1).optional(),
      options,
    })
    .refine((p) => (p.input !== undefined) !== (p.inputUploadId !== undefined));
  const path = z.strictObject({
    inputPath: z.string().min(1).max(4096),
    options,
  });
  return { inline, path, mcp: z.union([inline, path]) };
}
export const xmlJsonOutputSchema = z.union([
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
export async function runXmlJson(
  id: string,
  input: unknown,
  signal?: AbortSignal,
  roots?: readonly string[],
  context?: WebpContext,
) {
  signal?.throwIfAborted();
  const definition = xmlJsonDefinitions.find(([slug]) => slug === id);
  if (!definition) throw new XmlJsonError("invalid_input");
  const params = (
    roots === undefined ? xmlJsonSchemas(id).inline : xmlJsonSchemas(id).mcp
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
        MAX_XML_INPUT,
      ))
        parts.push(decoder.decode(chunk, { stream: true }));
      parts.push(decoder.decode());
    } catch (e) {
      if (e instanceof TypeError) throw new XmlJsonError("read_failed");
      throw e;
    }
    text = parts.join("");
  } else if (params.input !== undefined) text = params.input;
  else {
    if (!context || !params.inputUploadId)
      throw new XmlJsonError("invalid_input");
    const record = await context.artifacts.get(params.inputUploadId, "upload");
    if (record.bytes > MAX_XML_INPUT) throw new XmlJsonError("too_large");
    const bytes = await readFile(record.path, { signal });
    if (bytes.length > MAX_XML_INPUT) throw new XmlJsonError("too_large");
    try {
      text = new TextDecoder("utf8", { fatal: true }).decode(bytes);
    } catch {
      throw new XmlJsonError("read_failed");
    }
  }
  const result = await runXmlJsonWorker(
    {
      input: text,
      direction: definition[1] === "json" ? "json-to-xml" : "xml-to-json",
      options: params.options,
    } as XmlJsonJob,
    signal,
    import.meta.env.PROD
      ? () =>
          new Worker(serviceWorkerUrl("xml-json-worker", import.meta.url), {
            type: "module",
          })
      : undefined,
  );
  signal?.throwIfAborted();
  if (result.bytes <= 65536) return { mode: "inline" as const, ...result };
  if (!context) throw new XmlJsonError("unsupported");
  const bytes = new TextEncoder().encode(result.output);
  let saved: string | undefined;
  try {
    const record = await context.artifacts.write(
      [bytes],
      {
        limit: MAX_XML_OUTPUT,
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
export const xmlJsonOperations: Operation[] = xmlJsonDefinitions.map(
  ([id, from, to]) => ({
    id,
    name: `tooltab_${id.replaceAll("-", "_")}`,
    description: `Convert ${from} to ${to} locally. Preserves large integers. Supports all upstream XML shape/filter flags or JSON element naming/formatting options. External entities are never fetched; unresolved entities fail. Input32MiB/output128MiB/depth128; cancellable Worker, large results become complete temporary artifacts.`,
    inputSchema: xmlJsonSchemas(id).inline,
    outputSchema: xmlJsonOutputSchema,
    bodyLimit: MAX_XML_INPUT * 6 + 1024,
    idempotent: false,
    run: (input, signal, context) =>
      runXmlJson(id, input, signal, undefined, context),
  }),
);
