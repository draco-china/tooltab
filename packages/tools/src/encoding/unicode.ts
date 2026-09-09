export const MAX_CODEC_TEXT = 100_000;
export const MAX_CODEC_ENCODED = 3_200_000;

export class TextCodecError extends Error {
  constructor(
    public readonly code:
      | "too_large"
      | "invalid_unicode"
      | "invalid_escape"
      | "invalid_option",
  ) {
    super(code);
  }
}

function validate(input: string, limit = MAX_CODEC_TEXT) {
  if (input.length > limit) throw new TextCodecError("too_large");
  for (const character of input) {
    // biome-ignore lint/style/noNonNullAssertion: validated fixed-width index or lookup invariant
    const codePoint = character.codePointAt(0)!;
    if (codePoint >= 0xd800 && codePoint <= 0xdfff) {
      throw new TextCodecError("invalid_unicode");
    }
  }
}

export const UNICODE_FORMATS = [
  "utf16",
  "braced",
  "html-hex",
  "html-decimal",
  "uplus",
  "bytes",
  "percent",
  "python",
  "hex",
] as const;

export type UnicodeFormat = (typeof UNICODE_FORMATS)[number];

export function escapeUnicode(input: string, format: UnicodeFormat = "utf16") {
  validate(input);
  if (!UNICODE_FORMATS.includes(format)) {
    throw new TextCodecError("invalid_option");
  }

  const completeCodePointList = format === "uplus" || format === "hex";
  return Array.from(input)
    .map((character, index, characters) => {
      // biome-ignore lint/style/noNonNullAssertion: validated fixed-width index or lookup invariant
      const codePoint = character.codePointAt(0)!;
      const hex = codePoint.toString(16).toUpperCase();
      if (completeCodePointList) {
        return `${format === "uplus" ? "U+" : "0x"}${hex.padStart(4, "0")}`;
      }
      if (character === "\\") return "\\\\";
      if (
        codePoint >= 32 &&
        codePoint <= 126 &&
        character !== "%" &&
        !(character === "&" && characters[index + 1] === "#") &&
        !(character === "U" && characters[index + 1] === "+") &&
        !(character === "0" && characters[index + 1] === "x")
      ) {
        return character;
      }
      if (format === "utf16") {
        return Array.from(
          { length: character.length },
          (_, offset) =>
            `\\u${character.charCodeAt(offset).toString(16).toUpperCase().padStart(4, "0")}`,
        ).join("");
      }
      if (format === "braced") return `\\u{${hex}}`;
      if (format === "html-hex") return `&#x${hex};`;
      if (format === "html-decimal") return `&#${codePoint};`;
      if (format === "python") return `\\U${hex.padStart(8, "0")}`;

      return Array.from(
        new TextEncoder().encode(character),
        (byte) =>
          `${format === "bytes" ? "\\x" : "%"}${byte.toString(16).toUpperCase().padStart(2, "0")}`,
      ).join("");
    })
    .join(completeCodePointList ? " " : "");
}

function scalar(codePoint: number) {
  if (
    codePoint > 0x10ffff ||
    codePoint < 0 ||
    (codePoint >= 0xd800 && codePoint <= 0xdfff)
  ) {
    throw new TextCodecError("invalid_escape");
  }
  return String.fromCodePoint(codePoint);
}

export function unescapeUnicode(input: string) {
  validate(input, MAX_CODEC_ENCODED);

  if (
    /^(?:(?:U\+|0x)[\da-fA-F]{4,6})(?:\s+(?:U\+|0x)[\da-fA-F]{4,6})*(?![\s\S])/.test(
      input,
    )
  ) {
    return input
      .split(/\s+/)
      .map((token) => scalar(Number.parseInt(token.slice(2), 16)))
      .join("");
  }

  let result = "";
  for (let index = 0; index < input.length; ) {
    const rest = input.slice(index);
    let match: RegExpExecArray | null;

    if (rest.startsWith("\\\\")) {
      result += "\\";
      index += 2;
      continue;
    }

    match =
      /^(?:\\x[\da-fA-F]{2})+/.exec(rest) ?? /^(?:%[\da-fA-F]{2})+/.exec(rest);
    if (match) {
      const bytes = Uint8Array.from(
        // biome-ignore lint/style/noNonNullAssertion: validated fixed-width index or lookup invariant
        match[0].match(/[\da-fA-F]{2}/g)!,
        (value) => Number.parseInt(value, 16),
      );
      try {
        result += new TextDecoder("utf-8", {
          fatal: true,
          ignoreBOM: true,
        }).decode(bytes);
      } catch {
        throw new TextCodecError("invalid_escape");
      }
      index += match[0].length;
      continue;
    }

    match = /^\\u([\da-fA-F]{4})/.exec(rest);
    if (match) {
      // biome-ignore lint/style/noNonNullAssertion: validated fixed-width index or lookup invariant
      const first = Number.parseInt(match[1]!, 16);
      if (first >= 0xd800 && first <= 0xdbff) {
        const second = /^\\u([\da-fA-F]{4})/.exec(rest.slice(6));
        const low = Number.parseInt(second?.[1] ?? "", 16);
        if (!(low >= 0xdc00 && low <= 0xdfff)) {
          throw new TextCodecError("invalid_escape");
        }
        result += String.fromCodePoint(
          0x10000 + (first - 0xd800) * 1024 + low - 0xdc00,
        );
        index += 12;
      } else {
        result += scalar(first);
        index += 6;
      }
      continue;
    }

    match =
      /^\\u\{([\da-fA-F]{1,6})\}/.exec(rest) ??
      /^\\U([\da-fA-F]{8})/.exec(rest) ??
      /^&#[xX]([\da-fA-F]{1,6});/.exec(rest) ??
      /^(?:U\+|0x)([\da-fA-F]{4,6})(?![\da-fA-F])/.exec(rest);
    if (match) {
      // biome-ignore lint/style/noNonNullAssertion: validated fixed-width index or lookup invariant
      result += scalar(Number.parseInt(match[1]!, 16));
      index += match[0].length;
      continue;
    }

    match = /^&#(\d{1,7});/.exec(rest);
    if (match) {
      // biome-ignore lint/style/noNonNullAssertion: validated fixed-width index or lookup invariant
      result += scalar(Number.parseInt(match[1]!, 10));
      index += match[0].length;
      continue;
    }
    if (/^(?:\\[uUx]|&#|U\+|0x|%)/.test(rest)) {
      throw new TextCodecError("invalid_escape");
    }
    result += input[index];
    index += 1;
  }
  return result;
}
