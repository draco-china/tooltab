import { expect, it, vi } from "vitest";
import {
  generateShortIds,
  MAX_ULID_TIME,
  ulidCalendarText,
  ulidCalendarTime,
} from "../../src/id/ulid";

it.each([0, 1469918176385, MAX_ULID_TIME])(
  "generates valid monotonic ULIDs at timestamp %s",
  async (timestamp) => {
    const result = await generateShortIds("ulid", {
      count: 100,
      timestamp,
      monotonic: true,
    });
    expect(result.ids).toEqual([...result.ids].sort());
    expect(new Set(result.ids).size).toBe(100);
    expect(result).toMatchObject({
      kind: "ulid",
      count: 100,
      length: 26,
      timestamp,
      monotonic: true,
    });
    for (const id of result.ids) expect(id).toMatch(/^[0-9A-HJKMNP-TV-Z]{26}$/);
  },
);

it("keeps the zero timestamp prefix and independent batches random", async () => {
  const first = await generateShortIds("ulid", { timestamp: 0, count: 5 });
  const second = await generateShortIds("ulid", { timestamp: 0, count: 5 });
  expect(first.ids.every((id) => id.startsWith("0000000000"))).toBe(true);
  expect(first.ids).not.toEqual(second.ids);
});

it("uses platform defaults and reports unavailable crypto", async () => {
  const result = await generateShortIds("ulid");
  expect(result.count).toBe(1);
  vi.stubGlobal("crypto", undefined);
  try {
    await expect(
      generateShortIds("ulid", { timestamp: 1 }),
    ).rejects.toMatchObject({ code: "unsupported" });
  } finally {
    vi.unstubAllGlobals();
  }
});

it("validates count and timestamp before random or import work", async () => {
  for (const count of [0, 101, 1.1, NaN])
    await expect(generateShortIds("ulid", { count })).rejects.toMatchObject({
      code: "invalid-count",
    });
  for (const timestamp of [-1, 1.1, MAX_ULID_TIME + 1, Infinity])
    await expect(generateShortIds("ulid", { timestamp })).rejects.toMatchObject(
      { code: "invalid-time" },
    );
  const controller = new AbortController();
  controller.abort();
  await expect(
    generateShortIds("ulid", {}, controller.signal),
  ).rejects.toMatchObject({ name: "AbortError" });
});

it("maps unavailable randomness to the public generation error", async () => {
  const random = vi.spyOn(crypto, "getRandomValues").mockImplementation(() => {
    throw Error("unavailable");
  });
  try {
    // The preflight entropy probe intentionally preserves the platform error
    // before the dynamic import boundary is entered.
    await expect(generateShortIds("ulid", { timestamp: 1 })).rejects.toThrow(
      "unavailable",
    );
  } finally {
    random.mockRestore();
  }

  const duringGeneration = vi
    .spyOn(crypto, "getRandomValues")
    .mockImplementationOnce((bytes) => bytes)
    .mockImplementation(() => {
      throw Error("generation unavailable");
    });
  try {
    await expect(
      generateShortIds("ulid", { timestamp: 1 }),
    ).rejects.toMatchObject({ code: "generation-failed" });
  } finally {
    duringGeneration.mockRestore();
  }
});

it("cancels during a yielded batch", async () => {
  const controller = new AbortController();
  const pending = generateShortIds("ulid", { count: 100 }, controller.signal);
  setTimeout(() => controller.abort(), 0);
  await expect(pending).rejects.toMatchObject({ name: "AbortError" });
});

it("preserves unsupported when randomness disappears after preflight", async () => {
  const original = crypto.getRandomValues;
  Object.defineProperty(crypto, "getRandomValues", {
    configurable: true,
    value: (bytes: Uint8Array) => {
      Object.defineProperty(crypto, "getRandomValues", {
        configurable: true,
        value: undefined,
      });
      return bytes;
    },
  });
  try {
    await expect(
      generateShortIds("ulid", { timestamp: 1 }),
    ).rejects.toMatchObject({
      code: "unsupported",
    });
  } finally {
    Object.defineProperty(crypto, "getRandomValues", {
      configurable: true,
      value: original,
    });
  }
});

it("round-trips calendar timestamps and rejects rollover or out-of-range dates", () => {
  const value = "2026-09-07T01:02:03.004";
  expect(ulidCalendarText(ulidCalendarTime(value))).toBe(value);
  for (const timestamp of [0, MAX_ULID_TIME])
    expect(ulidCalendarTime(ulidCalendarText(timestamp))).toBe(timestamp);
  for (const date of [
    "2023-02-29T00:00",
    "2024-01-01T24:00",
    "1969-12-31T23:59:59",
    "2024-01-01T00:00\n",
    " 2024-01-01T00:00",
    "2024-01-01T00:00:00.0000",
  ])
    expect(() => ulidCalendarTime(date)).toThrow("invalid-time");
  expect(ulidCalendarText(-1)).toBe("");
  expect(ulidCalendarText(MAX_ULID_TIME + 1)).toBe("");
  expect(ulidCalendarText(1.5)).toBe("");
});
