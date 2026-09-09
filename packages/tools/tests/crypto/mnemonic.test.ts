import {
  entropyToMnemonic as externalEntropyToMnemonic,
  mnemonicToEntropy as externalMnemonicToEntropy,
  wordlists,
} from "bip39";
import { describe, expect, it, vi } from "vitest";
import {
  LANGUAGES,
  type MnemonicError,
  fromEntropy,
  generate,
  inspect,
  list,
  normalize,
  type Language,
} from "../../src/crypto/mnemonic";

const externalWordlists = {
  english: wordlists.english,
  chinese_simplified: wordlists.chinese_simplified,
  chinese_traditional: wordlists.chinese_traditional,
  czech: wordlists.czech,
  french: wordlists.french,
  italian: wordlists.italian,
  japanese: wordlists.japanese,
  korean: wordlists.korean,
  portuguese: wordlists.portuguese,
  spanish: wordlists.spanish,
} satisfies Record<Language, string[]>;

const zeroEntropy = "00000000000000000000000000000000";
const zeroMnemonic =
  "abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon about";

describe("BIP39 mnemonic", () => {
  it("matches the published English zero-entropy vector and independent implementation", () => {
    const result = fromEntropy(` 0x${zeroEntropy.toUpperCase()} `);

    expect(result).toEqual({
      mnemonic: zeroMnemonic,
      entropy: zeroEntropy,
      wordCount: 12,
      strength: 128,
      valid: true,
    });
    expect(externalEntropyToMnemonic(zeroEntropy, wordlists.english)).toBe(
      zeroMnemonic,
    );
    expect(externalMnemonicToEntropy(result.mnemonic, wordlists.english)).toBe(
      zeroEntropy,
    );
  });

  it("converts every supported entropy strength with its selected wordlist", () => {
    for (const length of [32, 40, 48, 56, 64]) {
      const entropy = "ab".repeat(length / 2);
      const result = fromEntropy(entropy, "spanish");

      expect(result).toMatchObject({
        entropy,
        wordCount: (length * 3) / 8,
        strength: length * 4,
        valid: true,
      });
      expect(result.mnemonic).toBe(
        externalEntropyToMnemonic(entropy, wordlists.spanish),
      );
      expect(
        externalMnemonicToEntropy(result.mnemonic, wordlists.spanish),
      ).toBe(entropy);
    }
  });

  it("generates valid random mnemonics for every language and supported strength", () => {
    const defaults = generate();
    expect(defaults.wordCount).toBe(12);
    expect(inspect(defaults.mnemonic)).toEqual(defaults);
    for (const language of LANGUAGES)
      for (const wordCount of [12, 15, 18, 21, 24]) {
        const result = generate(wordCount, language);

        expect(result).toMatchObject({
          wordCount,
          strength: (wordCount * 32) / 3,
          valid: true,
        });
        expect(result.entropy).toMatch(
          new RegExp(`^[0-9a-f]{${(wordCount * 8) / 3}}$`),
        );
        expect(result.mnemonic).toBe(
          externalEntropyToMnemonic(
            result.entropy,
            externalWordlists[language],
          ),
        );
        expect(
          externalMnemonicToEntropy(
            result.mnemonic,
            externalWordlists[language],
          ),
        ).toBe(result.entropy);
        expect(inspect(result.mnemonic, language)).toEqual({
          ...result,
          mnemonic: normalize(result.mnemonic),
        });
      }
  });

  it("normalizes Unicode and whitespace before inspection", () => {
    expect(normalize(" \tcaf\u00e9\n  test\u3000 ")).toBe("cafe\u0301 test");
    expect(inspect(`\n ${zeroMnemonic.replaceAll(" ", "\t")} \n`)).toEqual({
      mnemonic: zeroMnemonic,
      entropy: zeroEntropy,
      wordCount: 12,
      strength: 128,
      valid: true,
    });
  });

  it("enforces text, entropy, language, and word-count boundaries with domain errors", () => {
    expect(normalize(" ".repeat(4096))).toBe("");
    for (const input of ["\ud800", "\udc00", "x".repeat(4097)])
      expect(() => normalize(input)).toThrow(
        expect.objectContaining<Pick<MnemonicError, "code">>({
          code: "invalid_mnemonic",
        }),
      );

    for (const entropy of [
      "",
      "0".repeat(31),
      "0".repeat(33),
      "g".repeat(32),
      "0".repeat(102),
    ])
      expect(() => fromEntropy(entropy)).toThrow(
        expect.objectContaining<Pick<MnemonicError, "code">>({
          code: "invalid_entropy",
        }),
      );

    expect(() => list("german" as never)).toThrow(
      expect.objectContaining<Pick<MnemonicError, "code">>({
        code: "invalid_options",
      }),
    );
    expect(() => fromEntropy(zeroEntropy, "german" as never)).toThrow(
      expect.objectContaining<Pick<MnemonicError, "code">>({
        code: "invalid_options",
      }),
    );
    for (const wordCount of [0, 11, 13, 25])
      expect(() => generate(wordCount)).toThrow(
        expect.objectContaining<Pick<MnemonicError, "code">>({
          code: "invalid_options",
        }),
      );
  });

  it("reports malformed normalized mnemonics without manufacturing entropy", () => {
    expect(inspect("")).toEqual({
      mnemonic: "",
      entropy: "",
      wordCount: 0,
      strength: 0,
      valid: false,
    });
    expect(inspect(Array(12).fill("abandon").join(" "))).toMatchObject({
      wordCount: 12,
      entropy: "",
      strength: 0,
      valid: false,
    });
    expect(inspect(`${zeroMnemonic} extra`)).toEqual({
      mnemonic: `${zeroMnemonic} extra`,
      entropy: "",
      wordCount: 13,
      strength: 0,
      valid: false,
    });
  });

  it("maps unavailable entropy to the generation domain error", () => {
    const randomValues = vi
      .spyOn(crypto, "getRandomValues")
      .mockImplementation(() => {
        throw Error("entropy unavailable");
      });
    expect(() => generate()).toThrow(
      expect.objectContaining<Pick<MnemonicError, "code">>({
        code: "random_failed",
      }),
    );
    randomValues.mockRestore();
  });
});
