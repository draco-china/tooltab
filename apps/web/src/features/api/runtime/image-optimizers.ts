import { readFile } from "node:fs/promises";
import * as z from "zod/v4";
import {
  OPTIMIZER_OUTPUT_LIMIT,
  OptimizerError,
  type OptimizerJob,
  optimizedName,
  PNG_INPUT_LIMIT,
  SVG_INPUT_LIMIT,
} from "@workspace/tools/image/optimizer";
import { streamAuthorizedFile } from "./files";
import { runOptimizerServiceWorker } from "./image-optimizers-worker-client";
import type { WebpContext } from "./image-webp";
import type { Operation } from "./operation-contract";

const png = z.strictObject({
    level: z.number().int().min(0).max(6).default(2),
    interlace: z.boolean().default(false),
    optimiseAlpha: z.boolean().default(true),
  }),
  svg = z.strictObject({
    multipass: z.boolean().default(true),
    removeComments: z.boolean().default(true),
    removeMetadata: z.boolean().default(true),
    cleanupIds: z.boolean().default(true),
    convertColors: z.boolean().default(true),
    removeDimensions: z.boolean().default(false),
    inlineStyles: z.boolean().default(false),
  });
const fields = {
  filename: z.string().max(255).default("image"),
  delivery: z.enum(["inline", "artifact"]).default("artifact"),
};
function sourceSchemas(limit: number, text: boolean) {
  const inline = z.strictObject({
      input: z.string().max(text ? limit : Math.ceil(limit / 3) * 4),
    }),
    upload = z.strictObject({ inputUploadId: z.string().min(1) }),
    path = z.strictObject({ inputPath: z.string().min(1).max(4096) });
  return {
    inline: z.union([inline, upload]),
    path: z.union([inline, upload, path]),
  };
}
const pngSource = sourceSchemas(PNG_INPUT_LIMIT, false),
  svgSource = sourceSchemas(SVG_INPUT_LIMIT, true);
export const imageOptimizersSchemas = {
  "png-optimizer": {
    inline: z.strictObject({
      ...fields,
      source: pngSource.inline,
      options: png.default(() => png.parse({})),
    }),
    path: z.strictObject({
      ...fields,
      source: pngSource.path,
      options: png.default(() => png.parse({})),
    }),
  },
  "svg-optimizer": {
    inline: z.strictObject({
      ...fields,
      source: svgSource.inline,
      options: svg.default(() => svg.parse({})),
    }),
    path: z.strictObject({
      ...fields,
      source: svgSource.path,
      options: svg.default(() => svg.parse({})),
    }),
  },
};
export type ImageOptimizerId = keyof typeof imageOptimizersSchemas;
const properties = {
  originalBytes: z.number(),
  optimizedBytes: z.number(),
  savedBytes: z.number(),
  savedPercent: z.number(),
  width: z.number().optional(),
  height: z.number().optional(),
  bitDepth: z.number().optional(),
  interlaced: z.boolean().optional(),
  animated: z.boolean().optional(),
  chunksRemoved: z.array(z.string()).optional(),
  chunksChanged: z.array(z.string()).optional(),
  mimeType: z.string(),
  filename: z.string(),
};
export const imageOptimizersOutputSchema = z.union([
  z.strictObject({
    ...properties,
    delivery: z.literal("inline"),
    encoding: z.enum(["base64", "utf8"]),
    output: z.string(),
  }),
  z.strictObject({
    ...properties,
    delivery: z.literal("artifact"),
    artifact: z.strictObject({
      id: z.string(),
      bytes: z.number(),
      filename: z.string(),
      mimeType: z.string(),
      expiresAt: z.number(),
      path: z.string().optional(),
      downloadUrl: z.string().optional(),
    }),
  }),
]);
let active = false;
export async function runImageOptimizerTool(
  id: ImageOptimizerId,
  input: unknown,
  signal?: AbortSignal,
  roots: readonly string[] = [],
  context?: WebpContext,
) {
  signal?.throwIfAborted();
  if (!Object.hasOwn(imageOptimizersSchemas, id))
    throw new OptimizerError("invalid_options");
  if (active) throw new OptimizerError("busy");
  active = true;
  let saved: string | undefined;
  try {
    const p = imageOptimizersSchemas[id].path.parse(input),
      limit = id === "png-optimizer" ? PNG_INPUT_LIMIT : SVG_INPUT_LIMIT;
    let bytes: Uint8Array<ArrayBuffer>;
    if ("input" in p.source) {
      if (id === "png-optimizer") {
        const b = Buffer.from(p.source.input, "base64");
        if (b.toString("base64") !== p.source.input)
          throw new OptimizerError("invalid_input");
        bytes = new Uint8Array(b);
      } else bytes = new TextEncoder().encode(p.source.input);
    } else if ("inputPath" in p.source) {
      if (context?.transport === "http")
        throw new OptimizerError("invalid_input");
      const chunks: Uint8Array[] = [];
      let length = 0;
      for await (const c of streamAuthorizedFile(
        p.source.inputPath,
        roots,
        signal,
        limit,
      )) {
        chunks.push(c);
        length += c.length;
      }
      bytes = new Uint8Array(length);
      let at = 0;
      for (const c of chunks) {
        bytes.set(c, at);
        at += c.length;
      }
    } else {
      if (!context) throw new OptimizerError("invalid_input");
      const record = await context.artifacts.get(
        p.source.inputUploadId,
        "upload",
      );
      if (record.bytes > limit) throw new OptimizerError("input_limit");
      bytes = new Uint8Array(await readFile(record.path, { signal }));
    }
    if (bytes.length > limit) throw new OptimizerError("input_limit");
    let job: OptimizerJob;
    if (id === "png-optimizer") {
      job = { kind: "png", bytes, options: png.parse(p.options) };
    } else {
      let text: string;
      try {
        text =
          "input" in p.source
            ? p.source.input
            : new TextDecoder("utf-8", { fatal: true }).decode(bytes);
      } catch {
        throw new OptimizerError("invalid_input");
      }
      job = { kind: "svg", input: text, options: svg.parse(p.options) };
    }
    const result = await runOptimizerServiceWorker(job, signal);
    signal?.throwIfAborted();
    const { bytes: output, ...stats } = result,
      mimeType = id === "png-optimizer" ? "image/png" : "image/svg+xml",
      filename = optimizedName(p.filename, job.kind),
      meta = { ...stats, mimeType, filename };
    if (p.delivery === "inline") {
      if (output.length > 16384) throw new OptimizerError("artifact_required");
      const response = {
        ...meta,
        delivery: "inline" as const,
        encoding: job.kind === "png" ? ("base64" as const) : ("utf8" as const),
        output:
          job.kind === "png"
            ? Buffer.from(output).toString("base64")
            : new TextDecoder().decode(output),
      };
      if (Buffer.byteLength(JSON.stringify(response)) > 65536)
        throw new OptimizerError("artifact_required");
      return response;
    }
    if (!context) throw new OptimizerError("artifact_required");
    const record = await context.artifacts.write(
      (async function* () {
        for (let at = 0; at < output.length; at += 65536) {
          signal?.throwIfAborted();
          yield output.subarray(at, at + 65536);
        }
      })(),
      { filename, mimeType, limit: OPTIMIZER_OUTPUT_LIMIT },
      signal,
    );
    saved = record.id;
    signal?.throwIfAborted();
    return {
      ...meta,
      delivery: "artifact" as const,
      artifact: {
        id: record.id,
        bytes: record.bytes,
        filename: record.filename,
        mimeType: record.mimeType,
        expiresAt: record.expiresAt,
        ...(context.transport === "mcp"
          ? { path: record.path }
          : { downloadUrl: `/api/v1/artifacts/${record.id}` }),
      },
    };
  } catch (e) {
    if (saved && context) await context.artifacts.remove(saved).catch(() => {});
    throw e;
  } finally {
    active = false;
  }
}
export const imageOptimizersOperations: Operation[] = (
  Object.keys(imageOptimizersSchemas) as ImageOptimizerId[]
).map((id) => ({
  id,
  name: id.replaceAll("-", "_"),
  description:
    id === "png-optimizer"
      ? "Optimize original PNG bytes with Oxipng; report actual bit depth/interlacing and ancillary chunk changes. Transparent RGB may change when alpha optimization is enabled."
      : "Optimize complete SVG markup with selected SVGO passes. Not a sanitizer; output may retain active content and external references. No markup is executed.",
  inputSchema: imageOptimizersSchemas[id].inline,
  outputSchema: imageOptimizersOutputSchema,
  idempotent: false,
  bodyLimit:
    id === "png-optimizer"
      ? Math.ceil(PNG_INPUT_LIMIT / 3) * 4 + 2 * 1048576
      : SVG_INPUT_LIMIT * 6 + 1048576,
  run: (input, signal, context) =>
    runImageOptimizerTool(id, input, signal, [], context),
}));
