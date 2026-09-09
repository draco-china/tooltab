import { randomUUID } from "node:crypto";
import { mkdtemp, open, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

export class ArtifactError extends Error {
  constructor(
    public readonly code:
      | "ARTIFACT_NOT_FOUND"
      | "ARTIFACT_QUOTA"
      | "ARTIFACT_TOO_LARGE"
      | "ARTIFACT_CLOSED",
  ) {
    super(code);
  }
}
export type Artifact = {
  id: string;
  path: string;
  bytes: number;
  mimeType: string;
  filename: string;
  expiresAt: number;
  kind: "upload" | "output";
};
export class ArtifactStore {
  private directory: Promise<string> | undefined;
  private records = new Map<string, Artifact>();
  private pending = new Set<Promise<unknown>>();
  private removals = new Map<string, Promise<void>>();
  private reserved = 0;
  private closed = false;
  private timer: ReturnType<typeof setInterval>;
  constructor(
    private readonly options: {
      quota?: number;
      ttl?: number;
      maxItems?: number;
      now?: () => number;
    } = {},
  ) {
    this.timer = setInterval(() => {
      void this.sweep().catch(() => {});
    }, 60_000);
    this.timer.unref();
  }
  private now() {
    return (this.options.now ?? Date.now)();
  }
  async sweep() {
    for (const record of this.records.values())
      if (record.expiresAt <= this.now()) await this.remove(record.id);
  }
  async remove(id: string) {
    const existing = this.removals.get(id);
    if (existing) return existing;
    const record = this.records.get(id);
    if (!record) return;
    const task = (async () => {
      await rm(record.path, { force: true });
      this.records.delete(id);
      this.reserved -= record.bytes;
    })();
    this.removals.set(id, task);
    try {
      await task;
    } finally {
      this.removals.delete(id);
    }
  }
  async get(id: string, kind: Artifact["kind"] = "output") {
    if (this.closed) throw new ArtifactError("ARTIFACT_CLOSED");
    const record = this.records.get(id);
    if (!record || record.kind !== kind)
      throw new ArtifactError("ARTIFACT_NOT_FOUND");
    if (record.expiresAt <= this.now()) {
      await this.remove(id);
      throw new ArtifactError("ARTIFACT_NOT_FOUND");
    }
    return { ...record };
  }
  async write(
    source: AsyncIterable<Uint8Array> | Iterable<Uint8Array>,
    options: {
      limit: number;
      mimeType: string;
      filename: string;
      kind?: Artifact["kind"];
    },
    signal?: AbortSignal,
  ): Promise<Artifact> {
    await this.sweep();
    signal?.throwIfAborted();
    if (this.closed) throw new ArtifactError("ARTIFACT_CLOSED");
    if (
      !Number.isSafeInteger(options.limit) ||
      options.limit <= 0 ||
      options.limit > 512 * 1024 * 1024
    )
      throw new ArtifactError("ARTIFACT_TOO_LARGE");
    if (
      this.records.size + this.pending.size >= (this.options.maxItems ?? 256) ||
      this.reserved + options.limit > (this.options.quota ?? 1024 ** 3)
    )
      throw new ArtifactError("ARTIFACT_QUOTA");
    this.reserved += options.limit;
    const task = this.writeReserved(source, options, signal);
    this.pending.add(task);
    try {
      return await task;
    } finally {
      this.pending.delete(task);
    }
  }
  private async writeReserved(
    source: AsyncIterable<Uint8Array> | Iterable<Uint8Array>,
    options: {
      limit: number;
      mimeType: string;
      filename: string;
      kind?: Artifact["kind"];
    },
    signal?: AbortSignal,
  ) {
    let path: string | undefined;
    let committed = false;
    const id = randomUUID();
    try {
      this.directory ??= mkdtemp(join(tmpdir(), "tooltab-artifacts-"));
      path = join(await this.directory, id);
      const handle = await open(path, "wx", 0o600);
      let bytes = 0;
      try {
        for await (const chunk of source) {
          signal?.throwIfAborted();
          if (this.closed) throw new ArtifactError("ARTIFACT_CLOSED");
          if (bytes + chunk.byteLength > options.limit)
            throw new ArtifactError("ARTIFACT_TOO_LARGE");
          let offset = 0;
          while (offset < chunk.byteLength) {
            const result = await handle.write(
              chunk,
              offset,
              chunk.byteLength - offset,
            );
            if (!result.bytesWritten)
              throw new Error("Incomplete artifact write");
            offset += result.bytesWritten;
          }
          bytes += chunk.byteLength;
        }
        signal?.throwIfAborted();
      } finally {
        await handle.close();
      }
      const record: Artifact = {
        id,
        path,
        bytes,
        mimeType: options.mimeType,
        filename: options.filename,
        kind: options.kind ?? "output",
        expiresAt: this.now() + (this.options.ttl ?? 3_600_000),
      };
      this.records.set(id, record);
      this.reserved -= options.limit - bytes;
      committed = true;
      return { ...record };
    } finally {
      if (!committed) {
        let removed = true;
        if (path) {
          try {
            await rm(path, { force: true });
          } catch {
            removed = false;
            // Retain the full reservation and retry cleanup on sweep; failed unlink must never escape quota tracking.
            this.records.set(id, {
              id,
              path,
              bytes: options.limit,
              mimeType: options.mimeType,
              filename: options.filename,
              kind: options.kind ?? "output",
              expiresAt: 0,
            });
          }
        }
        if (removed) this.reserved -= options.limit;
      }
    }
  }
  async close() {
    this.closed = true;
    clearInterval(this.timer);
    await Promise.allSettled([...this.pending, ...this.removals.values()]);
    if (this.directory)
      await rm(await this.directory, { recursive: true, force: true });
    this.records.clear();
    this.reserved = 0;
  }
}
