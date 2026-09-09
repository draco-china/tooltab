import { createHash } from "node:crypto";
import { expect, it } from "vitest";
import { createShake128, createShake256 } from "../../src/hash/shake";

it.each([
  ["shake128", createShake128],
  ["shake256", createShake256],
] as const)(
  "matches Node %s for incremental input and output boundaries",
  (name, create) => {
    const input = Uint8Array.from({ length: 1025 }, (_, i) => i % 251);
    for (const outputLength of [1, 32, 8192]) {
      const expected = createHash(name, { outputLength })
        .update(input)
        .digest();
      const hasher = create(outputLength);
      try {
        hasher.update(input.subarray(0, 100));
        hasher.update(input.subarray(100));
        expect(hasher.digest()).toEqual(new Uint8Array(expected));
      } finally {
        hasher.destroy();
      }
      expect(() => hasher.update(input)).toThrow();
    }
  },
);

it.each([createShake128, createShake256])(
  "rejects invalid output lengths before creating a digest",
  (create) => {
    for (const bytes of [0, -1, 0.5, 8193, NaN, Infinity]) {
      expect(() => create(bytes)).toThrow(
        expect.objectContaining({ code: "invalid-length" }),
      );
    }
    const hasher = create(32);
    hasher.destroy();
  },
);
