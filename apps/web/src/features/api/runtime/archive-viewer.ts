import { archiveEntrySchema as entry } from "@/features/tools/archive-viewer/worker-client";
import { readFile } from "node:fs/promises";
import * as z from "zod/v4";
import {
  ARCHIVE_EXPANDED_LIMIT,
  ARCHIVE_INPUT_LIMIT,
  ArchiveError,
  downloadName,
} from "@workspace/tools/archive";
import { runArchiveServiceWorker } from "./archive-viewer-worker-client";
import { streamAuthorizedFile } from "./files";
import type { WebpContext } from "./image-webp";
import type { Operation } from "./operation-contract";

const inline = z.strictObject({
    input: z.string().max(Math.ceil(ARCHIVE_INPUT_LIMIT / 3) * 4),
  }),
  upload = z.strictObject({ inputUploadId: z.string().min(1) }),
  path = z.strictObject({ inputPath: z.string().min(1).max(4096) });
const fields = {
  filename: z.string().max(255).default("archive.zip"),
  action: z.enum(["list", "extract"]).default("list"),
  entryId: z.string().regex(/^\d+$/).max(8).optional(),
  delivery: z.enum(["inline", "artifact"]).default("inline"),
};
export const archiveViewerSchema = z.strictObject({
  ...fields,
  source: z.union([inline, upload]),
});
export const archiveViewerMcpSchema = z.strictObject({
  ...fields,
  source: z.union([inline, upload, path]),
});
const summary = {
  format: z.enum(["zip", "tar", "gz", "tgz"]),
  archiveBytes: z.number(),
  uncompressedBytes: z.number(),
  entryCount: z.number(),
};
export const archiveViewerOutputSchema = z.union([
  z.strictObject({
    ...summary,
    delivery: z.literal("inline"),
    action: z.literal("list"),
    entries: z.array(entry),
  }),
  z.strictObject({
    ...summary,
    delivery: z.literal("inline"),
    action: z.literal("extract"),
    entry,
    encoding: z.literal("base64"),
    output: z.string(),
  }),
  z.strictObject({
    ...summary,
    delivery: z.literal("artifact"),
    action: z.enum(["list", "extract"]),
    entry: entry.optional(),
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
export async function runArchiveViewer(
  input: unknown,
  signal?: AbortSignal,
  roots: readonly string[] = [],
  context?: WebpContext,
) {
  signal?.throwIfAborted();
  if (active) throw new ArchiveError("busy");
  active = true;
  let saved: string | undefined;
  try {
    const p = archiveViewerMcpSchema.parse(input);
    if (p.action === "extract" && p.entryId === undefined)
      throw new ArchiveError("entry_not_found");
    let bytes: Uint8Array<ArrayBuffer>;
    if ("input" in p.source) {
      const b = Buffer.from(p.source.input, "base64");
      if (b.toString("base64") !== p.source.input)
        throw new ArchiveError("invalid_input");
      bytes = new Uint8Array(b);
    } else if ("inputPath" in p.source) {
      if (context?.transport === "http")
        throw new ArchiveError("invalid_input");
      const chunks: Uint8Array[] = [];
      let length = 0;
      for await (const c of streamAuthorizedFile(
        p.source.inputPath,
        roots,
        signal,
        ARCHIVE_INPUT_LIMIT,
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
      if (!context) throw new ArchiveError("invalid_input");
      const record = await context.artifacts.get(
        p.source.inputUploadId,
        "upload",
      );
      if (record.bytes > ARCHIVE_INPUT_LIMIT)
        throw new ArchiveError("input_limit");
      bytes = new Uint8Array(await readFile(record.path, { signal }));
    }
    if (bytes.length > ARCHIVE_INPUT_LIMIT)
      throw new ArchiveError("input_limit");
    const result = await runArchiveServiceWorker(
      { bytes, filename: p.filename, action: p.action, entryId: p.entryId },
      signal,
    );
    signal?.throwIfAborted();
    const summary = {
      format: result.format,
      archiveBytes: result.archiveBytes,
      uncompressedBytes: result.uncompressedBytes,
      entryCount: result.entries.length,
    };
    const selected =
      p.action === "extract"
        ? result.entries.find((e) => e.id === p.entryId)
        : undefined;
    if (p.delivery === "inline") {
      if ((result.bytes?.length ?? 0) > 16384)
        throw new ArchiveError("artifact_required");
      const response =
        p.action === "list"
          ? {
              ...summary,
              delivery: "inline" as const,
              action: "list" as const,
              entries: result.entries,
            }
          : {
              ...summary,
              delivery: "inline" as const,
              action: "extract" as const,
              entry: selected,
              encoding: "base64" as const,
              output: Buffer.from(result.bytes ?? []).toString("base64"),
            };
      if (Buffer.byteLength(JSON.stringify(response)) > 65536)
        throw new ArchiveError("artifact_required");
      return response;
    }
    if (!context) throw new ArchiveError("artifact_required");
    const output =
      p.action === "list"
        ? new TextEncoder().encode(
            JSON.stringify({ ...summary, entries: result.entries }, null, 2),
          )
        : result.bytes;
    if (!output) throw new ArchiveError("entry_not_found");
    const filename =
        p.action === "list"
          ? "archive-listing.json"
          : downloadName(selected?.path ?? "archive-entry.bin"),
      mimeType =
        p.action === "list" ? "application/json" : "application/octet-stream";
    const record = await context.artifacts.write(
      (async function* () {
        for (let at = 0; at < output.length; at += 65536) {
          signal?.throwIfAborted();
          yield output.subarray(at, at + 65536);
        }
      })(),
      { filename, mimeType, limit: ARCHIVE_EXPANDED_LIMIT },
      signal,
    );
    saved = record.id;
    signal?.throwIfAborted();
    return {
      ...summary,
      delivery: "artifact" as const,
      action: p.action,
      ...(selected ? { entry: selected } : {}),
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
export const archiveViewerOperation: Operation = {
  id: "archive-viewer",
  name: "tooltab_archive_viewer",
  description:
    "List all ZIP/TAR/GZIP/TGZ entries or extract one complete regular file by its stable entry id. Paths are metadata only, links are never followed, no passwords are accepted. Large listings/extractions require explicit artifact delivery.",
  inputSchema: archiveViewerSchema,
  outputSchema: archiveViewerOutputSchema,
  idempotent: false,
  bodyLimit: Math.ceil(ARCHIVE_INPUT_LIMIT / 3) * 4 + 2 * 1048576,
  run: (input, signal, context) =>
    runArchiveViewer(input, signal, context?.inputRoots ?? [], context),
};
