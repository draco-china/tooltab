import { describe, expect, it } from "vitest";
import { blobChunks } from "../../src/hash/browser";
import { CHUNK_BYTES, MAX_BYTES } from "../../src/hash/input";

async function collect(blob: Blob, signal = new AbortController().signal) {
  const chunks: Uint8Array[] = [];
  for await (const chunk of blobChunks(blob, signal)) chunks.push(chunk);
  return chunks;
}

describe("browser Blob hash input", () => {
  it("preserves bytes at chunk boundaries and skips empty blobs", async () => {
    const bytes = Uint8Array.from(
      { length: CHUNK_BYTES + 3 },
      (_, index) => index % 251,
    );
    const chunks = await collect(new Blob([bytes]));
    expect(chunks).toEqual([
      bytes.subarray(0, CHUNK_BYTES),
      bytes.subarray(CHUNK_BYTES),
    ]);
    await expect(collect(new Blob())).resolves.toEqual([]);
  });

  it("rejects oversized blobs before reading", async () => {
    let blob = new Blob([new Uint8Array(1024 * 1024)]);
    // Blob parts share immutable backing data; build real content without a TiB allocation.
    for (let power = 0; power < 20; power++) blob = new Blob([blob, blob]);
    blob = new Blob([blob, new Uint8Array([1])]);
    expect(blob.size).toBe(MAX_BYTES + 1);
    expect(new Uint8Array(await blob.slice(0, 1).arrayBuffer())).toEqual(
      new Uint8Array([0]),
    );
    await expect(collect(blob)).rejects.toMatchObject({ code: "too_large" });
  });

  it("preserves cancellation before reads and after a pending read", async () => {
    const before = new AbortController();
    const reason = new Error("cancelled");
    before.abort(reason);
    await expect(collect(new Blob(["abc"]), before.signal)).rejects.toBe(
      reason,
    );

    const during = new AbortController();
    const pending = {
      size: 3,
      slice: () => ({
        arrayBuffer: async () => {
          during.abort(reason);
          return new ArrayBuffer(3);
        },
      }),
    } as unknown as Blob;
    await expect(collect(pending, during.signal)).rejects.toBe(reason);
  });

  it("maps unreadable blob slices to the stream domain error", async () => {
    const unreadable = {
      size: 3,
      slice: () => {
        throw new Error("disk unavailable");
      },
    } as unknown as Blob;
    await expect(collect(unreadable)).rejects.toMatchObject({
      code: "read_failed",
    });
  });
});
