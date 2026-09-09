import { z } from "zod";
import {
  generateGitignore,
  gitignoreCatalog,
  gitignoreCategories,
  searchGitignores,
} from "@workspace/tools/project/gitignore";
import {
  OPENAPI_INPUT_LIMIT,
  OPENAPI_OUTPUT_LIMIT,
  openapiOptionsSchema,
  ProjectConfigError,
} from "@workspace/tools/project/openapi-contract";
import { resolveSource } from "./legacy-hashes";
import type { Operation } from "./operation-contract";
import { runOpenapiWorker } from "./project-config-worker-client";

const options = {
  options: openapiOptionsSchema.default(() => openapiOptionsSchema.parse({})),
  delivery: z.enum(["inline", "artifact"]).default("inline"),
};
const text = z.strictObject({
    ...options,
    input: z.string().max(OPENAPI_INPUT_LIMIT),
  }),
  upload = z.strictObject({ ...options, uploadId: z.uuid() });
export const openapiHttpSchema = z.union([text, upload]);
export const openapiSchema = z.union([
  text,
  upload,
  z.strictObject({ ...options, inputPath: z.string().min(1).max(4096) }),
]);
export const openapiOperation: Operation = {
  id: "openapi-to-typescript-converter",
  name: "tooltab_openapi_to_typescript_converter",
  description:
    "Generate complete TypeScript declarations locally from OpenAPI 3.0/3.1 JSON/YAML with all12 boolean options and internal references. External references rejected without network access; no user plugins/configuration. Input32MiB/output128MiB; unsafe numeric precision rejected. Inline64KiB serialized output; explicitly request delivery artifact for larger declarations. MCP file paths require authorized roots.",
  inputSchema: openapiSchema,
  outputSchema: z.union([
    z.strictObject({ output: z.string(), bytes: z.number().int() }),
    z.strictObject({
      mode: z.literal("artifact"),
      bytes: z.number().int(),
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
  ]),
  bodyLimit: OPENAPI_INPUT_LIMIT * 6 + 65536,
  idempotent: false,
  async run(value, signal, context) {
    const p = openapiSchema.parse(value),
      abort = signal ?? new AbortController().signal;
    abort.throwIfAborted();
    let input: string;
    if ("input" in p) input = p.input;
    else {
      const decoder = new TextDecoder("utf-8", { fatal: true }),
        pieces: string[] = [];
      let bytes = 0;
      try {
        for await (const chunk of resolveSource(
          "uploadId" in p
            ? { uploadId: p.uploadId }
            : { inputPath: p.inputPath },
          abort,
          context,
        )) {
          bytes += chunk.length;
          if (bytes > OPENAPI_INPUT_LIMIT)
            throw new ProjectConfigError("too_large");
          pieces.push(decoder.decode(chunk, { stream: true }));
        }
        pieces.push(decoder.decode());
        input = pieces.join("");
      } catch (e) {
        if (e instanceof TypeError)
          throw new ProjectConfigError("invalid_input");
        throw e;
      }
    }
    const result = await runOpenapiWorker({ input, options: p.options }, abort);
    abort.throwIfAborted();
    if (p.delivery === "inline") {
      if (
        result.bytes > 65536 ||
        new TextEncoder().encode(JSON.stringify(result)).length > 65536
      )
        throw new ProjectConfigError("artifact_required");
      return result;
    }
    if (!context) throw new ProjectConfigError("artifact_required");
    async function* source() {
      for (let cursor = 0; cursor < result.output.length; ) {
        abort.throwIfAborted();
        let end = Math.min(result.output.length, cursor + 65536);
        if (
          end < result.output.length &&
          /[\uD800-\uDBFF]/.test(result.output[end - 1])
        )
          end--;
        yield new TextEncoder().encode(result.output.slice(cursor, end));
        cursor = end;
      }
    }
    const record = await context.artifacts.write(
      source(),
      {
        filename: "openapi.d.ts",
        mimeType: "text/plain;charset=utf-8",
        limit: OPENAPI_OUTPUT_LIMIT,
      },
      abort,
    );
    try {
      abort.throwIfAborted();
      const { id, bytes, mimeType, filename, expiresAt } = record;
      return {
        mode: "artifact" as const,
        bytes: result.bytes,
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
      await context.artifacts.remove(record.id);
      throw e;
    }
  },
};
export const gitignoreSchema = z
  .strictObject({
    selected: z
      .array(z.string().max(200))
      .max(gitignoreCatalog.length)
      .default([]),
    query: z.string().max(1000).default(""),
    category: z.enum(["all", ...gitignoreCategories]).default("all"),
  })
  .refine(
    (p) =>
      p.selected.every((name) =>
        gitignoreCatalog.some((item) => item.name === name),
      ),
    { message: "Unknown template", path: ["selected"] },
  );
export const gitignoreOperation: Operation = {
  id: "gitignore-generator",
  name: "tooltab_gitignore_generator",
  description:
    "Search and combine all 295 unique fixed local GitHub gitignore templates across language/global/community. Return all matching names/categories and complete generated .gitignore. Selected templates are validated and sorted consistently. No files written or selections persisted; rules do not untrack existing Git files.",
  inputSchema: gitignoreSchema,
  outputSchema: z.strictObject({
    output: z.string(),
    selected: z.array(z.string()),
    matches: z.array(
      z.strictObject({
        name: z.string(),
        category: z.enum(gitignoreCategories),
      }),
    ),
    total: z.number().int(),
  }),
  bodyLimit: 65536,
  idempotent: true,
  run(value, signal) {
    signal?.throwIfAborted();
    const p = gitignoreSchema.parse(value);
    return {
      output: generateGitignore(p.selected),
      selected: gitignoreCatalog
        .filter((item) => p.selected.includes(item.name))
        .map((item) => item.name),
      matches: searchGitignores(p.query, p.category).map(
        ({ name, category }) => ({ name, category }),
      ),
      total: gitignoreCatalog.length,
    };
  },
};
