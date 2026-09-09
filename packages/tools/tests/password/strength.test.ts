import { describe, expect, it } from "vitest";
import { PasswordToolError } from "@workspace/tools/password/generator";
import {
  MAX_STRENGTH_LENGTH,
  checkPassword,
} from "@workspace/tools/password/strength";

describe("password strength", () => {
  it.each(["en-US", "zh-CN"] as const)(
    "returns the complete redacted result for %s",
    async (locale) => {
      const password =
        locale === "zh-CN"
          ? "密码安全ABC123!"
          : "correct horse battery staple!";
      const result = await checkPassword(password, locale);

      expect(result).toMatchObject({
        kind: "strength",
        model: "zxcvbn-ts 4.2.0",
        dictionaries: [
          "common 4.1.3",
          "English 4.1.1",
          "Simplified Chinese 4.1.1",
        ],
        locale,
        length: [...password].length,
        utf16Length: password.length,
        composition: expect.objectContaining({
          lower: expect.any(Number),
          upper: expect.any(Number),
          digit: expect.any(Number),
          other: expect.any(Number),
        }),
        score: expect.any(Number),
        suggestions: expect.any(Array),
        crackSeconds: {
          offline1e10: expect.any(Number),
          online100: expect.any(Number),
        },
      });
      expect(result.uniqueCount).toBe(new Set(password).size);
      expect(
        result.log10Guesses === null || typeof result.log10Guesses === "number",
      ).toBe(true);
      expect(
        result.estimatedGuessBits === null ||
          typeof result.estimatedGuessBits === "number",
      ).toBe(true);
      expect(result.numericOverflow).toBe(false);
      expect(JSON.stringify(result)).not.toContain(password);
    },
  );

  it("counts Unicode code points and composition without returning the input", async () => {
    const password = "A😀中9!A";
    const result = await checkPassword(password);

    expect(result.length).toBe([...password].length);
    expect(result.utf16Length).toBe(password.length);
    expect(result.uniqueCount).toBe(new Set(Array.from(password)).size);
    expect(result.composition).toEqual({
      lower: 0,
      upper: 2,
      digit: 1,
      other: 3,
    });
    expect(Object.keys(result)).not.toContain("password");
  });

  it("rejects empty, malformed, oversized, and unsupported locale input", async () => {
    await expect(checkPassword("")).rejects.toMatchObject({
      code: "invalid_input",
    });
    await expect(checkPassword("\uD800")).rejects.toMatchObject({
      code: "invalid_input",
    });
    await expect(
      checkPassword("x".repeat(MAX_STRENGTH_LENGTH + 1)),
    ).rejects.toMatchObject({ code: "too_large" });
    await expect(
      checkPassword("password", "fr-FR" as never),
    ).rejects.toMatchObject({ code: "invalid_options" });
  });

  it("keeps PasswordToolError as the shared error contract", async () => {
    await expect(checkPassword("")).rejects.toBeInstanceOf(PasswordToolError);
  });
});

it.each([400, MAX_STRENGTH_LENGTH])(
  "keeps %i non-dictionary characters serializable when the estimator saturates",
  async (length) => {
    const password = Array.from({ length }, (_, index) =>
      String.fromCodePoint(0x4000 + ((index * 137) % 2000)),
    ).join("");
    const result = await checkPassword(password);
    expect(result.length).toBe(length);
    expect(result.uniqueCount).toBe(length);
    expect(result.score).toBe(4);
    expect(result.numericOverflow).toBe(false);
    expect(result.log10Guesses).toBeCloseTo(Math.log10(Number.MAX_VALUE));
    expect(result.crackSeconds.offline1e10).toBe(Number.MAX_VALUE / 1e10);
    expect(result.crackSeconds.online100).toBe(Number.MAX_VALUE / 100);
    expect(JSON.parse(JSON.stringify(result))).toEqual(result);
    expect(JSON.stringify(result)).not.toContain(password);
  },
);
