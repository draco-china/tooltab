import { afterEach, expect, it, vi } from "vitest";
import {
  convertTimeUuid,
  generateTimeUuid,
  GREGORIAN_OFFSET,
  MAX_TIME_MS,
  MAX_TIME_TICKS,
  MIN_TIME_MS,
  normalizeNode,
  randomTimeNode,
  randomTimeSequence,
  timeUuidFromFields,
  UuidTimeError,
} from "../../src/uuid/time";

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

it("matches RFC 9562 v1 and v6 vectors, and converts each direction", () => {
  const ticks = 1645557742000n * 10000n + GREGORIAN_OFFSET;
  const v1 = "c232ab00-9414-11ec-b3c8-9f6bdeced846";
  const v6 = "1ec9414c-232a-6b00-b3c8-9f6bdeced846";
  expect(timeUuidFromFields(1, ticks, "9f6bdeced846", 13256)).toBe(v1);
  expect(timeUuidFromFields(6, ticks, "9f6bdeced846", 13256)).toBe(v6);
  expect(convertTimeUuid(v1, 1)).toEqual({ v1, v6 });
  expect(convertTimeUuid(`urn:uuid:{${v6.toUpperCase()}}`, 6)).toEqual({
    v1,
    v6,
  });
  for (const boundary of [0n, 1n, MAX_TIME_TICKS])
    for (const sequence of [0, 16383])
      expect(
        convertTimeUuid(
          timeUuidFromFields(1, boundary, "ffffffffffff", sequence),
          1,
        ).v6,
      ).toBe(timeUuidFromFields(6, boundary, "ffffffffffff", sequence));
});

it("normalizes valid node forms and rejects invalid field inputs", () => {
  for (const node of [
    "0123456789AB",
    "01:23:45:67:89:ab",
    "01-23-45-67-89-ab",
    "0123.4567.89ab",
  ])
    expect(normalizeNode(node)).toBe("0123456789ab");
  for (const node of [
    " 0123456789ab",
    "0123456789ab\n",
    "01:23-45:67:89:ab",
    "abc",
    "0123456789ab00",
  ])
    expect(() => normalizeNode(node)).toThrow("invalid_node");
  expect(() => timeUuidFromFields(4 as never, 0n, "0123456789ab", 0)).toThrow(
    "invalid_version",
  );
  expect(() => timeUuidFromFields(1, -1n, "0123456789ab", 0)).toThrow(
    "invalid_timestamp",
  );
  expect(() =>
    timeUuidFromFields(1, MAX_TIME_TICKS + 1n, "0123456789ab", 0),
  ).toThrow("invalid_timestamp");
  for (const sequence of [-1, 16384, 0.1])
    expect(() => timeUuidFromFields(1, 0n, "0123456789ab", sequence)).toThrow(
      "invalid_sequence",
    );
});

it("creates secure node and sequence values and closes when crypto is unavailable", () => {
  vi.stubGlobal("crypto", {
    getRandomValues: (bytes: Uint8Array) => bytes.fill(0),
  });
  expect(randomTimeNode()).toBe("030000000000");
  expect(randomTimeSequence()).toBe(0);
  vi.stubGlobal("crypto", {
    getRandomValues: (bytes: Uint8Array) => bytes.fill(255),
  });
  expect(randomTimeSequence()).toBe(16383);
  vi.stubGlobal("crypto", {
    getRandomValues: () => {
      throw new Error("no crypto");
    },
  });
  expect(randomTimeNode).toThrow(UuidTimeError);
  vi.stubGlobal("crypto", undefined);
  expect(randomTimeSequence).toThrow("crypto_unavailable");
});

it("generates exact batches and validates every time option", () => {
  const options = {
    version: 6 as const,
    count: 100,
    timestamp: 0,
    node: "0123456789ab",
    sequence: 0,
  };
  const result = generateTimeUuid(options);
  expect(new Set(result.values).size).toBe(100);
  expect(result.values).toEqual([...result.values].sort());
  expect(generateTimeUuid(options)).toEqual(result);
  expect(
    generateTimeUuid({
      version: 1,
      count: 2,
      timestamp: 0,
      tick: 9998,
      node: "0123456789ab",
      sequence: 0,
    }).values.map((value) => value.slice(0, 8)),
  ).toEqual(["1381670e", "1381670f"]);
  for (const count of [0, 101, 1.5])
    expect(() => generateTimeUuid({ version: 1, count })).toThrow(
      "invalid_count",
    );
  for (const timestamp of [MIN_TIME_MS - 1, MAX_TIME_MS + 1, 0.5])
    expect(() => generateTimeUuid({ version: 1, timestamp })).toThrow(
      "invalid_timestamp",
    );
  for (const tick of [-1, 10000, 0.5])
    expect(() => generateTimeUuid({ version: 1, tick })).toThrow(
      "invalid_tick",
    );
  expect(() => generateTimeUuid({ ...options, tick: 9950 })).toThrow(
    "invalid_tick",
  );
  expect(() =>
    generateTimeUuid({
      ...options,
      timestamp: MAX_TIME_MS,
      tick: 6976,
      count: 1,
    }),
  ).toThrow("invalid_timestamp");
  expect(() => generateTimeUuid({ ...options, node: "bad" })).toThrow(
    "invalid_node",
  );
  expect(() => generateTimeUuid({ ...options, sequence: 16384 })).toThrow(
    "invalid_sequence",
  );
});

it("uses random v1 fields only when not supplied and distinguishes conversion errors", () => {
  const getRandomValues = vi.fn((bytes: Uint8Array) => bytes.fill(0));
  vi.stubGlobal("crypto", { getRandomValues });
  const random = generateTimeUuid({ version: 1, count: 2, timestamp: 0 });
  expect(random.values).toHaveLength(2);
  expect(getRandomValues).toHaveBeenCalledTimes(2);
  getRandomValues.mockClear();
  generateTimeUuid({
    version: 1,
    count: 2,
    timestamp: 0,
    node: "0123456789ab",
    sequence: 0,
  });
  expect(getRandomValues).not.toHaveBeenCalled();
  getRandomValues.mockClear();
  generateTimeUuid({ version: 6, timestamp: 0 });
  expect(getRandomValues).toHaveBeenCalledTimes(2);
  expect(() => convertTimeUuid("not-a-uuid", 1)).toThrow("invalid_uuid");
  expect(() =>
    convertTimeUuid("00000000-0000-4000-8000-000000000000", 1),
  ).toThrow("invalid_version");
  expect(() =>
    convertTimeUuid("00000000-0000-1000-c000-000000000000", 1),
  ).toThrow("invalid_variant");
  expect(() =>
    convertTimeUuid("00000000-0000-1000-8000-000000000000", 4 as never),
  ).toThrow("invalid_version");
});
