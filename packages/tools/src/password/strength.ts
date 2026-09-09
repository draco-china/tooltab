import { PasswordToolError, wellFormed } from "./generator";
export const MAX_STRENGTH_LENGTH = 1024;
export async function checkPassword(
  password: string,
  locale: "en-US" | "zh-CN" = "en-US",
) {
  wellFormed(password);
  if (!password) throw new PasswordToolError("invalid_input");
  if (password.length > MAX_STRENGTH_LENGTH)
    throw new PasswordToolError("too_large");
  if (locale !== "en-US" && locale !== "zh-CN")
    throw new PasswordToolError("invalid_options");
  const [{ ZxcvbnFactory }, common, en, zh] = await Promise.all([
    import("@zxcvbn-ts/core"),
    import("@zxcvbn-ts/language-common"),
    import("@zxcvbn-ts/language-en"),
    import("@zxcvbn-ts/language-zh"),
  ]);
  const estimator = new ZxcvbnFactory({
    maxLength: MAX_STRENGTH_LENGTH,
    dictionary: { ...common.dictionary, ...en.dictionary, ...zh.dictionary },
    graphs: common.adjacencyGraphs,
    translations: locale === "zh-CN" ? zh.translations : en.translations,
  });
  const analysis = estimator.check(password);
  // Do not return the estimator's password, matched substrings or dictionary sequence.
  const composition = { lower: 0, upper: 0, digit: 0, other: 0 };
  let length = 0;
  const unique = new Set<string>();
  for (const char of password) {
    length++;
    unique.add(char);
    if (/[a-z]/.test(char)) composition.lower++;
    else if (/[A-Z]/.test(char)) composition.upper++;
    else if (/[0-9]/.test(char)) composition.digit++;
    else composition.other++;
  }
  // zxcvbn-ts 4.2.0 always considers a full-password brute-force candidate
  // capped at Number.MAX_VALUE, then selects the minimum positive guess count.
  // Its log and the divisions below therefore remain finite.
  return {
    kind: "strength" as const,
    model: "zxcvbn-ts 4.2.0",
    dictionaries: ["common 4.1.3", "English 4.1.1", "Simplified Chinese 4.1.1"],
    locale,
    length,
    utf16Length: password.length,
    uniqueCount: unique.size,
    composition,
    score: analysis.score,
    log10Guesses: analysis.guessesLog10,
    estimatedGuessBits: analysis.guessesLog10 / Math.log10(2),
    numericOverflow: false,
    warning: analysis.feedback.warning,
    suggestions: analysis.feedback.suggestions,
    crackSeconds: {
      offline1e10: analysis.guesses / 1e10,
      online100: analysis.guesses / 100,
    },
  };
}
