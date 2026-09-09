import { describe, expect, it, vi } from "vitest";
import {
  CUID2_DEFAULT_LENGTH,
  CUID2_MAX_COUNT,
  CUID2_MAX_LENGTH,
  CUID2_MIN_LENGTH,
  generateCuid2Ids,
  generateShortIds,
  isValidCuid2,
  normalizeCuid2Count,
  normalizeCuid2Length,
  ShortIdError,
} from "../../src/id/cuid2";

describe("CUID2 generation", () => {
  it("normalizes finite and non-finite bounds", () => {
    expect(normalizeCuid2Count(999.9)).toBe(CUID2_MAX_COUNT);
    expect(normalizeCuid2Count(0)).toBe(1);
    expect(normalizeCuid2Count(-4)).toBe(1);
    expect(normalizeCuid2Count(Number.NaN)).toBe(1);
    expect(normalizeCuid2Length(999)).toBe(CUID2_MAX_LENGTH);
    expect(normalizeCuid2Length(1)).toBe(CUID2_MIN_LENGTH);
    expect(normalizeCuid2Length(-4)).toBe(CUID2_MIN_LENGTH);
    expect(normalizeCuid2Length(Number.NaN)).toBe(CUID2_DEFAULT_LENGTH);
  });

  it("generates valid unique identifiers through both APIs", async () => {
    const result = await generateShortIds("cuid2", { count: 5, length: 16 });
    expect(result).toMatchObject({ kind: "cuid2", count: 5, length: 16 });
    expect(new Set(result.ids).size).toBe(5);
    expect(
      result.ids.every((value) => value.length === 16 && isValidCuid2(value)),
    ).toBe(true);
    const ids = generateCuid2Ids(4, 12);
    expect(ids).toHaveLength(4);
    expect(
      ids.every((value) => value.length === 12 && isValidCuid2(value)),
    ).toBe(true);
  });

  it("uses defaults and validates strict short-id options", async () => {
    const result = await generateShortIds("cuid2");
    expect(result).toMatchObject({
      count: 1,
      length: CUID2_DEFAULT_LENGTH,
    });
    for (const count of [0, CUID2_MAX_COUNT + 1, 1.5, Number.NaN])
      await expect(generateShortIds("cuid2", { count })).rejects.toMatchObject({
        code: "invalid-count",
      });
    for (const length of [CUID2_MIN_LENGTH - 1, CUID2_MAX_LENGTH + 1, 1.5, NaN])
      await expect(generateShortIds("cuid2", { length })).rejects.toMatchObject(
        {
          code: "invalid-length",
        },
      );
  });

  it("preserves real abort reasons", async () => {
    const controller = new AbortController();
    const reason = new Error("cancelled");
    controller.abort(reason);
    await expect(
      generateShortIds("cuid2", { count: 10 }, controller.signal),
    ).rejects.toBe(reason);
  });

  it("reports unsupported randomness without changing its error code", async () => {
    vi.stubGlobal("crypto", undefined);
    try {
      await expect(generateShortIds("cuid2")).rejects.toMatchObject({
        code: "unsupported",
      });
      expect(() => generateCuid2Ids(1, 8)).toThrow(ShortIdError);
    } finally {
      vi.unstubAllGlobals();
    }
  });

  it("maps a random failure during generation to generation-failed", async () => {
    const random = vi
      .spyOn(crypto, "getRandomValues")
      .mockImplementationOnce((bytes) => bytes)
      .mockImplementation(() => {
        throw Error("random unavailable");
      });
    try {
      await expect(
        generateShortIds("cuid2", { count: 2, length: 8 }),
      ).rejects.toMatchObject({ code: "generation-failed" });
    } finally {
      random.mockRestore();
    }
  });

  it("handles an empty platform random result", () => {
    const random = vi
      .spyOn(crypto, "getRandomValues")
      .mockImplementationOnce(() => new Uint32Array(0));
    try {
      const ids = generateCuid2Ids(1, 8);
      expect(ids).toHaveLength(1);
      expect(isValidCuid2(ids[0] ?? "")).toBe(true);
    } finally {
      random.mockRestore();
    }
  });

  it("validates generated and malformed values", () => {
    const value = generateCuid2Ids(1, CUID2_MIN_LENGTH)[0] ?? "";
    expect(isValidCuid2(value)).toBe(true);
    expect(isValidCuid2("")).toBe(false);
    expect(isValidCuid2("not a cuid")).toBe(false);
  });
});
