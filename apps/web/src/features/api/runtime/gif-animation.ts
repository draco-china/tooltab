import { readFile } from "node:fs/promises";
import * as z from "zod/v4";
import {
  AnimationError,
  GIF_INPUT_LIMIT,
  GIF_OUTPUT_LIMIT,
} from "@workspace/tools/image/gif-contract";
import { streamAuthorizedFile } from "./files";
import { runAnimationServiceWorker } from "./gif-animation-worker-client";
import type { WebpContext } from "./image-webp";
import type { Operation } from "./operation-contract";

const options = (maximum: number) =>
  z.strictObject({
    scale: z.number().int().min(10).max(400).default(100),
    speed: z.number().min(0.25).max(4).default(1),
    loopMode: z.enum(["inherit", "infinite", "custom"]).default("inherit"),
    loopCount: z.number().int().min(1).max(maximum).default(1),
  });
const inline = z.strictObject({
    input: z.string().max(Math.ceil(GIF_INPUT_LIMIT / 3) * 4),
  }),
  upload = z.strictObject({ inputUploadId: z.string().min(1) }),
  path = z.strictObject({ inputPath: z.string().min(1).max(4096) });
function schemas(maximum: number) {
  const fields = {
    filename: z.string().max(255).default("animation.gif"),
    delivery: z.enum(["inline", "artifact"]).default("artifact"),
    options: options(maximum).default(() => options(maximum).parse({})),
  };
  return {
    inline: z.strictObject({ ...fields, source: z.union([inline, upload]) }),
    path: z.strictObject({
      ...fields,
      source: z.union([inline, upload, path]),
    }),
  };
}
export const gifAnimationSchemas = {
  "gif-to-animated-webp-converter": schemas(1000),
  "gif-to-apng-converter": schemas(999),
};
export type GifAnimationId = keyof typeof gifAnimationSchemas;
const stats = {
  width: z.number(),
  height: z.number(),
  originalWidth: z.number(),
  originalHeight: z.number(),
  frames: z.number(),
  durationMs: z.number(),
  plays: z.number(),
  originalBytes: z.number(),
  outputBytes: z.number(),
  filename: z.string(),
  mimeType: z.string(),
};
export const gifAnimationOutputSchema = z.union([
  z.strictObject({
    ...stats,
    delivery: z.literal("inline"),
    encoding: z.literal("base64"),
    output: z.string(),
  }),
  z.strictObject({
    ...stats,
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
export async function runGifAnimationTool(
  id: GifAnimationId,
  input: unknown,
  signal?: AbortSignal,
  roots: readonly string[] = [],
  context?: WebpContext,
) {
  signal?.throwIfAborted();
  if (!Object.hasOwn(gifAnimationSchemas, id))
    throw new AnimationError("invalid_options");
  if (active) throw new AnimationError("busy");
  active = true;
  let saved: string | undefined;
  try {
    const p = gifAnimationSchemas[id].path.parse(input);
    let bytes: Uint8Array<ArrayBuffer>;
    if ("input" in p.source) {
      const decoded = Buffer.from(p.source.input, "base64");
      if (decoded.toString("base64") !== p.source.input)
        throw new AnimationError("invalid_input");
      bytes = new Uint8Array(decoded);
    } else if ("inputPath" in p.source) {
      if (context?.transport === "http")
        throw new AnimationError("invalid_input");
      const chunks: Uint8Array[] = [];
      let length = 0;
      for await (const chunk of streamAuthorizedFile(
        p.source.inputPath,
        roots,
        signal,
        GIF_INPUT_LIMIT,
      )) {
        chunks.push(chunk);
        length += chunk.length;
      }
      bytes = new Uint8Array(length);
      let offset = 0;
      for (const chunk of chunks) {
        bytes.set(chunk, offset);
        offset += chunk.length;
      }
    } else {
      if (!context) throw new AnimationError("invalid_input");
      const record = await context.artifacts.get(
        p.source.inputUploadId,
        "upload",
      );
      if (record.bytes > GIF_INPUT_LIMIT)
        throw new AnimationError("input_limit");
      bytes = new Uint8Array(await readFile(record.path, { signal }));
    }
    if (bytes.length > GIF_INPUT_LIMIT) throw new AnimationError("input_limit");
    const kind = id === "gif-to-apng-converter" ? "apng" : "webp";
    const { bytes: output, ...properties } = await runAnimationServiceWorker(
      { bytes, kind, options: p.options },
      signal,
    );
    signal?.throwIfAborted();
    // biome-ignore lint/suspicious/noControlCharactersInRegex: strip controls from download filenames.
    const filename = `${p.filename.replace(/[\\/\u0000-\u001f\u007f]/g, "_").replace(/\.[^.]*$/, "") || "animation"}.${kind === "apng" ? "png" : "webp"}`;
    const mimeType = kind === "apng" ? "image/png" : "image/webp",
      meta = { ...properties, filename, mimeType };
    if (p.delivery === "inline") {
      if (output.length > 16384) throw new AnimationError("artifact_required");
      return {
        ...meta,
        delivery: "inline" as const,
        encoding: "base64" as const,
        output: Buffer.from(output).toString("base64"),
      };
    }
    if (!context) throw new AnimationError("artifact_required");
    const record = await context.artifacts.write(
      (async function* () {
        for (let at = 0; at < output.length; at += 65536) {
          signal?.throwIfAborted();
          yield output.subarray(at, at + 65536);
        }
      })(),
      { filename, mimeType, limit: GIF_OUTPUT_LIMIT },
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
  } catch (error) {
    if (saved && context) await context.artifacts.remove(saved).catch(() => {});
    throw error;
  } finally {
    active = false;
  }
}
export const gifAnimationOperations: Operation[] = (
  Object.keys(gifAnimationSchemas) as GifAnimationId[]
).map((id) => ({
  id,
  name: id.replaceAll("-", "_"),
  description:
    "Convert every GIF frame into a lossless animation, preserving adjusted durations and total play count. Local processing; no metadata preservation. Scale 10–400%, speed 0.25–4. Artifact delivery by default.",
  inputSchema: gifAnimationSchemas[id].inline,
  outputSchema: gifAnimationOutputSchema,
  idempotent: false,
  bodyLimit: Math.ceil(GIF_INPUT_LIMIT / 3) * 4 + 2 * 1048576,
  run: (input, signal, context) =>
    runGifAnimationTool(id, input, signal, [], context),
}));
