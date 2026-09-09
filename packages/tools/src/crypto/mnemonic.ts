import { entropyToMnemonic, mnemonicToEntropy } from "@scure/bip39";
import { wordlist as czech } from "@scure/bip39/wordlists/czech.js";
import { wordlist as english } from "@scure/bip39/wordlists/english.js";
import { wordlist as french } from "@scure/bip39/wordlists/french.js";
import { wordlist as italian } from "@scure/bip39/wordlists/italian.js";
import { wordlist as japanese } from "@scure/bip39/wordlists/japanese.js";
import { wordlist as korean } from "@scure/bip39/wordlists/korean.js";
import { wordlist as portuguese } from "@scure/bip39/wordlists/portuguese.js";
import { wordlist as chinese_simplified } from "@scure/bip39/wordlists/simplified-chinese.js";
import { wordlist as spanish } from "@scure/bip39/wordlists/spanish.js";
import { wordlist as chinese_traditional } from "@scure/bip39/wordlists/traditional-chinese.js";

const wordlists = {
  english,
  chinese_simplified,
  chinese_traditional,
  czech,
  french,
  italian,
  japanese,
  korean,
  portuguese,
  spanish,
};
export const LANGUAGES = [
  "english",
  "chinese_simplified",
  "chinese_traditional",
  "czech",
  "french",
  "italian",
  "japanese",
  "korean",
  "portuguese",
  "spanish",
] as const;
export type Language = (typeof LANGUAGES)[number];
export class MnemonicError extends Error {
  constructor(
    public readonly code:
      | "invalid_options"
      | "invalid_entropy"
      | "invalid_mnemonic"
      | "random_failed",
  ) {
    super(code);
  }
}
export function list(language: Language) {
  if (!LANGUAGES.includes(language) || !wordlists[language])
    throw new MnemonicError("invalid_options");
  return wordlists[language];
}
export function normalize(input: string) {
  if (input.length > 4096) throw new MnemonicError("invalid_mnemonic");
  for (const char of input) {
    // biome-ignore lint/style/noNonNullAssertion: validated fixed-width index or lookup invariant
    const c = char.codePointAt(0)!;
    if (c >= 0xd800 && c <= 0xdfff) throw new MnemonicError("invalid_mnemonic");
  }
  return input.normalize("NFKD").trim().split(/\s+/u).join(" ");
}
export function fromEntropy(input: string, language: Language = "english") {
  const words = list(language);
  if (input.length > 100) throw new MnemonicError("invalid_entropy");
  const entropy = input.trim().toLowerCase().replace(/^0x/, "");
  if (
    !/^[a-f0-9]+$/.test(entropy) ||
    ![32, 40, 48, 56, 64].includes(entropy.length)
  )
    throw new MnemonicError("invalid_entropy");
  return {
    mnemonic: entropyToMnemonic(
      // biome-ignore lint/style/noNonNullAssertion: validated fixed-width index or lookup invariant
      Uint8Array.from(entropy.match(/../g)!, (v) => Number.parseInt(v, 16)),
      words,
    ),
    entropy,
    wordCount: (entropy.length * 3) / 8,
    strength: entropy.length * 4,
    valid: true,
  };
}
export function inspect(input: string, language: Language = "english") {
  const words = list(language),
    mnemonic = normalize(input),
    wordCount = mnemonic ? mnemonic.split(" ").length : 0;
  try {
    const entropy = Array.from(mnemonicToEntropy(mnemonic, words), (b) =>
      b.toString(16).padStart(2, "0"),
    ).join("");
    return {
      mnemonic,
      entropy,
      wordCount,
      strength: entropy.length * 4,
      valid: true,
    };
  } catch {
    return { mnemonic, entropy: "", wordCount, strength: 0, valid: false };
  }
}
export function generate(wordCount = 12, language: Language = "english") {
  if (![12, 15, 18, 21, 24].includes(wordCount))
    throw new MnemonicError("invalid_options");
  list(language);
  let bytes: Uint8Array;
  try {
    bytes = crypto.getRandomValues(new Uint8Array((wordCount * 4) / 3));
  } catch {
    throw new MnemonicError("random_failed");
  }
  return fromEntropy(
    Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join(""),
    language,
  );
}
