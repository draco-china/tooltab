import { afterEach, expect, it, vi } from "vitest";
import {
  generateUuidV4,
  uuidSentinel,
  uuidV4FromBytes,
} from "../../src/uuid/generate";

afterEach(() => vi.unstubAllGlobals());
it("sets only version and variant bits without mutating input", () => {
  const bytes = new Uint8Array(16);
  expect(uuidV4FromBytes(bytes)).toBe("00000000-0000-4000-8000-000000000000");
  expect(bytes[6]).toBe(0);
  expect(uuidV4FromBytes(new Uint8Array(16).fill(255))).toBe(
    "ffffffff-ffff-4fff-bfff-ffffffffffff",
  );
  expect(() => uuidV4FromBytes(new Uint8Array(15))).toThrow();
});
it("draws secure bytes for the complete bounded batch", () => {
  const random = vi.fn((bytes: Uint8Array) => {
    for (let i = 0; i < bytes.length; i++) bytes[i] = i % 256;
    return bytes;
  });
  vi.stubGlobal("crypto", { getRandomValues: random });
  const result = generateUuidV4(1000);
  expect(result).toHaveLength(1000);
  expect(random.mock.calls[0]?.[0]).toHaveLength(16000);
  expect(result[0]).toBe("00010203-0405-4607-8809-0a0b0c0d0e0f");
  for (const value of result)
    expect(value).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/,
    );
});
it("validates count and fails closed for unavailable and throwing crypto", () => {
  for (const count of [0, 1001, 1.2, NaN, Infinity])
    expect(() => generateUuidV4(count)).toThrow("invalid_count");
  vi.stubGlobal("crypto", undefined);
  expect(() => generateUuidV4()).toThrow("crypto_unavailable");
  vi.stubGlobal("crypto", {
    getRandomValues: () => {
      throw new Error("No");
    },
  });
  expect(() => generateUuidV4()).toThrow("crypto_unavailable");
});
it("provides exact fixed sentinels independently of crypto", () => {
  vi.stubGlobal("crypto", undefined);
  expect(uuidSentinel("nil")).toEqual({
    canonical: "00000000-0000-0000-0000-000000000000",
    hex: "0".repeat(32),
    urn: "urn:uuid:00000000-0000-0000-0000-000000000000",
  });
  expect(uuidSentinel("max")).toEqual({
    canonical: "ffffffff-ffff-ffff-ffff-ffffffffffff",
    hex: "f".repeat(32),
    urn: "urn:uuid:ffffffff-ffff-ffff-ffff-ffffffffffff",
  });
  expect(() => uuidSentinel("other" as never)).toThrow("Invalid UUID sentinel");
});
