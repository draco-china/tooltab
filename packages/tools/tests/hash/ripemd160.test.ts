import { formatDigest } from "../../src/hash/format";
import { createHash } from "node:crypto";
import { expect, it } from "vitest";
import {
  hashRipemd160Source,
  Ripemd160HashError,
} from "../../src/hash/ripemd160";

const asBytes = (bytes: Uint8Array): Uint8Array<ArrayBuffer> =>
  new Uint8Array(bytes);

it("returns all digest formats for the independent empty RIPEMD-160 vector", () => {
  const digest = new Uint8Array(createHash("ripemd160").update("").digest());
  const hex = Buffer.from(digest).toString("hex");
  const result = formatDigest("RIPEMD-160", 0, digest);
  expect(result).toEqual({
    algorithm: "RIPEMD-160",
    bytes: 0,
    outputBits: 160,
    hex: "9c1185a5c5e9fc54612808977ee8f548b2258d31",
    base64: Buffer.from(digest).toString("base64"),
    decimal: BigInt(`0x${hex}`).toString(10),
    binary: Array.from(digest, (byte) =>
      byte.toString(2).padStart(8, "0"),
    ).join(""),
  });
});

it("hashes an empty stream and a real multiblock async source", async () => {
  async function* emptySource(): AsyncIterable<Uint8Array> {}
  const emptyResult = await hashRipemd160Source(
    emptySource(),
    new AbortController().signal,
  );
  expect(emptyResult.hex).toBe("9c1185a5c5e9fc54612808977ee8f548b2258d31");
  expect(emptyResult.bytes).toBe(0);

  const input = Uint8Array.from({ length: 262145 }, (_, index) => index % 251);
  async function* chunks(): AsyncIterable<Uint8Array> {
    yield asBytes(input.subarray(0, 65536));
    yield asBytes(input.subarray(65536, 131072));
    yield asBytes(input.subarray(131072));
  }
  const expected = createHash("ripemd160").update(input).digest("hex");
  const result = await hashRipemd160Source(
    chunks(),
    new AbortController().signal,
  );
  expect(result.hex).toBe(expected);
  expect(result.bytes).toBe(input.length);
  expect(result.outputBits).toBe(160);
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
  await expect(hashRipemd160Source(source, controller.signal)).rejects.toBe(
    reason,
  );
  expect(read).toBe(false);
});

it("rejects a source that aborts after its final yield and closes it", async () => {
  const controller = new AbortController();
  const reason = new Error("cancelled");
  let finalized = false;
  const source = (async function* (): AsyncGenerator<Uint8Array> {
    try {
      yield asBytes(Uint8Array.of(1, 2, 3));
      controller.abort(reason);
    } finally {
      finalized = true;
    }
  })();
  await expect(hashRipemd160Source(source, controller.signal)).rejects.toBe(
    reason,
  );
  expect(finalized).toBe(true);
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
  const pending = hashRipemd160Source(source, controller.signal);
  while (!started) await new Promise((resolve) => setTimeout(resolve, 0));
  controller.abort(reason);
  await expect(pending).rejects.toBe(reason);
  expect(finalized).toBe(true);
});

it("preserves source failures and exposes the domain error shape", async () => {
  const reason = new Error("source failed");
  async function* broken(): AsyncIterable<Uint8Array> {
    yield asBytes(Uint8Array.of(1));
    throw reason;
  }
  await expect(
    hashRipemd160Source(broken(), new AbortController().signal),
  ).rejects.toBe(reason);
  expect(new Ripemd160HashError("read_failed")).toMatchObject({
    name: "Ripemd160HashError",
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
    hashRipemd160Source(broken(), new AbortController().signal),
    hashRipemd160Source(successful(), new AbortController().signal),
  ]);
  expect(failed).toEqual({ status: "rejected", reason: failure });
  expect(finalized).toBe(true);
  expect(succeeded).toMatchObject({
    status: "fulfilled",
    value: {
      bytes: first.length,
      hex: createHash("ripemd160").update(first).digest("hex"),
    },
  });
  async function* fresh(): AsyncGenerator<Uint8Array> {
    yield first;
  }
  const result = await hashRipemd160Source(
    fresh(),
    new AbortController().signal,
  );
  expect(result.hex).toBe(createHash("ripemd160").update(first).digest("hex"));
  expect(result.bytes).toBe(first.length);
});
