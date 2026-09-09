import { describe, expect, it, vi } from "vitest";
import {
  alphabetMetrics,
  generateShortIds,
  NANO_ALPHABETS,
  ShortIdError,
} from "../../src/id/nanoid";

describe("NanoID alphabets", () => {
  it("keeps presets valid and counts duplicate Unicode scalars", () => {
    for (const alphabet of Object.values(NANO_ALPHABETS)) {
      const metrics = alphabetMetrics(alphabet);
      expect(metrics.unique).toBe(Array.from(alphabet).length);
      expect(metrics.duplicates).toEqual([]);
    }
    expect(alphabetMetrics("aab🙂🙂c")).toEqual({
      unique: 4,
      duplicates: ["a", "🙂"],
    });
  });

  it("generates requested output from presets and Unicode custom alphabets", async () => {
    const result = await generateShortIds("nanoid", {
      count: 4,
      length: 12,
      preset: "numbers",
    });
    expect(result).toEqual({
      kind: "nanoid",
      ids: result.ids,
      count: 4,
      length: 12,
      timestamp: null,
      monotonic: false,
    });
    expect(result.ids.every((value) => /^\d{12}$/u.test(value))).toBe(true);

    const unicode = await generateShortIds("nanoid", {
      count: 20,
      length: 21,
      preset: "custom",
      alphabet: "😀😎🦄",
    });
    expect(
      unicode.ids.every((value) =>
        [...value].every((char) => ["😀", "😎", "🦄"].includes(char)),
      ),
    ).toBe(true);
    // biome-ignore lint/style/noNonNullAssertion: test fixture or setup guarantees this value exists
    expect([...unicode.ids[0]!]).toHaveLength(21);
  });

  it("uses defaults and rejects count and length boundaries", async () => {
    const defaults = await generateShortIds("nanoid");
    expect(defaults).toMatchObject({ count: 5, length: 21 });
    for (const count of [0, 101, 1.5, NaN])
      await expect(generateShortIds("nanoid", { count })).rejects.toMatchObject(
        { code: "invalid-count" },
      );
    for (const length of [0, 129, 1.5, NaN])
      await expect(
        generateShortIds("nanoid", { length }),
      ).rejects.toMatchObject({ code: "invalid-length" });
  });

  it("rejects malformed, duplicate, and oversized alphabets", async () => {
    await expect(
      generateShortIds("nanoid", { preset: "custom" }),
    ).rejects.toMatchObject({ code: "invalid-alphabet" });
    const invalid = [
      "",
      "a",
      "aab",
      "a\nb",
      "a\u2028b",
      "a\uD800b",
      Array.from({ length: 257 }, (_, i) => String.fromCharCode(1000 + i)).join(
        "",
      ),
    ];
    for (const alphabet of invalid)
      await expect(
        generateShortIds("nanoid", { preset: "custom", alphabet }),
      ).rejects.toMatchObject({ code: "invalid-alphabet" });
    await expect(
      generateShortIds("nanoid", {
        preset: "unknown" as "custom",
        alphabet: "ab",
      }),
    ).rejects.toMatchObject({ code: "invalid-alphabet" });
  });

  it("preserves a real abort reason during a yielded batch", async () => {
    const controller = new AbortController();
    const reason = new Error("cancelled");
    const pending = generateShortIds(
      "nanoid",
      { count: 100, length: 12 },
      controller.signal,
    );
    setTimeout(() => controller.abort(reason), 0);
    await expect(pending).rejects.toBe(reason);
  });

  it("reports unsupported randomness and generation failures", async () => {
    vi.stubGlobal("crypto", undefined);
    try {
      await expect(generateShortIds("nanoid")).rejects.toMatchObject({
        code: "unsupported",
      });
    } finally {
      vi.unstubAllGlobals();
    }

    const random = vi
      .spyOn(crypto, "getRandomValues")
      .mockImplementationOnce((bytes) => bytes)
      .mockImplementation(() => {
        throw Error("random unavailable");
      });
    try {
      await expect(
        generateShortIds("nanoid", { count: 2 }),
      ).rejects.toMatchObject({ code: "generation-failed" });
    } finally {
      random.mockRestore();
    }
  });

  it("preserves a ShortIdError from the generation boundary", async () => {
    const random = vi
      .spyOn(crypto, "getRandomValues")
      .mockImplementationOnce((bytes) => bytes)
      .mockImplementation(() => {
        vi.stubGlobal("crypto", undefined);
        throw new ShortIdError("unsupported");
      });
    try {
      await expect(
        generateShortIds("nanoid", { count: 2 }),
      ).rejects.toMatchObject({ code: "unsupported" });
    } finally {
      random.mockRestore();
      vi.unstubAllGlobals();
    }
  });
});
