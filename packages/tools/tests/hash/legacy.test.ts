import { ShaHashError } from "../../src/hash/sha-input";
import { createHash } from "node:crypto";
import { expect, it, vi } from "vitest";
import {
  hashLegacyBytes,
  LEGACY_ALGORITHMS,
  type LegacyAlgorithm,
} from "../../src/hash/legacy";
import {
  createAdler32State,
  updateAdler32,
  formatAdler32,
} from "../../src/checksum/adler32";
it.each(LEGACY_ALGORITHMS)(
  "matches independent %s references",
  async (algorithm) => {
    for (const length of [0, 3, 262145]) {
      const backing = Uint8Array.from(
          { length: length + 2 },
          (_, i) => i % 251,
        ),
        data = backing.subarray(1, length + 1);
      const expected =
        algorithm === "Adler-32"
          ? formatAdler32(updateAdler32(createAdler32State(), data)).hex
          : createHash(algorithm === "MD5" ? "md5" : "ripemd160")
              .update(data)
              .digest("hex");
      expect(
        Buffer.from(await hashLegacyBytes(algorithm, data)).toString("hex"),
      ).toBe(expected);
    }
  },
);
it("validates limits and suppresses cancelled output", async () => {
  await expect(
    hashLegacyBytes("invalid" as LegacyAlgorithm, new Uint8Array()),
  ).rejects.toMatchObject({ code: "unsupported" });
  await expect(
    hashLegacyBytes("MD5", new Uint8Array(33554433)),
  ).rejects.toMatchObject({ code: "too-large" });
  for (const algorithm of LEGACY_ALGORITHMS) {
    const c = new AbortController(),
      reason = new Error("cancelled");
    const pending = hashLegacyBytes(
      algorithm,
      new Uint8Array(262145),
      c.signal,
    );
    c.abort(reason);
    await expect(pending).rejects.toBe(reason);
    await expect(
      hashLegacyBytes(algorithm, new Uint8Array(), c.signal),
    ).rejects.toBe(reason);
  }
});
it("snapshots input and permits a fresh operation after cancellation", async () => {
  const data = Uint8Array.of(1, 2, 3);
  const expected = createHash("md5").update(data).digest("hex");
  const result = hashLegacyBytes("MD5", data);
  data.fill(0);
  expect(Buffer.from(await result).toString("hex")).toBe(expected);
});

it("reports unavailable WebAssembly and recovers after the platform is restored", async () => {
  vi.resetModules();
  try {
    vi.stubGlobal("WebAssembly", undefined);
    const isolated = await import("../../src/hash/legacy");
    await expect(
      isolated.hashLegacyBytes("MD5", Uint8Array.of(1)),
    ).rejects.toMatchObject({ code: "digest-failed" });
  } finally {
    vi.unstubAllGlobals();
    vi.resetModules();
  }
  const restored = await import("../../src/hash/legacy");
  expect(
    Buffer.from(
      await restored.hashLegacyBytes("MD5", new Uint8Array()),
    ).toString("hex"),
  ).toBe("d41d8cd98f00b204e9800998ecf8427e");
});

it("preserves domain errors from typed-array view operations", async () => {
  const reason = new ShaHashError("read-failed");
  class Input extends Uint8Array<ArrayBuffer> {
    override subarray(): Uint8Array<ArrayBuffer> {
      throw reason;
    }
  }
  const input = new Input(Uint8Array.of(1, 2, 3).buffer);
  await expect(hashLegacyBytes("MD5", input)).rejects.toBe(reason);
  expect(Array.from(input)).toEqual([1, 2, 3]);
});
