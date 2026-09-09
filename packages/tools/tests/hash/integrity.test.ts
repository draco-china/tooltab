import { createHash, createHmac } from "node:crypto";
import { describe, expect, it } from "vitest";
import {
  generateHmac,
  generateSri,
  HMAC_ALGORITHMS,
  IntegrityError,
  integrityKey,
  integrityText,
  verifySri,
} from "../../src/hash/integrity";

const bytes = new TextEncoder().encode(
  "The quick brown fox jumps over the lazy dog",
);

function nativeHmac(algorithm: string, input: Uint8Array, key: Uint8Array) {
  return createHmac(algorithm.toLowerCase(), key).update(input).digest();
}

function nativeHash(algorithm: string, input: Uint8Array) {
  return createHash(algorithm).update(input).digest();
}

function base64(value: Uint8Array) {
  return Buffer.from(value).toString("base64");
}

describe("integrity hash core", () => {
  it("encodes text and rejects malformed UTF-16", () => {
    expect(integrityText("😀e\u0301")).toEqual(
      new TextEncoder().encode("😀e\u0301"),
    );
    for (const value of ["\ud800", "\udfff", "a\ud800b"])
      expect(() => integrityText(value)).toThrow(
        expect.objectContaining({ code: "read_failed" }),
      );
  });

  it("decodes UTF-8, strict hex, and canonical base64 keys", () => {
    expect(integrityKey("secret")).toEqual(new TextEncoder().encode("secret"));
    expect(integrityKey("000102ff", "hex")).toEqual(
      new Uint8Array([0, 1, 2, 255]),
    );
    expect(integrityKey("AAEC/w==", "base64")).toEqual(
      new Uint8Array([0, 1, 2, 255]),
    );
    for (const [value, encoding] of [
      ["0", "hex"],
      ["0g", "hex"],
      ["AAEC/w", "base64"],
      ["\ud800", "utf8"],
    ] as const)
      expect(() => integrityKey(value, encoding)).toThrow(
        expect.objectContaining({ code: "invalid_key" }),
      );
    expect(() => integrityKey("a".repeat(2 * 1024 * 1024 + 1))).toThrow(
      expect.objectContaining({ code: "invalid_key" }),
    );
  });

  it.each(HMAC_ALGORITHMS)(
    "matches the native %s HMAC vector",
    async (algorithm) => {
      const key = integrityKey("key");
      const result = await generateHmac(bytes, key, algorithm);
      const expected = nativeHmac(algorithm.replace("SHA-", "sha"), bytes, key);
      expect(result).toEqual({
        algorithm,
        bytes: bytes.length,
        hex: expected.toString("hex"),
        base64: expected.toString("base64"),
      });
      expect(key).toEqual(new TextEncoder().encode("key"));
    },
  );

  it("snapshots and clears a typed array input without changing its view", async () => {
    const source = new Uint8Array([9, 8, 7, 6]);
    const result = await generateHmac(source, new Uint8Array([1, 2]));
    expect(result.bytes).toBe(source.length);
    expect(source).toEqual(new Uint8Array([9, 8, 7, 6]));
  });

  it("hashes Blob input in chunks and async iterable input", async () => {
    const large = Uint8Array.from(
      { length: 65536 * 2 + 11 },
      (_, i) => i % 251,
    );
    const blobResult = await generateSri(new Blob([large]));
    const iterableResult = await generateSri(
      (async function* () {
        yield large.subarray(0, 100);
        await Promise.resolve();
        yield large.subarray(100, 65536 + 100);
        yield large.subarray(65536 + 100);
      })(),
    );
    expect(iterableResult).toEqual(blobResult);
    expect(blobResult.bytes).toBe(large.length);
  });

  it("matches native SHA digests and chooses the strongest valid SRI token", async () => {
    const result = await generateSri(bytes);
    for (const algorithm of ["sha256", "sha384", "sha512"] as const)
      expect(result[algorithm]).toBe(
        `${algorithm}-${base64(nativeHash(algorithm, bytes))}`,
      );
    expect(verifySri(result, `${result.sha256} ${result.sha512}`)).toEqual({
      valid: true,
      algorithm: "sha512",
    });
    expect(verifySri(result, `sha512-AAAA ${result.sha256}`)).toEqual({
      valid: false,
      algorithm: "sha512",
    });
    expect(verifySri(result, `sha512-AAAA`)).toEqual({
      valid: false,
      algorithm: "sha512",
    });
  });

  it("accepts SRI URL-safe tokens and rejects invalid metadata", async () => {
    const result = await generateSri(bytes);
    const urlSafe = result.sha256.replaceAll("+", "-").replaceAll("/", "_");
    expect(verifySri(result, urlSafe)).toEqual({
      valid: true,
      algorithm: "sha256",
    });
    for (const metadata of ["", "sha1-abc", "sha256-", "sha256-!!!!"])
      expect(() => verifySri(result, metadata)).toThrow(
        expect.objectContaining({ code: "invalid_metadata" }),
      );
    expect(() => verifySri(result, "x".repeat(65537))).toThrow(
      expect.objectContaining({ code: "invalid_metadata" }),
    );
  });

  it("propagates cancellation before and during work", async () => {
    const before = new AbortController();
    const reason = new Error("cancelled");
    before.abort(reason);
    await expect(generateSri(bytes, before.signal)).rejects.toBe(reason);

    const during = new AbortController();
    const pending = (async function* () {
      yield bytes;
      during.abort(reason);
      yield bytes;
    })();
    await expect(
      generateHmac(pending, new Uint8Array([1]), "SHA-256", during.signal),
    ).rejects.toBe(reason);
  });

  it("reports invalid algorithms and preserves the error shape", async () => {
    const error = new IntegrityError("invalid_algorithm");
    expect(error).toMatchObject({ name: "Error", code: "invalid_algorithm" });
    await expect(
      generateHmac(bytes, new Uint8Array([1]), "SHA-256", undefined),
    ).resolves.toMatchObject({ algorithm: "SHA-256" });
  });
});

it("rejects unsupported HMAC and oversized decoded keys", async () => {
  await expect(
    generateHmac(
      bytes,
      new Uint8Array(),
      "invalid" as (typeof HMAC_ALGORITHMS)[number],
    ),
  ).rejects.toMatchObject({ code: "invalid_algorithm" });
  await expect(
    generateHmac(bytes, new Uint8Array(1048577)),
  ).rejects.toMatchObject({ code: "invalid_key" });
  expect(() => integrityKey("é".repeat(524289))).toThrow(
    expect.objectContaining({ code: "invalid_key" }),
  );
  expect(integrityKey("", "hex")).toEqual(new Uint8Array());
  const sri = await generateSri(bytes);
  expect(verifySri(sri, `${sri.sha256} sha512-AB==`)).toEqual({
    valid: false,
    algorithm: "sha512",
  });
});
it("captures input and key before asynchronous execution and closes failed streams", async () => {
  const data = Uint8Array.of(1, 2, 3),
    key = Uint8Array.of(4, 5, 6);
  const expected = createHmac("sha256", key).update(data).digest("hex");
  const pending = generateHmac(data, key);
  data.fill(0);
  key.fill(0);
  expect((await pending).hex).toBe(expected);
  for (const generate of [
    (source: AsyncIterable<Uint8Array>) => generateSri(source),
    (source: AsyncIterable<Uint8Array>) =>
      generateHmac(source, new Uint8Array()),
  ]) {
    let closed = false;
    const error = new Error("source failed");
    async function* source() {
      try {
        yield bytes;
        throw error;
      } finally {
        closed = true;
      }
    }
    await expect(generate(source())).rejects.toBe(error);
    expect(closed).toBe(true);
  }
});

it("rejects cancellation after the final source block and permits a fresh run", async () => {
  for (const kind of ["hmac", "sri"] as const) {
    const controller = new AbortController();
    const reason = new Error("cancelled after last block");
    let closed = false;
    async function* source() {
      try {
        yield bytes;
        controller.abort(reason);
      } finally {
        closed = true;
      }
    }
    const pending =
      kind === "hmac"
        ? generateHmac(source(), new Uint8Array(), "SHA-256", controller.signal)
        : generateSri(source(), controller.signal);
    await expect(pending).rejects.toBe(reason);
    expect(closed).toBe(true);
    const retry =
      kind === "hmac"
        ? await generateHmac(bytes, new Uint8Array())
        : await generateSri(bytes);
    expect(retry.bytes).toBe(bytes.length);
  }
});

it("propagates a Blob read failure and retains caller ownership of the original Blob", async () => {
  const reason = new Error("Blob read failed");
  class UnreadableBlob extends Blob {
    override slice() {
      return new (class extends Blob {
        override arrayBuffer(): Promise<ArrayBuffer> {
          return Promise.reject(reason);
        }
      })();
    }
  }
  for (const generate of [
    (source: Blob) => generateSri(source),
    (source: Blob) => generateHmac(source, new Uint8Array()),
  ]) {
    await expect(generate(new UnreadableBlob([bytes]))).rejects.toBe(reason);
    const source = new Blob([bytes]);
    expect((await generate(source)).bytes).toBe(bytes.length);
    expect(new Uint8Array(await source.arrayBuffer())).toEqual(bytes);
  }
});

it("honors a pre-aborted HMAC signal before key validation and rejects noncanonical key padding", async () => {
  const reason = new Error("already cancelled");
  await expect(
    generateHmac(
      bytes,
      new Uint8Array(1048577),
      "SHA-256",
      AbortSignal.abort(reason),
    ),
  ).rejects.toBe(reason);
  for (const value of ["AB==", "AAB=", "!!!!", "AA== "])
    expect(() => integrityKey(value, "base64")).toThrow(
      expect.objectContaining({ code: "invalid_key" }),
    );
  expect(integrityKey("", "base64")).toEqual(new Uint8Array());
});
