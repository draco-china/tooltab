import { formatDigest } from "../../src/hash/format";
import { createHash } from "node:crypto";
import { expect, it } from "vitest";
import { hashMd5Source, Md5HashError } from "../../src/hash/md5";

const asBytes = (bytes: Uint8Array): Uint8Array<ArrayBuffer> =>
  new Uint8Array(bytes);

it("returns the four digest formats for the independent empty MD5 vector", () => {
  const digest = new Uint8Array(createHash("md5").update("").digest());
  const result = formatDigest("MD5", 0, digest);
  expect(result).toEqual({
    algorithm: "MD5",
    bytes: 0,
    outputBits: 128,
    hex: "d41d8cd98f00b204e9800998ecf8427e",
    base64: "1B2M2Y8AsgTpgAmY7PhCfg==",
    decimal: BigInt(`0x${result.hex}`).toString(10),
    binary: Array.from(digest, (byte) =>
      byte.toString(2).padStart(8, "0"),
    ).join(""),
  });
});

it("hashes an empty stream and a real multiblock async source", async () => {
  async function* emptySource(): AsyncIterable<Uint8Array> {}
  const emptyResult = await hashMd5Source(
    emptySource(),
    new AbortController().signal,
  );
  expect(emptyResult.hex).toBe("d41d8cd98f00b204e9800998ecf8427e");
  expect(emptyResult.bytes).toBe(0);

  const input = Uint8Array.from({ length: 262145 }, (_, index) => index % 251);
  async function* chunks(): AsyncIterable<Uint8Array> {
    yield asBytes(input.subarray(0, 65536));
    yield asBytes(input.subarray(65536, 131072));
    yield asBytes(input.subarray(131072));
  }
  const expected = createHash("md5").update(input).digest("hex");
  const result = await hashMd5Source(chunks(), new AbortController().signal);
  expect(result.hex).toBe(expected);
  expect(result.bytes).toBe(input.length);
  expect(result.outputBits).toBe(128);
});

it("does not read a pre-cancelled source", async () => {
  let read = false;
  const source: AsyncIterable<Uint8Array> = {
    [Symbol.asyncIterator]() {
      read = true;
      return {
        next: async () => ({ done: true, value: undefined }),
      } as AsyncIterator<Uint8Array>;
    },
  };
  const controller = new AbortController();
  const reason = new Error("cancelled");
  controller.abort(reason);
  await expect(hashMd5Source(source, controller.signal)).rejects.toBe(reason);
  expect(read).toBe(false);
});

it("propagates in-flight cancellation and closes the async source", async () => {
  let started = false;
  let finalized = false;
  const source = (async function* (): AsyncGenerator<Uint8Array> {
    started = true;
    try {
      yield asBytes(Uint8Array.of(1, 2, 3));
      await new Promise((resolve) => setTimeout(resolve, 50));
      yield asBytes(Uint8Array.of(4, 5, 6));
    } finally {
      finalized = true;
    }
  })();
  const controller = new AbortController();
  const reason = new Error("cancelled");
  const pending = hashMd5Source(source, controller.signal);
  while (!started) await new Promise((resolve) => setTimeout(resolve, 0));
  controller.abort(reason);
  await expect(pending).rejects.toBe(reason);
  expect(finalized).toBe(true);
});

it("rejects cancellation after the final chunk without returning a digest", async () => {
  const controller = new AbortController();
  const reason = new Error("cancelled after final chunk");
  let finalized = false;
  async function* source(): AsyncGenerator<Uint8Array> {
    try {
      yield Uint8Array.of(1, 2, 3);
      controller.abort(reason);
    } finally {
      finalized = true;
    }
  }
  await expect(hashMd5Source(source(), controller.signal)).rejects.toBe(reason);
  expect(finalized).toBe(true);
});

it("preserves source failures and exposes the domain error shape", async () => {
  const reason = new Error("source failed");
  async function* broken(): AsyncIterable<Uint8Array> {
    yield asBytes(Uint8Array.of(1));
    throw reason;
  }
  await expect(
    hashMd5Source(broken(), new AbortController().signal),
  ).rejects.toBe(reason);
  expect(new Md5HashError("read_failed")).toMatchObject({
    name: "Md5HashError",
    code: "read_failed",
    message: "read_failed",
  });
});

it("isolates interleaved streams when one source fails and allows a fresh run", async () => {
  const failure = new Error("interleaved source failed");
  const first = new TextEncoder().encode("independent successful stream");
  let resume!: () => void;
  const ready = new Promise<void>((resolve) => {
    resume = resolve;
  });
  let finalized = false;
  async function* broken(): AsyncGenerator<Uint8Array> {
    try {
      yield new TextEncoder().encode("failed stream prefix");
      resume();
      throw failure;
    } finally {
      finalized = true;
    }
  }
  async function* successful(): AsyncGenerator<Uint8Array> {
    yield first.subarray(0, 5);
    await ready;
    yield first.subarray(5);
  }
  const [failed, succeeded] = await Promise.allSettled([
    hashMd5Source(broken(), new AbortController().signal),
    hashMd5Source(successful(), new AbortController().signal),
  ]);
  expect(failed).toEqual({ status: "rejected", reason: failure });
  expect(finalized).toBe(true);
  expect(succeeded).toMatchObject({
    status: "fulfilled",
    value: {
      bytes: first.length,
      hex: createHash("md5").update(first).digest("hex"),
    },
  });
  async function* fresh(): AsyncGenerator<Uint8Array> {
    yield first;
  }
  const result = await hashMd5Source(fresh(), new AbortController().signal);
  expect(result.hex).toBe(createHash("md5").update(first).digest("hex"));
  expect(result.bytes).toBe(first.length);
});
