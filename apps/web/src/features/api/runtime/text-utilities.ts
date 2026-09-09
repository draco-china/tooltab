import { readFile } from "node:fs/promises";
import * as z from "zod/v4";
import { INVISIBLE_CATEGORIES } from "@workspace/tools/text/invisible";
import {
  MAX_UTILITY_INPUT,
  MAX_UTILITY_OUTPUT,
  TextUtilityError,
  type UtilityJob,
  utilityFiles,
} from "@/features/tools/text-utilities/logic";
import { LOREM_LOCALES } from "@workspace/tools/text/lorem";
import { runUtilityWorker } from "@/features/tools/text-utilities/worker-client";
import { streamAuthorizedFile } from "./files";
import type { WebpContext } from "./image-webp";
import type { Operation } from "./operation-contract";
import { serviceWorkerUrl } from "./worker-url";

const shape = {
  input: z.string().max(MAX_UTILITY_INPUT).optional(),
  inputUploadId: z.string().min(1).optional(),
};
const filePath = { inputPath: z.string().min(1).max(4096).optional() };
const exactly = (p: {
  input?: string;
  inputUploadId?: string;
  inputPath?: string;
}) =>
  [p.input, p.inputUploadId, p.inputPath].filter((x) => x !== undefined)
    .length === 1;
const invisibleOptions = {
  categories: z
    .array(z.enum(INVISIBLE_CATEGORIES))
    .default([...INVISIBLE_CATEGORIES]),
};
const morseOptions = {
  mode: z.enum(["encode", "decode"]).default("encode"),
  audio: z.boolean().default(false),
};
export const invisibleInputSchema = z
  .strictObject({ ...shape, ...invisibleOptions })
  .refine(exactly);
export const invisibleMcpInputSchema = z
  .strictObject({ ...shape, ...filePath, ...invisibleOptions })
  .refine(exactly);
export const morseInputSchema = z
  .strictObject({ ...shape, ...morseOptions })
  .refine(exactly);
export const morseMcpInputSchema = z
  .strictObject({ ...shape, ...filePath, ...morseOptions })
  .refine(exactly);
export const loremInputSchema = z.strictObject({
  mode: z.enum(["words", "sentences", "paragraphs"]).default("paragraphs"),
  count: z.number().int().min(1).max(100).default(1),
  locale: z.enum(LOREM_LOCALES).default("en"),
  seed: z.number().int().min(0).max(0xffffffff).optional(),
});
const artifact = z.strictObject({
  id: z.string(),
  bytes: z.number(),
  mimeType: z.string(),
  filename: z.string(),
  expiresAt: z.number(),
  path: z.string().optional(),
  downloadUrl: z.string().optional(),
});
const finding = z.strictObject({
  index: z.number().int(),
  line: z.number().int(),
  column: z.number().int(),
  utf16Offset: z.number().int(),
  code: z.string(),
  name: z.string(),
  category: z.enum(INVISIBLE_CATEGORIES),
  token: z.string(),
});
const invisibleResult = z.strictObject({
  kind: z.literal("invisible"),
  findings: z.array(finding),
  findingsTruncated: z.boolean(),
  total: z.number().int(),
  counts: z.strictObject({
    "zero-width": z.number().int(),
    "bidi-control": z.number().int(),
    "space-like": z.number().int(),
    format: z.number().int(),
  }),
  codePoints: z.number().int(),
  cleanedCodePoints: z.number().int(),
  unicodeVersion: z.string(),
  scopeSize: z.number().int(),
  cleanedText: z.string().optional(),
  annotatedText: z.string().optional(),
  findingsTsv: z.string().optional(),
});
const morseResult = z.strictObject({
  kind: z.literal("morse"),
  mode: z.enum(["encode", "decode"]),
  text: z.string().optional(),
  morse: z.string().optional(),
  unsupported: z.array(z.string()),
  unsupportedTruncated: z.boolean().optional(),
  units: z.number(),
  durationSeconds: z.number(),
  audioAvailable: z.boolean(),
});
const loremResult = z.strictObject({
  kind: z.literal("lorem"),
  mode: z.enum(["words", "sentences", "paragraphs"]),
  count: z.number().int(),
  locale: z.enum(LOREM_LOCALES),
  seed: z.number().int(),
  latin: z.boolean(),
  output: z.string().optional(),
});
export const textUtilitiesOutputSchema = z.strictObject({
  kind: z.enum(["invisible", "morse", "lorem"]),
  mode: z.enum(["inline", "artifacts"]),
  result: z.union([invisibleResult, morseResult, loremResult]),
  artifacts: z.array(artifact),
});
async function source(
  input: string | undefined,
  uploadId: string | undefined,
  inputPath: string | undefined,
  signal?: AbortSignal,
  roots: readonly string[] = [],
  context?: WebpContext,
) {
  if (input !== undefined) return input;
  const decoder = new TextDecoder("utf-8", { fatal: true, ignoreBOM: true }),
    parts: string[] = [];
  if (inputPath) {
    for await (const bytes of streamAuthorizedFile(
      inputPath,
      roots,
      signal,
      MAX_UTILITY_INPUT,
    )) {
      try {
        parts.push(decoder.decode(bytes, { stream: true }));
      } catch {
        throw new TextUtilityError("read_failed");
      }
    }
    try {
      parts.push(decoder.decode());
    } catch {
      throw new TextUtilityError("read_failed");
    }
    return parts.join("");
  }
  if (!uploadId || !context) throw new TextUtilityError("invalid_options");
  const record = await context.artifacts.get(uploadId, "upload");
  if (record.bytes > MAX_UTILITY_INPUT) throw new TextUtilityError("too_large");
  const bytes = await readFile(record.path, { signal });
  if (bytes.byteLength > MAX_UTILITY_INPUT)
    throw new TextUtilityError("too_large");
  try {
    return decoder.decode(bytes);
  } catch {
    throw new TextUtilityError("read_failed");
  }
}
let active = 0;
export async function runTextUtilities(
  id: string,
  input: unknown,
  signal?: AbortSignal,
  roots: readonly string[] = [],
  context?: WebpContext,
) {
  signal?.throwIfAborted();
  if (active) throw new TextUtilityError("busy");
  active++;
  const saved: string[] = [];
  try {
    let job: UtilityJob,
      audio = false;
    if (id === "lorem-ipsum-generator")
      job = { kind: "lorem", ...loremInputSchema.parse(input) };
    else if (id === "unicode-invisible-character-checker") {
      const p = invisibleMcpInputSchema.parse(input);
      job = {
        kind: "invisible",
        input: await source(
          p.input,
          p.inputUploadId,
          p.inputPath,
          signal,
          roots,
          context,
        ),
        categories: p.categories,
      };
    } else if (id === "morse-code-converter") {
      const p = morseMcpInputSchema.parse(input);
      audio = p.audio;
      job = {
        kind: "morse",
        input: await source(
          p.input,
          p.inputUploadId,
          p.inputPath,
          signal,
          roots,
          context,
        ),
        mode: p.mode,
      };
    } else throw new TextUtilityError("invalid_options");
    const result = await runUtilityWorker(
      job,
      signal,
      undefined,
      import.meta.env.PROD
        ? () =>
            new Worker(
              serviceWorkerUrl("text-utilities-worker", import.meta.url),
              { type: "module" },
            )
        : undefined,
    );
    if (result.kind === "audio") throw new TextUtilityError("invalid_input");
    signal?.throwIfAborted();
    const files = utilityFiles(result),
      large =
        files.reduce((n, f) => n + f.text.length, 0) > 4000 ||
        new TextEncoder().encode(JSON.stringify(result)).length > 60000;
    if ((large || audio) && !context)
      throw new TextUtilityError("artifact_required");
    const artifacts = [];
    async function save(bytes: Uint8Array, filename: string, mimeType: string) {
      if (!context) throw new TextUtilityError("artifact_required");
      const record = await context.artifacts.write(
        (async function* () {
          for (let i = 0; i < bytes.length; i += 65536) {
            signal?.throwIfAborted();
            yield bytes.subarray(i, i + 65536);
          }
        })(),
        { limit: MAX_UTILITY_OUTPUT, filename, mimeType },
        signal,
      );
      saved.push(record.id);
      const { id, bytes: size, expiresAt } = record;
      return {
        id,
        bytes: size,
        filename,
        mimeType,
        expiresAt,
        ...(context.transport === "mcp"
          ? { path: record.path }
          : { downloadUrl: `/api/v1/artifacts/${id}` }),
      };
    }
    if (large)
      for (const file of files)
        artifacts.push(
          await save(
            new TextEncoder().encode(file.text),
            file.filename,
            file.filename.endsWith(".tsv")
              ? "text/tab-separated-values;charset=utf-8"
              : "text/plain;charset=utf-8",
          ),
        );
    if (audio && result.kind === "morse") {
      const wav = await runUtilityWorker(
        { kind: "audio", input: result.morse },
        signal,
        undefined,
        import.meta.env.PROD
          ? () =>
              new Worker(
                serviceWorkerUrl("text-utilities-worker", import.meta.url),
                { type: "module" },
              )
          : undefined,
      );
      if (wav.kind !== "audio") throw new TextUtilityError("invalid_input");
      artifacts.push(await save(wav.bytes, "morse.wav", "audio/wav"));
    }
    signal?.throwIfAborted();
    let summary: Record<string, unknown> = result;
    if (large) {
      if (result.kind === "invisible") {
        const { cleanedText, annotatedText, findingsTsv, ...rest } = result;
        summary = {
          ...rest,
          findings: rest.findings.slice(0, 20),
          findingsTruncated: rest.total > 20,
        };
      } else if (result.kind === "morse") {
        const { text, morse, ...rest } = result;
        summary = {
          ...rest,
          unsupported: rest.unsupported.slice(0, 500),
          unsupportedTruncated: rest.unsupported.length > 500,
        };
      } else {
        const { output, ...rest } = result;
        summary = rest;
      }
    }
    return {
      kind: result.kind,
      mode: large ? ("artifacts" as const) : ("inline" as const),
      result: summary,
      artifacts,
    };
  } catch (error) {
    if (context)
      await Promise.allSettled(saved.map((id) => context.artifacts.remove(id)));
    throw error;
  } finally {
    active--;
  }
}
export const textUtilitiesOperations: Operation[] = [
  {
    id: "unicode-invisible-character-checker",
    name: "tooltab_unicode_invisible_character_checker",
    description:
      "Inspect the fixed 40-character invisible list, verified against Unicode 17.0.0; select four categories, clean or annotate, export all findings. One-based codepoint positions; BOM preserved. 16 MiB input and 128 MiB per output, bounded preview, cancellable 30-second Worker.",
    inputSchema: invisibleInputSchema,
  },
  {
    id: "morse-code-converter",
    name: "tooltab_morse_code_converter",
    description:
      "Encode/decode A–Z, digits and 18 punctuation marks, report unsupported characters; optionally produce a real 700 Hz PCM WAV artifact at 90 ms dots. Audio up to one hour; text conversion 16 MiB. No external audio service.",
    inputSchema: morseInputSchema,
  },
  {
    id: "lorem-ipsum-generator",
    name: "tooltab_lorem_ipsum_generator",
    description:
      "Generate 1–100 words, sentences or paragraphs with 13 upstream locale choices using local Faker 10.6.0. Some locales deliberately use Latin filler; response identifies this. Optional uint32 seed reproduces output for this version, not cryptographic randomness.",
    inputSchema: loremInputSchema,
  },
].map((op) => ({
  ...op,
  outputSchema: textUtilitiesOutputSchema,
  bodyLimit: MAX_UTILITY_INPUT * 6 + 65536,
  idempotent: false,
  run(input: unknown, signal?: AbortSignal, context?: WebpContext) {
    return runTextUtilities(
      op.id,
      op.inputSchema.parse(input),
      signal,
      [],
      context,
    );
  },
}));
