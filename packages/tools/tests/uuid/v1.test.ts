import { afterEach, describe, expect, it, vi } from "vitest";
import {
  createUuidV1Bytes,
  formatMacAddress,
  generateUuidV1,
  generateUuidV1Batch,
  isValidUuidV1ClockSequence,
  normalizeMacAddress,
  normalizeUuidV1ClockSequence,
  normalizeUuidV1Count,
  parseMacAddress,
  randomMacAddress,
  randomUuidV1ClockSequence,
  UUID_V1_MAX_CLOCK_SEQUENCE,
  UUID_V1_MAX_COUNT,
} from "../../src/uuid/v1";

afterEach(() => vi.restoreAllMocks());

describe("UUID v1", () => {
  it("normalizes count and clock sequence inputs", () => {
    expect(normalizeUuidV1Count(undefined)).toBe(1);
    expect(normalizeUuidV1Count(null)).toBe(1);
    expect(normalizeUuidV1Count(Number.NaN)).toBe(1);
    expect(normalizeUuidV1Count(0)).toBe(1);
    expect(normalizeUuidV1Count(3.9)).toBe(3);
    expect(normalizeUuidV1Count(UUID_V1_MAX_COUNT + 1)).toBe(UUID_V1_MAX_COUNT);
    expect(normalizeUuidV1ClockSequence(-1)).toBe(0);
    expect(normalizeUuidV1ClockSequence(null)).toBe(0);
    expect(normalizeUuidV1ClockSequence(Number.POSITIVE_INFINITY)).toBe(0);
    expect(normalizeUuidV1ClockSequence(42.9)).toBe(42);
    expect(normalizeUuidV1ClockSequence(UUID_V1_MAX_CLOCK_SEQUENCE + 1)).toBe(
      UUID_V1_MAX_CLOCK_SEQUENCE,
    );
    expect(isValidUuidV1ClockSequence(42)).toBe(true);
    expect(isValidUuidV1ClockSequence(42.5)).toBe(false);
    expect(isValidUuidV1ClockSequence(-1)).toBe(false);
    expect(isValidUuidV1ClockSequence(UUID_V1_MAX_CLOCK_SEQUENCE + 1)).toBe(
      false,
    );
  });

  it("parses and formats MAC address forms", () => {
    expect(Array.from(parseMacAddress("00:11-22.33 44:55") ?? [])).toEqual([
      0, 17, 34, 51, 68, 85,
    ]);
    expect(normalizeMacAddress("001122334455")).toBe("00:11:22:33:44:55");
    expect(normalizeMacAddress("00:11:22:33:44:5Z")).toBeNull();
    expect(parseMacAddress("bad")).toBeNull();
    expect(() => formatMacAddress(new Uint8Array(5))).toThrow(
      "UUID v1 node must contain 6 bytes",
    );
  });

  it("generates locally administered random node settings", () => {
    vi.spyOn(globalThis.crypto, "getRandomValues").mockImplementation(
      (array) => {
        const bytes = array as Uint8Array;
        for (let index = 0; index < bytes.length; index += 1)
          bytes[index] = index;
        return array;
      },
    );
    expect(randomMacAddress()).toBe("02:01:02:03:04:05");
    expect(randomUuidV1ClockSequence()).toBe(1);
  });

  it("generates deterministic single and batch UUIDs", () => {
    const node = parseMacAddress("00:11:22:33:44:55");
    if (!node) throw new Error("Expected valid node");
    const options = { msecs: 0, node, clockSequence: 0x1234 };
    expect(generateUuidV1(options)).toBe(
      "13814000-1dd2-11b2-9234-001122334455",
    );
    expect(generateUuidV1Batch(2, options)).toEqual([
      "13814000-1dd2-11b2-9234-001122334455",
      "13814001-1dd2-11b2-9234-001122334455",
    ]);
    expect(Array.from(createUuidV1Bytes(options))).toHaveLength(16);
    expect(generateUuidV1({ ...options, nsecs: 42 })).toBe(
      "1381402a-1dd2-11b2-9234-001122334455",
    );
  });

  it("rejects invalid timestamps, node, sequence, ticks, and batch bounds", () => {
    const node = new Uint8Array(6);
    const options = { msecs: 0, node, clockSequence: 0 };
    expect(() => generateUuidV1({ ...options, msecs: Number.NaN })).toThrow(
      "timestamp must be finite",
    );
    expect(() =>
      generateUuidV1({ ...options, node: new Uint8Array(5) }),
    ).toThrow("node must contain 6 bytes");
    expect(() => generateUuidV1({ ...options, clockSequence: -1 })).toThrow(
      "clock sequence must be between",
    );
    expect(() => generateUuidV1({ ...options, nsecs: -1 })).toThrow(
      "nsecs must be between",
    );
    expect(() => generateUuidV1({ ...options, nsecs: 10_000 })).toThrow(
      "nsecs must be between",
    );
    expect(() => generateUuidV1({ ...options, nsecs: 1.5 })).toThrow(
      "nsecs must be between",
    );
    expect(() => generateUuidV1Batch(2, { ...options, nsecs: 9_999 })).toThrow(
      "batch exceeds one millisecond",
    );
  });
});
