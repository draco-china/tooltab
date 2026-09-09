import { ShaHashError } from "../../src/hash/sha-input";
import { createHash } from "node:crypto";
import { expect, it, vi } from "vitest";
import { hashBytes } from "../../src/hash/sha";
import { SHA_ALGORITHMS, type ShaAlgorithm } from "../../src/hash/sha-input";

it.each(SHA_ALGORITHMS)(
  "matches native %s on empty, sliced and multiblock input",
  async (algorithm) => {
    const name = algorithm.startsWith("SHA3-")
      ? algorithm.toLowerCase()
      : algorithm.startsWith("SHAKE")
        ? algorithm.toLowerCase()
        : algorithm.toLowerCase().replace("sha-", "sha").replace("/", "-");
    for (const length of [0, 3, 65537]) {
      const backing = Uint8Array.from(
          { length: length + 2 },
          (_, i) => i % 251,
        ),
        data = backing.subarray(1, length + 1);
      const expected = createHash(
        name,
        algorithm === "SHAKE128"
          ? { outputLength: 32 }
          : algorithm === "SHAKE256"
            ? { outputLength: 64 }
            : undefined,
      )
        .update(data)
        .digest();
      expect(await hashBytes(algorithm, data)).toEqual(
        new Uint8Array(expected),
      );
    }
  },
);
it("preserves custom SHAKE output and rejects invalid options", async () => {
  const data = new TextEncoder().encode("abc");
  for (const algorithm of ["SHAKE128", "SHAKE256"] as const) {
    for (const bits of [8, 512, 65536])
      expect(await hashBytes(algorithm, data, undefined, bits)).toEqual(
        new Uint8Array(
          createHash(algorithm.toLowerCase(), { outputLength: bits / 8 })
            .update(data)
            .digest(),
        ),
      );
    await expect(
      hashBytes(algorithm, data, undefined, 9),
    ).rejects.toMatchObject({ code: "invalid-length" });
  }
  await expect(
    hashBytes("SHA-256", data, undefined, 256),
  ).rejects.toMatchObject({ code: "invalid-length" });
  await expect(
    hashBytes("invalid" as ShaAlgorithm, data),
  ).rejects.toMatchObject({ code: "unsupported" });
  await expect(
    hashBytes("SHA-256", new Uint8Array(32 * 1024 * 1024 + 1)),
  ).rejects.toMatchObject({ code: "too-large" });
});
it("snapshots inputs before asynchronous work and suppresses cancelled output", async () => {
  for (const algorithm of ["SHA-256", "SHA3-256"] as const) {
    const data = Uint8Array.of(1, 2, 3);
    const expected = createHash(algorithm === "SHA-256" ? "sha256" : "sha3-256")
      .update(data)
      .digest();
    const pending = hashBytes(algorithm, data);
    data.fill(0);
    expect(await pending).toEqual(new Uint8Array(expected));
    const c = new AbortController(),
      reason = new Error("cancelled");
    const cancelled = hashBytes(algorithm, new Uint8Array(65537), c.signal);
    c.abort(reason);
    await expect(cancelled).rejects.toBe(reason);
    await expect(hashBytes(algorithm, data, c.signal)).rejects.toBe(reason);
  }
});

it("maps Web Crypto unavailability and native rejection at the platform boundary", async () => {
  const bytes = Uint8Array.of(1);
  try {
    vi.stubGlobal("crypto", undefined);
    await expect(hashBytes("SHA-256", bytes)).rejects.toMatchObject({
      code: "unsupported",
    });
  } finally {
    vi.unstubAllGlobals();
  }
  const digest = vi
    .spyOn(globalThis.crypto.subtle, "digest")
    .mockRejectedValue(new Error("native failure"));
  try {
    await expect(hashBytes("SHA-256", bytes)).rejects.toMatchObject({
      code: "digest-failed",
    });
    const c = new AbortController(),
      reason = new Error("cancelled");
    const pending = hashBytes("SHA-256", bytes, c.signal);
    c.abort(reason);
    await expect(pending).rejects.toBe(reason);
  } finally {
    digest.mockRestore();
  }
});

it("preserves domain errors from typed-array view operations", async () => {
  const reason = new ShaHashError("read-failed");
  class Input extends Uint8Array<ArrayBuffer> {
    override subarray(): Uint8Array<ArrayBuffer> {
      throw reason;
    }
  }
  const input = new Input(Uint8Array.of(1, 2, 3).buffer);
  await expect(hashBytes("SHA3-256", input)).rejects.toBe(reason);
  expect(Array.from(input)).toEqual([1, 2, 3]);
});

it("maps non-domain input view failures to digest-failed", async () => {
  class Input extends Uint8Array<ArrayBuffer> {
    override subarray(): Uint8Array<ArrayBuffer> {
      throw new RangeError("view unavailable");
    }
  }
  await expect(
    hashBytes("SHA3-256", new Input(Uint8Array.of(1).buffer)),
  ).rejects.toMatchObject({
    code: "digest-failed",
  });
});

it.each(["SHA-224", "SHA3-256", "SHAKE128"] as const)(
  "maps transferred %s input to a domain error",
  async (algorithm) => {
    const input = new TextEncoder().encode("abc");
    const owned = structuredClone(input, { transfer: [input.buffer] });
    await expect(hashBytes(algorithm, input)).rejects.toMatchObject({
      name: "ShaHashError",
      code: "digest-failed",
    });
    expect(new TextDecoder().decode(owned)).toBe("abc");
    expect(await hashBytes(algorithm, owned)).toEqual(
      await hashBytes(algorithm, new TextEncoder().encode("abc")),
    );
  },
);
