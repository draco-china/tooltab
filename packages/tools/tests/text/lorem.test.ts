import { describe, expect, it, vi } from "vitest";
import { generateLorem } from "../../src/text/lorem";

describe("Lorem ipsum generation", () => {
  it("generates deterministic text for a fixed seed", async () => {
    const first = await generateLorem({
      mode: "words",
      count: 4,
      locale: "en",
      seed: 7,
    });
    const second = await generateLorem({
      mode: "words",
      count: 4,
      locale: "en",
      seed: 7,
    });
    expect(first.output).toBe(second.output);
    expect(first.kind).toBe("lorem");
    expect((await generateLorem()).kind).toBe("lorem");
  });

  it("loads every supported locale and validates random options", async () => {
    const { LOREM_LOCALES } = await import("../../src/text/lorem");
    for (const locale of LOREM_LOCALES)
      expect(
        (await generateLorem({ locale, mode: "sentences", count: 1, seed: 1 }))
          .output,
      ).not.toBe("");
    expect(
      (
        await generateLorem({
          mode: "paragraphs",
          count: 2,
          locale: "en",
          seed: 1,
        })
      ).output,
    ).toContain("\n\n");
    for (const options of [
      { count: 0 },
      { count: 101 },
      { mode: "bad" as never },
      { locale: "bad" as never },
      { seed: -1 },
      { seed: Number.NaN },
      { seed: 0x1_0000_0000 },
    ])
      await expect(generateLorem(options)).rejects.toThrow("invalid_options");
  });

  it("rejects missing runtime randomness when no seed is supplied", async () => {
    const original = globalThis.crypto;
    Object.defineProperty(globalThis, "crypto", {
      configurable: true,
      value: undefined,
    });
    try {
      await expect(generateLorem({ mode: "words", count: 1 })).rejects.toThrow(
        "unsupported",
      );
    } finally {
      Object.defineProperty(globalThis, "crypto", {
        configurable: true,
        value: original,
      });
    }
  });

  it("uses runtime randomness when no seed is supplied", async () => {
    const random = vi
      .spyOn(globalThis.crypto, "getRandomValues")
      .mockImplementation((array) => {
        (array as Uint32Array)[0] = 123;
        return array;
      });
    const result = await generateLorem({ mode: "words", count: 1 });
    expect(result.seed).toBe(123);
    random.mockRestore();
  });
});
