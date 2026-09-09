import { createHash } from "node:crypto";
import { expect, it } from "vitest";
import { fingerprintBytes } from "../../src/crypto/fingerprint";

it("fingerprints exact input bytes including typed-array offsets", async () => {
  const storage = Uint8Array.from([255, 0, 1, 128, 254]);
  for (const input of [
    new Uint8Array(),
    storage,
    storage.subarray(1, 4),
    new DataView(storage.buffer, 2, 2),
    storage.buffer,
  ]) {
    const bytes = ArrayBuffer.isView(input)
      ? new Uint8Array(input.buffer, input.byteOffset, input.byteLength)
      : new Uint8Array(input);
    const result = await fingerprintBytes(input);
    for (const algorithm of ["sha1", "sha256"] as const) {
      // biome-ignore lint/style/noNonNullAssertion: test fixture or setup guarantees this value exists
      const expected = createHash(algorithm)
        .update(bytes)
        .digest("hex")
        .match(/../g)!
        .join(":")
        .toUpperCase();
      expect(result[algorithm]).toBe(expected);
    }
  }
});
