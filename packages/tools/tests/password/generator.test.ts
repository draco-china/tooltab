import { describe, expect, it, vi } from "vitest";
import {
  CHARSETS,
  MAX_PASSWORD_OUTPUT,
  type PasswordToolError,
  charsetPool,
  generatePassword,
  generatorDefaults,
  secureIndex,
  wellFormed,
} from "@workspace/tools/password/generator";

const options = (overrides: Partial<typeof generatorDefaults> = {}) => ({
  ...generatorDefaults,
  ...overrides,
});

function expectCode(action: () => unknown, code: PasswordToolError["code"]) {
  expect(action).toThrowError(expect.objectContaining({ code }));
}

describe("password generator", () => {
  it("generates random passwords from selected character classes", async () => {
    const result = await generatePassword(
      options({ mode: "random", length: 64, charsets: ["upper", "digits"] }),
    );

    expect(result.kind).toBe("generated");
    expect(result.mode).toBe("random");
    expect(result.output).toMatch(/^[A-Z0-9]{64}$/u);
    expect(result.bytes).toBe(64);
    expect(result.samplingEntropyBits).toBeGreaterThan(0);
  });

  it("supports all random generation modes and their options", async () => {
    const words = await generatePassword(
      options({
        mode: "words",
        wordCount: 4,
        separator: "·",
        capitalize: true,
        includeNumber: true,
      }),
    );
    const separator = await generatePassword(
      options({
        mode: "separator",
        blockLength: 4,
        blockCount: 3,
        blockSeparator: ":",
        charsets: ["lower"],
        excludeSimilar: false,
      }),
    );
    const pin = await generatePassword(
      options({ mode: "pin", length: 8, allowLeadingZero: false }),
    );

    expect(words.output).toMatch(
      /^[A-Z][a-z]+·[A-Z][a-z]+·[A-Z][a-z]+·[A-Z][a-z]+·\d+$/u,
    );
    expect(separator.output).toMatch(/^[a-z]{4}(:[a-z]{4}){2}$/u);
    expect(pin.output).toMatch(/^[1-9]\d{7}$/u);
    expect(words.bytes).toBe(new TextEncoder().encode(words.output).length);
    expect(separator.bytes).toBe(separator.output.length);
    expect(pin.bytes).toBe(8);
  });

  it("uses the actual BIP39 English word list", async () => {
    const { default: wordList } = await import(
      "bip39/src/wordlists/english.json"
    );
    const result = await generatePassword(
      options({ mode: "words", wordCount: 8, separator: "-" }),
    );
    const parts = result.output.split("-");

    expect(parts).toHaveLength(8);
    expect(parts.every((word) => wordList.includes(word))).toBe(true);
    expect(wordList).toContain("abandon");
    expect(wordList).toHaveLength(2048);
  });

  it("handles charset defaults, duplicate classes, and similar-character filtering", () => {
    expect(charsetPool([], true)).toBe(
      [
        ...new Set(
          generatorDefaults.charsets.flatMap((key) => [...CHARSETS[key]]),
        ),
      ]
        .join("")
        .replace(/[Il1O0]/gu, ""),
    );
    expect(charsetPool(["digits", "digits"], false)).toBe(CHARSETS.digits);
    expect(charsetPool(["upper", "lower"], true)).not.toMatch(/[IlO]/u);
    expect(() => charsetPool(["missing" as never], true)).toThrowError(
      expect.objectContaining({ code: "invalid_options" }),
    );
  });

  it("rejects malformed text, options, and output limits", async () => {
    expectCode(() => wellFormed("\uD800"), "invalid_input");
    expectCode(() => secureIndex()(0), "invalid_options");
    expectCode(() => secureIndex()(0x1_0000_0000), "invalid_options");
    await expect(
      generatePassword(options({ mode: "random", length: 0 })),
    ).rejects.toMatchObject({ code: "invalid_options" });
    await expect(
      generatePassword(
        options({ mode: "random", length: MAX_PASSWORD_OUTPUT + 1 }),
      ),
    ).rejects.toMatchObject({ code: "too_large" });
    await expect(
      generatePassword(
        options({ mode: "separator", blockLength: 0, blockCount: 2 }),
      ),
    ).rejects.toMatchObject({ code: "invalid_options" });
  });

  it("reports unavailable secure randomness without a fallback", async () => {
    const original = globalThis.crypto;
    const getRandomValues = vi
      .spyOn(original, "getRandomValues")
      .mockImplementation(() => {
        throw new Error("unavailable");
      });
    try {
      await expect(
        generatePassword(options({ mode: "random", length: 1 })),
      ).rejects.toMatchObject({ code: "random_unavailable" });
    } finally {
      getRandomValues.mockRestore();
    }
  });
});

describe("password generator bounded branches", () => {
  async function withRandomValue<T>(value: number, action: () => Promise<T>) {
    const random = vi
      .spyOn(globalThis.crypto, "getRandomValues")
      .mockImplementation((array) => {
        new Uint32Array(
          array.buffer,
          array.byteOffset,
          array.byteLength / 4,
        ).fill(value);
        return array;
      });
    try {
      return await action();
    } finally {
      random.mockRestore();
    }
  }

  it("rejects the incomplete uint32 tail, then resamples an accepted value", () => {
    const exhausted = vi
      .spyOn(globalThis.crypto, "getRandomValues")
      .mockImplementation((array) => {
        new Uint32Array(
          array.buffer,
          array.byteOffset,
          array.byteLength / 4,
        ).fill(0xffffffff);
        return array;
      });
    try {
      expect(() => secureIndex()(10)).toThrowError(
        expect.objectContaining({ code: "random_unavailable" }),
      );
    } finally {
      exhausted.mockRestore();
    }

    const resampled = vi
      .spyOn(globalThis.crypto, "getRandomValues")
      .mockImplementation((array) => {
        const values = new Uint32Array(
          array.buffer,
          array.byteOffset,
          array.byteLength / 4,
        );
        values.fill(0xffffffff);
        values[127] = 0;
        return array;
      });
    try {
      expect(secureIndex()(10)).toBe(0);
      expect(resampled).toHaveBeenCalledOnce();
    } finally {
      resampled.mockRestore();
    }
  });

  it("covers empty and oversized separators plus aggregate block limits", async () => {
    await withRandomValue(0, async () => {
      const empty = await generatePassword(
        options({
          mode: "separator",
          blockLength: 2,
          blockCount: 2,
          blockSeparator: "",
        }),
      );
      expect(empty.output).toBe("AA-AA");
    });
    await expect(
      generatePassword(
        options({
          mode: "separator",
          blockLength: 1,
          blockCount: 2,
          blockSeparator: "x".repeat(16385),
        }),
      ),
    ).rejects.toMatchObject({ code: "too_large" });
    await expect(
      generatePassword(
        options({ mode: "separator", blockLength: 1024, blockCount: 1025 }),
      ),
    ).rejects.toMatchObject({ code: "too_large" });
  });

  it("covers invalid modes, pin validation, and both leading-zero branches", async () => {
    await expect(
      generatePassword(options({ mode: "other" as never })),
    ).rejects.toMatchObject({ code: "invalid_options" });
    await expect(
      generatePassword(
        options({ mode: "pin", allowLeadingZero: "yes" as never }),
      ),
    ).rejects.toMatchObject({ code: "invalid_options" });
    await withRandomValue(0, async () => {
      const leading = await generatePassword(
        options({ mode: "pin", length: 4, allowLeadingZero: true }),
      );
      const blocked = await generatePassword(
        options({ mode: "pin", length: 4, allowLeadingZero: false }),
      );
      expect(leading.output).toBe("0000");
      expect(blocked.output).toBe("1000");
      expect(leading.samplingEntropyBits).toBe(4 * Math.log2(10));
      expect(blocked.samplingEntropyBits).toBe(
        3 * Math.log2(10) + Math.log2(9),
      );
    });
  });

  it("flushes the random character chunk and validates word booleans", async () => {
    await withRandomValue(0, async () => {
      const result = await generatePassword(
        options({ mode: "random", length: 8192, charsets: ["upper"] }),
      );
      expect(result.output).toHaveLength(8192);
      expect(result.output).toMatch(/^A+$/u);
    });
    await expect(
      generatePassword(options({ mode: "words", capitalize: "yes" as never })),
    ).rejects.toMatchObject({ code: "invalid_options" });
    await expect(
      generatePassword(
        options({
          mode: "words",
          includeNumber: "yes" as never,
          capitalize: false,
        }),
      ),
    ).rejects.toMatchObject({ code: "invalid_options" });
  });

  it("enforces word separator and actual word-byte limits", async () => {
    await expect(
      generatePassword(
        options({ mode: "words", wordCount: 65, separator: "x".repeat(16384) }),
      ),
    ).rejects.toMatchObject({ code: "too_large" });
    await withRandomValue(0, async () => {
      await expect(
        generatePassword(options({ mode: "words", wordCount: 150000 })),
      ).rejects.toMatchObject({ code: "too_large" });
    });
  });

  it("checks final encoded bytes after appending the optional number", async () => {
    await withRandomValue(0, async () => {
      await expect(
        generatePassword(
          options({
            mode: "words",
            wordCount: 131072,
            separator: "-",
            includeNumber: true,
          }),
        ),
      ).rejects.toMatchObject({ code: "too_large" });
    });
  });
});

it("rejects an incomplete dependency wordlist and recovers when it is restored", async () => {
  const { default: words } = await import("bip39/src/wordlists/english.json");
  const last = words.pop();
  try {
    await expect(
      generatePassword(options({ mode: "words", wordCount: 3 })),
    ).rejects.toMatchObject({ code: "unsupported" });
  } finally {
    if (last !== undefined) words.push(last);
  }
  expect(words).toHaveLength(2048);
  const result = await generatePassword(
    options({
      mode: "words",
      wordCount: 3,
      separator: "-",
      capitalize: false,
      includeNumber: false,
    }),
  );
  const generated = result.output.split("-");
  expect(generated).toHaveLength(3);
  for (const word of generated) expect(words).toContain(word);
});
