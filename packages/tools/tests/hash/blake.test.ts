import { MAX_HASH_FILE_BYTES } from "../../src/hash/sha-input";
import { createHash } from "node:crypto";
import { expect, it } from "vitest";
import {
  BLAKE_ALGORITHMS,
  BlakeHashError,
  decodeBlakeKey,
  defaultBlakeBits,
  hashBlakeBytes,
  validateBlakeOptions,
} from "../../src/hash/blake";

const hex = (bytes: Uint8Array) => Buffer.from(bytes).toString("hex");
const empty = new Uint8Array();

it.each([
  [
    "BLAKE2b",
    "786a02f742015903c6c6fd852552d272912f4740e15847618a86e217f71f5419d25e1031afee585313896444934eb04b903a685b1448b755d56f701afe9be2ce",
  ],
  [
    "BLAKE2s",
    "69217a3079908094e11121d042354a7c1f55b6482ca1a51e1b250dfd1ed0eef9",
  ],
  [
    "BLAKE3",
    "af1349b9f5f9a1a6a0404dea36dcc9499bcb25c9adc112b7cc9a93cae41f3262",
  ],
  [
    "Keccak",
    "c5d2460186f7233c927e7db2dcc703c0e500b653ca82273b7bfad8045d85a470",
  ],
] as const)(
  "matches the independent empty-input %s vector",
  async (algorithm, expected) => {
    const result = await hashBlakeBytes(algorithm, empty);
    expect(hex(result)).toBe(expected);
  },
);

it("matches Node crypto for BLAKE2 on real multiblock input", async () => {
  const input = Uint8Array.from({ length: 65537 }, (_, index) => index % 251);
  for (const [algorithm, native] of [
    ["BLAKE2b", "blake2b512"],
    ["BLAKE2s", "blake2s256"],
  ] as const) {
    const expected = createHash(native).update(input).digest();
    expect(await hashBlakeBytes(algorithm, input)).toEqual(
      new Uint8Array(expected),
    );
  }
});

it("supports keyed BLAKE2 and BLAKE3 with requested output lengths", async () => {
  const input = new TextEncoder().encode("keyed hash input");
  const key = Uint8Array.from({ length: 32 }, (_, index) => index);
  const otherKey = Uint8Array.from({ length: 32 }, (_, index) => index + 1);
  const keyed = await hashBlakeBytes("BLAKE2b", input, {
    key,
    outputBits: 256,
  });
  expect(keyed).toHaveLength(32);
  expect(keyed).not.toEqual(
    await hashBlakeBytes("BLAKE2b", input, { outputBits: 256 }),
  );
  expect(
    await hashBlakeBytes("BLAKE3", input, { key, outputBits: 128 }),
  ).toHaveLength(16);
  expect(await hashBlakeBytes("BLAKE3", input, { key })).not.toEqual(
    await hashBlakeBytes("BLAKE3", input, { key: otherKey }),
  );
});

it("validates algorithms, output lengths, keys, and Base64 keys", () => {
  expect(BLAKE_ALGORITHMS).toEqual(["BLAKE2b", "BLAKE2s", "BLAKE3", "Keccak"]);
  expect(defaultBlakeBits("BLAKE2b")).toBe(512);
  expect(defaultBlakeBits("BLAKE2s")).toBe(256);
  expect(defaultBlakeBits("BLAKE3")).toBe(256);
  expect(defaultBlakeBits("Keccak")).toBe(256);
  expect(validateBlakeOptions("Keccak", { outputBits: 224 })).toBe(224);
  expect(decodeBlakeKey("AQID")).toEqual(Uint8Array.of(1, 2, 3));
  expect(decodeBlakeKey("")).toEqual(new Uint8Array());
  for (const [algorithm, options] of [
    ["invalid", {}],
    ["BLAKE2b", { outputBits: 7 }],
    ["BLAKE2s", { outputBits: 512 }],
    ["BLAKE3", { key: new Uint8Array(31) }],
    ["Keccak", { key: new Uint8Array(1) }],
  ] as const)
    expect(() => validateBlakeOptions(algorithm as never, options)).toThrow(
      BlakeHashError,
    );
  expect(() => decodeBlakeKey("not base64!")).toThrowError("invalid-base64");
  expect(() => decodeBlakeKey("A".repeat(89))).toThrowError("invalid-key");
});

it("snapshots the input and key before asynchronous hashing", async () => {
  const input = Uint8Array.from([1, 2, 3, 4]);
  const key = Uint8Array.from({ length: 32 }, (_, index) => index);
  const expected = await hashBlakeBytes("BLAKE3", input, { key });
  const pending = hashBlakeBytes("BLAKE3", input, { key });
  input.fill(0);
  key.fill(0);
  await expect(pending).resolves.toEqual(expected);
});

it("honors pre-cancelled and in-flight cancellation", async () => {
  const reason = new Error("cancelled");
  const pre = new AbortController();
  pre.abort(reason);
  await expect(
    hashBlakeBytes("BLAKE3", new Uint8Array(), {}, pre.signal),
  ).rejects.toBe(reason);

  const controller = new AbortController();
  const pending = hashBlakeBytes(
    "BLAKE3",
    new Uint8Array(2 * 65536),
    {},
    controller.signal,
  );
  setTimeout(() => controller.abort(reason), 0);
  await expect(pending).rejects.toBe(reason);
});

it("rejects oversized input and preserves the public error shape", async () => {
  await expect(
    hashBlakeBytes("BLAKE2b", new Uint8Array(MAX_HASH_FILE_BYTES + 1)),
  ).rejects.toMatchObject({
    name: "BlakeHashError",
    code: "too-large",
    message: "too-large",
  });
});

it.each([
  ["BLAKE2b", 64, "a9f9ff5c38d7eda4899ab27d41b93372"],
  ["BLAKE2s", 32, "61ba5f165c194692e09d12520cc4c74a"],
] as const)(
  "matches Python hashlib for maximum-length %s keys",
  async (algorithm, keyLength, expected) => {
    const key = Uint8Array.from({ length: keyLength }, (_, i) => i);
    const input = new TextEncoder().encode("abc");
    const result = await hashBlakeBytes(algorithm, input, {
      key,
      outputBits: 128,
    });
    expect(hex(result)).toBe(expected);
    expect(key).toEqual(Uint8Array.from({ length: keyLength }, (_, i) => i));
    await expect(
      hashBlakeBytes(algorithm, input, { key: new Uint8Array(keyLength + 1) }),
    ).rejects.toMatchObject({ code: "invalid-key" });
  },
);

it("rejects noncanonical Base64 without silently changing key bytes", () => {
  for (const encoded of ["AQ", "AR==", " AQ==", "AQ==\n"]) {
    expect(atob(encoded)).toBe("\x01");
    expect(() => decodeBlakeKey(encoded)).toThrow(
      expect.objectContaining({ code: "invalid-base64" }),
    );
  }
  expect(decodeBlakeKey("AQ==")).toEqual(Uint8Array.of(1));
});

it.each(BLAKE_ALGORITHMS)(
  "rejects transferred %s input and preserves the new owner",
  async (algorithm) => {
    const input = new TextEncoder().encode("abc");
    const owned = structuredClone(input, { transfer: [input.buffer] });
    await expect(hashBlakeBytes(algorithm, input)).rejects.toMatchObject({
      name: "BlakeHashError",
      code: "digest-failed",
    });
    expect(new TextDecoder().decode(owned)).toBe("abc");
    expect(await hashBlakeBytes(algorithm, owned)).toEqual(
      await hashBlakeBytes(algorithm, new TextEncoder().encode("abc")),
    );
  },
);

it.each(["BLAKE2b", "BLAKE2s", "BLAKE3"] as const)(
  "does not silently use unkeyed %s after a key transfer",
  async (algorithm) => {
    const key = Uint8Array.from({ length: 32 }, (_, i) => i);
    const owned = structuredClone(key, { transfer: [key.buffer] });
    expect(() => validateBlakeOptions(algorithm, { key })).toThrow(
      "invalid-key",
    );
    await expect(
      hashBlakeBytes(algorithm, empty, { key }),
    ).rejects.toMatchObject({ code: "invalid-key" });
    expect(await hashBlakeBytes(algorithm, empty, { key: owned })).not.toEqual(
      await hashBlakeBytes(algorithm, empty),
    );
    expect(
      await hashBlakeBytes(algorithm, empty, { key: new Uint8Array() }),
    ).toEqual(await hashBlakeBytes(algorithm, empty));
    expect(owned).toEqual(Uint8Array.from({ length: 32 }, (_, i) => i));
  },
);

it("preserves a domain failure from the input snapshot and permits retry", async () => {
  const reason = new BlakeHashError("digest-failed");
  // The input boundary may be a typed-array subclass; the hash implementation is real.
  class UnreadableInput extends Uint8Array<ArrayBuffer> {
    override slice(): Uint8Array<ArrayBuffer> {
      throw reason;
    }
  }
  const input = new UnreadableInput(Uint8Array.of(1, 2, 3).buffer);
  await expect(hashBlakeBytes("BLAKE3", input)).rejects.toBe(reason);
  expect(Array.from(input)).toEqual([1, 2, 3]);
  expect(hex(await hashBlakeBytes("BLAKE3", new Uint8Array()))).toBe(
    "af1349b9f5f9a1a6a0404dea36dcc9499bcb25c9adc112b7cc9a93cae41f3262",
  );
});
