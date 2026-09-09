import { Uint8ArrayReader, ZipReader } from "@zip.js/zip.js";
import { createTarDecoder } from "modern-tar";
import {
  ARCHIVE_ENTRY_LIMIT,
  ARCHIVE_EXPANDED_LIMIT,
  ARCHIVE_PREVIEW_LIMIT,
  type ArchiveJob,
  type ArchiveEntry,
  ArchiveError,
  type ArchiveResult,
  archiveFormat,
  pathIsUnsafe,
  previewKind,
} from "./archive";
function iso(date: Date | undefined) {
  return date && Number.isFinite(date.getTime()) ? date.toISOString() : null;
}
function bounded(
  stream: ReadableStream<Uint8Array<ArrayBuffer>>,
  limit: number,
) {
  let count = 0;
  return stream.pipeThrough(
    new TransformStream<Uint8Array<ArrayBuffer>, Uint8Array<ArrayBuffer>>({
      transform(chunk, controller) {
        count += chunk.length;
        if (count > limit) throw new ArchiveError("expanded_limit");
        controller.enqueue(chunk);
      },
    }),
  );
}
async function consume(
  stream: ReadableStream<Uint8Array>,
  keep: boolean,
  textPreview = false,
) {
  // GZIP streams are bounded upstream; TAR bodies follow validated sizes.
  const chunks: Uint8Array[] = [];
  let size = 0;
  const reader = stream.getReader();
  try {
    for (;;) {
      const { value, done } = await reader.read();
      if (done) break;
      size += value.length;
      if (textPreview && size > ARCHIVE_PREVIEW_LIMIT)
        throw new ArchiveError("preview_limit");
      if (keep) chunks.push(value);
    }
  } catch (error) {
    await reader.cancel(error).catch(() => {});
    throw error;
  } finally {
    reader.releaseLock();
  }
  if (!keep) return { size };
  const bytes = new Uint8Array(size);
  let at = 0;
  for (const c of chunks) {
    bytes.set(c, at);
    at += c.length;
  }
  return { size, bytes };
}
function gzipName(bytes: Uint8Array, filename: string) {
  if (bytes.length < 18 || bytes[2] !== 8 || bytes[3] & 224)
    throw new ArchiveError("invalid_input");
  let at = 10;
  const flags = bytes[3];
  if (flags & 4) {
    // The minimum 18-byte input check above already includes bytes 10–11.
    const size = bytes[at] | (bytes[at + 1] << 8);
    at += size + 2;
  }
  const readString = () => {
    const start = at;
    while (at < bytes.length && bytes[at] !== 0) at++;
    if (at >= bytes.length) throw new ArchiveError("invalid_input");
    // GZIP uses ISO-8859-1 bytes. TextDecoder aliases that label to Windows-1252.
    // Bound each spread so long names do not exceed the engine argument limit.
    const parts: string[] = [];
    for (let i = start; i < at; i += 8192)
      parts.push(
        String.fromCharCode(...bytes.subarray(i, Math.min(i + 8192, at))),
      );
    const value = parts.join("");
    at++;
    return value;
  };
  const name =
    flags & 8 ? readString() : filename.replace(/\.gz$/i, "") || "archive.bin";
  if (flags & 16) readString();
  if (flags & 2) at += 2;
  if (at > bytes.length - 8) throw new ArchiveError("invalid_input");
  return name;
}
export async function processArchive(job: ArchiveJob): Promise<ArchiveResult> {
  let format = archiveFormat(job.bytes, job.filename);
  const entries: ArchiveEntry[] = [];
  let total = 0,
    metadata = 0,
    output: Uint8Array<ArrayBuffer> | undefined,
    found = false;
  const add = (entry: Omit<ArchiveEntry, "id" | "unsafePath">) => {
    if (entries.length >= ARCHIVE_ENTRY_LIMIT)
      throw new ArchiveError("entry_limit");
    if (
      !Number.isSafeInteger(entry.size) ||
      entry.size < 0 ||
      entry.size > ARCHIVE_EXPANDED_LIMIT
    )
      throw new ArchiveError("expanded_limit");
    metadata += new TextEncoder().encode(
      entry.path + (entry.linkTarget ?? ""),
    ).length;
    if (metadata > 16 * 1048576) throw new ArchiveError("entry_limit");
    total += entry.kind === "file" ? entry.size : 0;
    if (total > ARCHIVE_EXPANDED_LIMIT)
      throw new ArchiveError("expanded_limit");
    const item = {
      ...entry,
      id: String(entries.length),
      unsafePath: pathIsUnsafe(entry.path),
    };
    entries.push(item);
    return item;
  };
  const selected = (entry: ArchiveEntry) => {
    if (job.action === "list" || entry.id !== job.entryId) return false;
    found = true;
    if (entry.kind !== "file") throw new ArchiveError("file_only");
    if (entry.encrypted) throw new ArchiveError("encrypted");
    if (
      job.action === "preview" &&
      previewKind(entry.path) === "text" &&
      entry.size > ARCHIVE_PREVIEW_LIMIT
    )
      throw new ArchiveError("preview_limit");
    return true;
  };
  if (format === "zip") {
    const reader = new ZipReader(new Uint8ArrayReader(job.bytes), {
      useWebWorkers: false,
      checkCrc32: true,
      // Inspector only: retain raw unsafe names for display; never write archive paths to disk.
      filenameValidation: "tolerant",
    });
    try {
      for await (const raw of reader.getEntriesGenerator()) {
        const kind = raw.directory
          ? "directory"
          : raw.symlink
            ? "symlink"
            : "file";
        const entry = add({
          path: raw.filename,
          kind,
          size: raw.uncompressedSize,
          compressedSize: raw.compressedSize,
          modifiedAt: iso(raw.lastModDate),
          encrypted: raw.encrypted,
        });
        if (selected(entry) && !raw.directory) {
          const chunks: Uint8Array[] = [];
          let size = 0;
          await raw.getData(
            new WritableStream<Uint8Array>({
              write(chunk) {
                size += chunk.length;
                // Selected entry limits were checked before decoding. ZipReader
                // enforces its declared output size and rejects excess output.
                chunks.push(chunk);
              },
            }),
            { useWebWorkers: false, checkCrc32: true },
          );
          // ZipReader.getData rejects a declared/actual size mismatch before resolving.
          output = new Uint8Array(size);
          let at = 0;
          for (const chunk of chunks) {
            output.set(chunk, at);
            at += chunk.length;
          }
        }
      }
    } catch (error) {
      if (error instanceof ArchiveError) throw error;
      throw new ArchiveError("invalid_input");
    } finally {
      await reader.close();
    }
  } else {
    let stream = new Blob([job.bytes]).stream();
    let gzipFilename = job.filename;
    if (format === "gz" || format === "tgz") {
      if (typeof DecompressionStream !== "function")
        throw new ArchiveError("unsupported");
      // Validate optional header fields before starting decompression or format sniffing.
      gzipFilename = gzipName(job.bytes, job.filename);
      stream = bounded(
        stream.pipeThrough(new DecompressionStream("gzip")),
        ARCHIVE_EXPANDED_LIMIT,
      );
      if (format === "gz") {
        // Sniff decompressed header without buffering the archive or losing bytes.
        const reader = stream.getReader(),
          prefix: Uint8Array<ArrayBuffer>[] = [];
        let size = 0,
          ended = false;
        try {
          while (size < 512 && !ended) {
            const next = await reader.read();
            ended = next.done;
            if (next.value) {
              prefix.push(next.value);
              size += next.value.length;
            }
          }
        } catch (error) {
          reader.releaseLock();
          throw error;
        }
        const head = new Uint8Array(Math.min(size, 512));
        let offset = 0;
        for (const p of prefix) {
          const slice = p.subarray(0, head.length - offset);
          head.set(slice, offset);
          offset += slice.length;
          if (offset === head.length) break;
        }
        stream = new ReadableStream({
          start(controller) {
            for (const p of prefix) controller.enqueue(p);
            if (ended) {
              reader.releaseLock();
              controller.close();
            }
          },
          async pull(controller) {
            try {
              const next = await reader.read();
              if (next.done) {
                reader.releaseLock();
                controller.close();
              } else controller.enqueue(next.value);
            } catch (error) {
              reader.releaseLock();
              throw error;
            }
          },
          async cancel(reason) {
            try {
              await reader.cancel(reason);
            } finally {
              reader.releaseLock();
            }
          },
        });
        if (
          head.length >= 262 &&
          new TextDecoder().decode(head.subarray(257, 262)) === "ustar"
        )
          format = "tgz";
      }
    }
    if (format === "gz") {
      const name = gzipFilename,
        keep = job.action !== "list" && job.entryId === "0";
      const content = await consume(
        stream,
        keep,
        job.action === "preview" && keep && previewKind(name) === "text",
      );
      const timestamp = new DataView(
        job.bytes.buffer,
        job.bytes.byteOffset,
        job.bytes.byteLength,
      ).getUint32(4, true);
      const entry = add({
        path: name,
        kind: "file",
        size: content.size,
        compressedSize: job.bytes.length,
        modifiedAt: timestamp ? new Date(timestamp * 1000).toISOString() : null,
        encrypted: false,
      });
      if (selected(entry)) output = content.bytes;
    } else {
      const guard = tarGuard();
      const tar = stream
        .pipeThrough(guard.stream)
        .pipeThrough(createTarDecoder({ strict: true }));
      let ordinal = 0;
      const reader = tar.getReader();
      try {
        for (;;) {
          const { value, done } = await reader.read();
          if (done) break;
          const h = value.header;
          const rawFlag = guard.ordinaryFlags[ordinal++];
          const kind = !["0", "\0", "1", "2", "3", "4", "5", "6"].includes(
            rawFlag,
          )
            ? "other"
            : h.type === "directory"
              ? "directory"
              : h.type === "symlink"
                ? "symlink"
                : h.type === "file" || !h.type
                  ? "file"
                  : "other";
          const entry = add({
            path: h.name,
            kind,
            size: h.size,
            compressedSize: null,
            modifiedAt: iso(h.mtime),
            encrypted: false,
            ...(h.linkname ? { linkTarget: h.linkname } : {}),
          });
          const keep = selected(entry);
          const content = await consume(value.body, keep);
          // The strict decoder completes the declared body or rejects truncation.
          if (keep) output = content.bytes;
        }
      } catch (error) {
        await reader.cancel(error).catch(() => {});
        throw error;
      } finally {
        reader.releaseLock();
      }
    }
  }
  if (job.action !== "list" && !found)
    throw new ArchiveError("entry_not_found");
  let previewText: string | undefined;
  const selectedEntry = entries.find((e) => e.id === job.entryId);
  if (
    job.action === "preview" &&
    output &&
    selectedEntry &&
    previewKind(selectedEntry.path) === "text"
  ) {
    previewText = new TextDecoder().decode(output);
  }
  return {
    format,
    entries,
    archiveBytes: job.bytes.length,
    uncompressedBytes: total,
    ...(output ? { bytes: output } : {}),
    ...(previewText !== undefined ? { previewText } : {}),
  };
}

/** Observe TAR header boundaries; the maintained decoder remains responsible for parsing/checksums.
 * This preserves unknown entry kinds which modern-tar otherwise calls ordinary files.
 */
function tarGuard() {
  const ordinaryFlags: string[] = [];
  let header = new Uint8Array(512),
    headerAt = 0,
    remaining = 0,
    ended = false,
    pax: Uint8Array | null = null,
    paxAt = 0,
    paxGlobal = false,
    totalPax = 0,
    globalSize: number | undefined,
    localSize: number | undefined;
  const number = (field: Uint8Array) => {
    let value = 0n;
    if (field[0] & 128) {
      if (field[0] & 64) throw new ArchiveError("invalid_input");
      value = BigInt(field[0] & 127);
      for (let i = 1; i < field.length; i++)
        value = value * 256n + BigInt(field[i]);
    } else {
      const text = new TextDecoder().decode(field).replaceAll("\0", "").trim();
      if (text && !/^[0-7]+$/.test(text))
        throw new ArchiveError("invalid_input");
      value = text ? BigInt(`0o${text}`) : 0n;
    }
    if (value > BigInt(ARCHIVE_EXPANDED_LIMIT))
      throw new ArchiveError("expanded_limit");
    return Number(value);
  };
  const parsePax = () => {
    if (!pax) return;
    let at = 0;
    while (at < pax.length) {
      let space = at;
      while (space < pax.length && pax[space] !== 32) space++;
      const sizeText = new TextDecoder().decode(pax.subarray(at, space));
      if (!/^[1-9]\d*$/.test(sizeText)) throw new ArchiveError("invalid_input");
      const size = Number(sizeText);
      if (
        !Number.isSafeInteger(size) ||
        size <= space - at + 1 ||
        at + size > pax.length ||
        pax[at + size - 1] !== 10
      )
        throw new ArchiveError("invalid_input");
      const text = new TextDecoder().decode(
          pax.subarray(space + 1, at + size - 1),
        ),
        equals = text.indexOf("="),
        key = text.slice(0, equals),
        value = text.slice(equals + 1);
      if (key.startsWith("GNU.sparse")) throw new ArchiveError("unsupported");
      if (key === "size") {
        if (!/^\d+$/.test(value) || !Number.isSafeInteger(Number(value)))
          throw new ArchiveError("invalid_input");
        const n = Number(value);
        if (n > ARCHIVE_EXPANDED_LIMIT)
          throw new ArchiveError("expanded_limit");
        if (paxGlobal) globalSize = n;
        else localSize = n;
      }
      at += size;
    }
    pax = null;
  };
  const stream = new TransformStream<
    Uint8Array<ArrayBuffer>,
    Uint8Array<ArrayBuffer>
  >({
    transform(chunk, controller) {
      let at = 0;
      while (at < chunk.length && !ended) {
        if (remaining) {
          const count = Math.min(remaining, chunk.length - at);
          if (pax && paxAt < pax.length) {
            const n = Math.min(count, pax.length - paxAt);
            pax.set(chunk.subarray(at, at + n), paxAt);
            paxAt += n;
          }
          remaining -= count;
          at += count;
          if (!remaining) parsePax();
          continue;
        }
        const count = Math.min(512 - headerAt, chunk.length - at);
        header.set(chunk.subarray(at, at + count), headerAt);
        headerAt += count;
        at += count;
        if (headerAt < 512) continue;
        headerAt = 0;
        if (header.every((b) => b === 0)) {
          ended = true;
          continue;
        }
        const flag = String.fromCharCode(header[156]);
        if (flag === "S") throw new ArchiveError("unsupported");
        const extension = ["x", "g", "L", "K"].includes(flag);
        const declared = number(header.subarray(124, 136)),
          size = extension ? declared : (localSize ?? globalSize ?? declared);
        remaining = Math.ceil(size / 512) * 512;
        if (flag === "x" || flag === "g") {
          totalPax += size;
          if (totalPax > 16 * 1048576) throw new ArchiveError("entry_limit");
          pax = new Uint8Array(size);
          paxAt = 0;
          paxGlobal = flag === "g";
          if (!remaining) parsePax();
        }
        if (!extension) {
          ordinaryFlags.push(flag);
          if (ordinaryFlags.length > ARCHIVE_ENTRY_LIMIT)
            throw new ArchiveError("entry_limit");
          localSize = undefined;
        }
        header = new Uint8Array(512);
      }
      controller.enqueue(chunk);
    },
  });
  return { stream, ordinaryFlags };
}
