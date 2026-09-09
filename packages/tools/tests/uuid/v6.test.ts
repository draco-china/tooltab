import { describe, expect, it, vi } from "vitest";
import {
  bytesToUuid,
  createRandomUuidClockSequence,
  createRandomUuidNode,
  createUuidV6Bytes,
  generateUuidV6,
  generateUuidV6Batch,
  isValidUuidClockSequence,
  isValidUuidV6UnixMilliseconds,
  normalizeUuidV6Count,
  parseUuidNode,
  formatUuidNode,
  unixMillisecondsToUuidTimestamp,
  UUID_CLOCK_SEQUENCE_MAX,
  UUID_V6_MAX_COUNT,
  UUID_V6_MAX_UNIX_MILLISECONDS,
  UUID_V6_MIN_UNIX_MILLISECONDS,
} from "../../src/uuid/v6";

const UUID_V6_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-6[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/u;

describe("UUID v6 generation", () => {
  it("normalizes count and creates sortable deterministic batches", () => {
    expect(normalizeUuidV6Count(undefined)).toBe(1);
    expect(normalizeUuidV6Count(null)).toBe(1);
    expect(normalizeUuidV6Count(Number.NaN)).toBe(1);
    expect(normalizeUuidV6Count(0)).toBe(1);
    expect(normalizeUuidV6Count(UUID_V6_MAX_COUNT + 1)).toBe(UUID_V6_MAX_COUNT);
    const values = generateUuidV6Batch({
      count: 3,
      unixMilliseconds: Date.UTC(2026, 0, 1),
      nodeMode: "custom",
      customNode: parseUuidNode("02:00:00:00:00:01"),
      clockSequenceMode: "custom",
      customClockSequence: 1,
    });
    expect(values).toHaveLength(3);
    expect(values.every((value) => UUID_V6_PATTERN.test(value))).toBe(true);
    expect([...values].sort()).toEqual(values);
    expect(values.every((value) => value.endsWith("-020000000001"))).toBe(true);
    expect(
      generateUuidV6({
        unixMilliseconds: Date.UTC(2026, 0, 1),
        clockSequence: 1,
        node: new Uint8Array([2, 0, 0, 0, 0, 1]),
      }),
    ).toMatch(UUID_V6_PATTERN);
  });

  it("creates privacy-preserving random node and bounded sequence values", () => {
    const spy = vi
      .spyOn(globalThis.crypto, "getRandomValues")
      .mockImplementation((array) => {
        (array as Uint8Array).fill(0xff);
        return array;
      });
    const node = createRandomUuidNode();
    expect((node[0] ?? 0) & 0x01).toBe(0);
    expect((node[0] ?? 0) & 0x02).toBe(0x02);
    expect(createRandomUuidClockSequence()).toBe(UUID_CLOCK_SEQUENCE_MAX);
    spy.mockRestore();
  });

  it("parses, formats, validates, and converts node and timestamp boundaries", () => {
    expect(Array.from(parseUuidNode("001122334455"))).toEqual([
      0, 17, 34, 51, 68, 85,
    ]);
    expect(Array.from(parseUuidNode("0011.2233.4455"))).toEqual([
      0, 17, 34, 51, 68, 85,
    ]);
    expect(formatUuidNode(new Uint8Array([0, 17, 34, 51, 68, 85]))).toBe(
      "00:11:22:33:44:55",
    );
    expect(() => parseUuidNode("0011:2233:4455")).toThrow(
      "Invalid UUID node ID",
    );
    expect(() => formatUuidNode(new Uint8Array(5))).toThrow("requires 6 bytes");
    expect(isValidUuidV6UnixMilliseconds(UUID_V6_MIN_UNIX_MILLISECONDS)).toBe(
      true,
    );
    expect(isValidUuidV6UnixMilliseconds(UUID_V6_MAX_UNIX_MILLISECONDS)).toBe(
      true,
    );
    expect(isValidUuidV6UnixMilliseconds(Number.NaN)).toBe(false);
    expect(
      isValidUuidV6UnixMilliseconds(UUID_V6_MIN_UNIX_MILLISECONDS - 1),
    ).toBe(false);
    expect(
      isValidUuidV6UnixMilliseconds(UUID_V6_MAX_UNIX_MILLISECONDS + 1),
    ).toBe(false);
    expect(isValidUuidClockSequence(0)).toBe(true);
    expect(isValidUuidClockSequence(-1)).toBe(false);
    expect(isValidUuidClockSequence(UUID_CLOCK_SEQUENCE_MAX + 1)).toBe(false);
    expect(isValidUuidClockSequence(1.5)).toBe(false);
    expect(unixMillisecondsToUuidTimestamp(0)).toBe(122192928000000000n);
    expect(() =>
      unixMillisecondsToUuidTimestamp(Number.POSITIVE_INFINITY),
    ).toThrow("timestamp out of range");
    expect(bytesToUuid(new Uint8Array(16))).toBe(
      "00000000-0000-0000-0000-000000000000",
    );
    expect(() => bytesToUuid(new Uint8Array(15))).toThrow("requires 16 bytes");
  });

  it("rejects invalid v6 parts and supports random batch modes", () => {
    const node = new Uint8Array(6);
    const options = { unixMilliseconds: 0, clockSequence: 0, node };
    expect(() =>
      createUuidV6Bytes({ ...options, subMillisecondTick: -1 }),
    ).toThrow("non-negative");
    expect(() => createUuidV6Bytes({ ...options, clockSequence: -1 })).toThrow(
      "clock sequence out of range",
    );
    expect(() =>
      createUuidV6Bytes({ ...options, node: new Uint8Array(5) }),
    ).toThrow("requires 6 bytes");
    expect(() =>
      createUuidV6Bytes({
        ...options,
        unixMilliseconds: UUID_V6_MIN_UNIX_MILLISECONDS - 1,
      }),
    ).toThrow("timestamp out of range");
    expect(() =>
      createUuidV6Bytes({
        ...options,
        unixMilliseconds: UUID_V6_MAX_UNIX_MILLISECONDS,
        subMillisecondTick: 10_000,
      }),
    ).toThrow("timestamp out of range");
    vi.spyOn(globalThis.crypto, "getRandomValues").mockImplementation(
      (array) => {
        (array as Uint8Array).fill(0);
        return array;
      },
    );
    const values = generateUuidV6Batch({
      count: 2,
      unixMilliseconds: 0,
      nodeMode: "random",
      clockSequenceMode: "random",
    });
    expect(values).toHaveLength(2);
    expect(
      generateUuidV6Batch({
        count: 1,
        unixMilliseconds: 0,
        nodeMode: "custom",
        clockSequenceMode: "custom",
      }),
    ).toHaveLength(1);
  });
});
