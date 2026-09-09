import { createHash } from "node:crypto";
import { open } from "node:fs/promises";
import * as z from "zod/v4";
import { AUDIO_MAX_BYTES } from "@/features/tools/audio-recorder/logic";
import { streamAuthorizedFile } from "./files";
import type { WebpContext } from "./image-webp";
import type { Operation } from "./operation-contract";

const AUDIO_BASE64_LIMIT = 16 * 1024 * 1024;
const baseShape = {
  input: z
    .string()
    .max(Math.ceil(AUDIO_BASE64_LIMIT / 3) * 4)
    .optional(),
  inputUploadId: z.string().min(1).optional(),
  filename: z.string().max(255).default("recording"),
  claimedMimeType: z.string().max(128).optional(),
  delivery: z.enum(["metadata", "artifact"]).default("metadata"),
};
const exactlyOne = (value: {
  input?: string;
  inputUploadId?: string;
  inputPath?: string;
}) =>
  [value.input, value.inputUploadId, value.inputPath].filter(
    (item) => item !== undefined,
  ).length === 1;
export const audioRecorderInputSchema = z
  .strictObject(baseShape)
  .refine(exactlyOne);
export const audioRecorderMcpSchema = z
  .strictObject({
    ...baseShape,
    inputPath: z.string().min(1).max(4096).optional(),
  })
  .refine(exactlyOne);

export class AudioRecorderServiceError extends Error {
  constructor(
    readonly code:
      | "invalid_input"
      | "unsupported_format"
      | "too_large"
      | "artifact_required",
  ) {
    super(code);
    this.name = "AudioRecorderServiceError";
  }
}

const metadata = {
  format: z.enum(["webm", "ogg", "wav", "m4a", "mp3"]),
  mimeType: z.string(),
  bytes: z.number().int().positive(),
  sha256: z.string().regex(/^[a-f0-9]{64}$/),
  filename: z.string(),
  durationMs: z.null(),
  warnings: z.array(z.string()),
};
export const audioRecorderOutputSchema = z.union([
  z.strictObject({ ...metadata, delivery: z.literal("metadata") }),
  z.strictObject({
    ...metadata,
    delivery: z.literal("artifact"),
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

type AudioFormat = "webm" | "ogg" | "wav" | "m4a" | "mp3";
function identify(bytes: Uint8Array): {
  format: AudioFormat;
  mimeType: string;
} {
  const ascii = (start: number, end: number) =>
    String.fromCharCode(...bytes.subarray(start, end));
  if (
    bytes.length >= 4 &&
    bytes[0] === 0x1a &&
    bytes[1] === 0x45 &&
    bytes[2] === 0xdf &&
    bytes[3] === 0xa3
  )
    return { format: "webm", mimeType: "audio/webm" };
  if (ascii(0, 4) === "OggS") return { format: "ogg", mimeType: "audio/ogg" };
  if (ascii(0, 4) === "RIFF" && ascii(8, 12) === "WAVE")
    return { format: "wav", mimeType: "audio/wav" };
  if (bytes.length >= 12 && ascii(4, 8) === "ftyp")
    return { format: "m4a", mimeType: "audio/mp4" };
  if (
    ascii(0, 3) === "ID3" ||
    (bytes.length >= 2 && bytes[0] === 0xff && (bytes[1] & 0xe0) === 0xe0)
  )
    return { format: "mp3", mimeType: "audio/mpeg" };
  throw new AudioRecorderServiceError("unsupported_format");
}

function filename(value: string, extension: AudioFormat) {
  const clean = value
    .trim()
    .replace(/\.(?:webm|ogg|wav|m4a|mp4|mp3)$/i, "")
    .replace(/[<>:"/\\|?*\p{Cc}]/gu, "-")
    .replace(/^[.\s-]+|[.\s-]+$/g, "")
    .slice(0, 120);
  return `${clean || "recording"}.${extension}`;
}

function mimeMatchesClaim(claim: string, detected: AudioFormat) {
  const mime = claim.toLowerCase().split(";", 1)[0].trim();
  const accepted: Record<AudioFormat, readonly string[]> = {
    webm: ["audio/webm", "video/webm"],
    ogg: ["audio/ogg", "application/ogg"],
    wav: ["audio/wav", "audio/wave", "audio/x-wav"],
    m4a: ["audio/mp4", "audio/m4a", "audio/x-m4a", "video/mp4"],
    mp3: ["audio/mpeg", "audio/mp3"],
  };
  return accepted[detected].includes(mime);
}

async function* artifactFile(path: string, size: number, signal?: AbortSignal) {
  const handle = await open(path, "r");
  try {
    let offset = 0;
    while (offset < size) {
      signal?.throwIfAborted();
      const chunk = new Uint8Array(Math.min(65536, size - offset));
      const { bytesRead } = await handle.read(chunk, 0, chunk.length, offset);
      if (!bytesRead) throw new AudioRecorderServiceError("invalid_input");
      offset += bytesRead;
      yield chunk.subarray(0, bytesRead);
    }
  } finally {
    await handle.close();
  }
}

function strictBase64(value: string) {
  if (!value || value.length % 4)
    throw new AudioRecorderServiceError("invalid_input");
  const bytes = Buffer.from(value, "base64");
  if (bytes.toString("base64") !== value || bytes.length > AUDIO_BASE64_LIMIT)
    throw new AudioRecorderServiceError("invalid_input");
  return bytes;
}

export async function runAudioRecording(
  value: unknown,
  signal?: AbortSignal,
  roots?: readonly string[],
  context?: WebpContext,
) {
  let input: z.infer<typeof audioRecorderMcpSchema>;
  try {
    input = (
      roots === undefined ? audioRecorderInputSchema : audioRecorderMcpSchema
    ).parse(value);
  } catch {
    throw new AudioRecorderServiceError("invalid_input");
  }
  signal?.throwIfAborted();
  let source: AsyncIterable<Uint8Array>;
  if (input.input !== undefined)
    source = (async function* () {
      yield strictBase64(input.input as string);
    })();
  else if (input.inputPath)
    source = streamAuthorizedFile(
      input.inputPath,
      roots ?? [],
      signal,
      AUDIO_MAX_BYTES,
    );
  else {
    if (!context || !input.inputUploadId)
      throw new AudioRecorderServiceError("artifact_required");
    const upload = await context.artifacts.get(input.inputUploadId, "upload");
    if (upload.bytes > AUDIO_MAX_BYTES)
      throw new AudioRecorderServiceError("too_large");
    source = artifactFile(upload.path, upload.bytes, signal);
  }
  const iterator = source[Symbol.asyncIterator]();
  const first = await iterator.next();
  if (first.done || !first.value.length)
    throw new AudioRecorderServiceError("invalid_input");
  const detected = identify(first.value);
  const warnings =
    input.claimedMimeType &&
    !mimeMatchesClaim(input.claimedMimeType, detected.format)
      ? ["claimed_mime_type_mismatch"]
      : [];
  const hash = createHash("sha256");
  let length = 0;
  async function* measured() {
    let item: IteratorResult<Uint8Array> = first;
    while (!item.done) {
      signal?.throwIfAborted();
      length += item.value.length;
      if (length > AUDIO_MAX_BYTES)
        throw new AudioRecorderServiceError("too_large");
      hash.update(item.value);
      yield item.value;
      item = await iterator.next();
    }
  }
  let artifact:
    | Awaited<ReturnType<WebpContext["artifacts"]["write"]>>
    | undefined;
  if (input.delivery === "artifact") {
    if (!context) throw new AudioRecorderServiceError("artifact_required");
    try {
      artifact = await context.artifacts.write(
        measured(),
        {
          filename: filename(input.filename, detected.format),
          mimeType: detected.mimeType,
          limit: AUDIO_MAX_BYTES,
        },
        signal,
      );
      signal?.throwIfAborted();
    } catch (error) {
      if (artifact) await context.artifacts.remove(artifact.id).catch(() => {});
      throw error;
    }
  } else for await (const _ of measured()) signal?.throwIfAborted();
  const result = {
    format: detected.format,
    mimeType: detected.mimeType,
    bytes: length,
    sha256: hash.digest("hex"),
    filename: filename(input.filename, detected.format),
    durationMs: null,
    warnings,
  };
  if (!artifact) return { ...result, delivery: "metadata" as const };
  return {
    ...result,
    delivery: "artifact" as const,
    artifact: {
      id: artifact.id,
      bytes: artifact.bytes,
      mimeType: artifact.mimeType,
      filename: artifact.filename,
      expiresAt: artifact.expiresAt,
      ...(context?.transport === "mcp"
        ? { path: artifact.path }
        : { downloadUrl: `/api/v1/artifacts/${artifact.id}` }),
    },
  };
}

export const audioRecorderOperation: Operation = {
  id: "audio-recorder",
  name: "tooltab_audio_recording_inspector",
  description:
    "Inspect or preserve an already recorded WebM, OGG, WAV, M4A/MP4 or MP3 file. The service cannot access the caller's microphone. It validates the container signature, reports exact bytes and SHA-256, flags a claimed MIME mismatch, and can copy the original bytes to an explicit temporary artifact. Base64 input is limited to 16 MiB; upload/path input to 128 MiB. Duration is null because the service does not guess without a media decoder.",
  inputSchema: audioRecorderInputSchema,
  outputSchema: audioRecorderOutputSchema,
  bodyLimit: Math.ceil(AUDIO_BASE64_LIMIT / 3) * 4 + 65536,
  idempotent: false,
  run: (input, signal, context) =>
    runAudioRecording(input, signal, undefined, context),
};
