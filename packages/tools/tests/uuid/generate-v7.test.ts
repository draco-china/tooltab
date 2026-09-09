import { afterEach, expect, it, vi } from "vitest";
import {
  generateUuidV7,
  MAX_UUID_TIMESTAMP,
  uuidV7FromParts,
} from "../../src/uuid/generate";

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});
it("matches RFC 9562 Appendix A.6 vector", () => {
  const random = (0xcc3n << 62n) | 0x18c4dc0c0c07398fn;
  expect(uuidV7FromParts(1645557742000, random)).toBe(
    "017f22e2-79b0-7cc3-98c4-dc0c0c07398f",
  );
});
it("handles timestamp and randomness boundaries exactly", () => {
  expect(uuidV7FromParts(0, 0n)).toBe("00000000-0000-7000-8000-000000000000");
  expect(uuidV7FromParts(MAX_UUID_TIMESTAMP, (1n << 74n) - 1n)).toBe(
    "ffffffff-ffff-7fff-bfff-ffffffffffff",
  );
  for (const time of [-1, 1.1, NaN, MAX_UUID_TIMESTAMP + 1])
    expect(() => uuidV7FromParts(time, 0n)).toThrow("invalid_timestamp");
  expect(() => uuidV7FromParts(0, -1n)).toThrow("random_overflow");
  expect(() => uuidV7FromParts(0, 1n << 74n)).toThrow("random_overflow");
});
it("uses clock once and produces lexically increasing same-millisecond batches", () => {
  vi.spyOn(Date, "now").mockReturnValue(123456789);
  const random = vi.fn((bytes: Uint8Array) => bytes.fill(0));
  vi.stubGlobal("crypto", { getRandomValues: random });
  const result = generateUuidV7(100);
  expect(result.timestamp).toBe(123456789);
  expect(result.values).toHaveLength(100);
  expect(result.values).toEqual([...result.values].sort());
  expect(new Set(result.values).size).toBe(100);
  expect(random.mock.calls[0]?.[0]).toHaveLength(10);
  expect(generateUuidV7().values).toHaveLength(1);
});
it("fails closed on random overflow and crypto failure, and bounds batch size", () => {
  vi.stubGlobal("crypto", {
    getRandomValues: (bytes: Uint8Array) => bytes.fill(255),
  });
  expect(() => generateUuidV7(2, 0)).toThrow("random_overflow");
  expect(generateUuidV7(1, 0).values).toHaveLength(1);
  vi.stubGlobal("crypto", undefined);
  expect(() => generateUuidV7(1, 0)).toThrow("crypto_unavailable");
  for (const count of [0, 101, 1.5])
    expect(() => generateUuidV7(count, 0)).toThrow("invalid_count");
});
