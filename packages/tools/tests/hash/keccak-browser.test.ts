import { expect, it } from "vitest";
import {
  hashKeccakSource,
  KECCAK_OUTPUT_LENGTHS,
} from "../../src/hash/keccak-browser";
import { hashBlakeBytes } from "../../src/hash/blake";
import { MAX_HASH_FILE_BYTES } from "../../src/hash/sha-input";

const hex = (bytes: Uint8Array) => Buffer.from(bytes).toString("hex");

it.each([
  [224, "f71837502ba8e10837bdd8d365adb85591895602fc552b48b7390abd"],
  [256, "c5d2460186f7233c927e7db2dcc703c0e500b653ca82273b7bfad8045d85a470"],
  [
    384,
    "2c23146a63a29acf99e73b88f8c24eaa7dc60aa771780ccc006afbfa8fe2479b2dd2b21362337441ac12b515911957ff",
  ],
  [
    512,
    "0eab42de4c3ceb9235fc91acffe746b29c29a8c366b7c60e4e67c466f36a4304c00fa9caf9d87976ba469bcbe06713b435f091ef2769fb160cdab33d3670680e",
  ],
] as const)(
  "matches the independent empty-input Keccak-%s vector",
  async (outputBits, expected) => {
    const bytes = new TextEncoder().encode("");
    expect(hex(await hashBlakeBytes("Keccak", bytes, { outputBits }))).toBe(
      expected,
    );
    await expect(
      hashKeccakSource({ source: "text", bytes, outputBits }),
    ).resolves.toSatisfy((digest: Uint8Array) => hex(digest) === expected);
    expect(bytes).toEqual(new Uint8Array());
  },
);

it("consumes text bytes and matches the core implementation for a multiblock File", async () => {
  const text = new TextEncoder().encode("Keccak browser input 😀");
  const textExpected = await hashBlakeBytes("Keccak", text, {
    outputBits: 256,
  });
  const textResult = await hashKeccakSource({
    source: "text",
    bytes: text,
    outputBits: 256,
  });
  expect(textResult).toEqual(textExpected);
  expect(text).toEqual(new Uint8Array(text.length));

  const source = Uint8Array.from(
    { length: 2 * 65536 + 17 },
    (_, index) => index % 251,
  );
  const expected = await hashBlakeBytes("Keccak", source, { outputBits: 512 });
  const result = await hashKeccakSource({
    source: "file",
    file: new File([source], "multiblock.bin"),
    outputBits: 512,
  });
  expect(result).toEqual(expected);
});

it("rejects invalid output lengths and oversized files before reading", async () => {
  expect(KECCAK_OUTPUT_LENGTHS).toEqual([224, 256, 384, 512]);
  for (const outputBits of [0, 223, 225, 513])
    await expect(
      hashKeccakSource({ source: "text", bytes: new Uint8Array(), outputBits }),
    ).rejects.toMatchObject({
      name: "KeccakPageError",
      code: "invalid-length",
    });

  class OversizedFile extends File {
    override stream(): never {
      throw new Error("must not read oversized file");
    }
  }
  await expect(
    hashKeccakSource({
      source: "file",
      file: new OversizedFile(
        [new Uint8Array(MAX_HASH_FILE_BYTES + 1)],
        "oversized.bin",
      ),
      outputBits: 256,
    }),
  ).rejects.toMatchObject({ code: "too-large" });
});

it("maps a real stream read failure to read-failed", async () => {
  class UnreadableFile extends File {
    override stream() {
      return new ReadableStream<Uint8Array<ArrayBuffer>>({
        start(controller) {
          controller.error(new Error("disk unavailable"));
        },
      });
    }
  }
  await expect(
    hashKeccakSource({
      source: "file",
      file: new UnreadableFile(["abc"], "unreadable.bin"),
      outputBits: 256,
    }),
  ).rejects.toMatchObject({ name: "KeccakPageError", code: "read-failed" });
});

it("cancels the underlying stream when cumulative input exceeds the limit", async () => {
  let cancelled = false;
  let reads = 0;
  const stream = new ReadableStream<Uint8Array<ArrayBuffer>>({
    pull(controller) {
      reads++;
      if (reads <= 2) controller.enqueue(new Uint8Array(16 * 1024 * 1024));
      else controller.enqueue(new Uint8Array(1));
    },
    cancel() {
      cancelled = true;
    },
  });
  class ExpandingFile extends File {
    override stream() {
      return stream;
    }
  }
  await expect(
    hashKeccakSource({
      source: "file",
      file: new ExpandingFile([], "expanding.bin"),
      outputBits: 256,
    }),
  ).rejects.toMatchObject({ name: "KeccakPageError", code: "too-large" });
  expect(cancelled).toBe(true);
  expect(stream.locked).toBe(false);
});

it("reports transferred text input as a digest failure and permits a fresh request", async () => {
  const bytes = new TextEncoder().encode("abc");
  const transferred = structuredClone(bytes, { transfer: [bytes.buffer] });
  expect(bytes.byteLength).toBe(0);
  await expect(
    hashKeccakSource({ source: "text", bytes, outputBits: 256 }),
  ).rejects.toMatchObject({ name: "KeccakPageError", code: "digest-failed" });
  expect(
    hex(
      await hashKeccakSource({
        source: "text",
        bytes: transferred,
        outputBits: 256,
      }),
    ),
  ).toBe("4e03657aea45a94fc7d47ba826c8d667c0d1e6e33a64a036ec44f58fa12d6c45");
  expect(transferred).toEqual(new Uint8Array(3));
});
