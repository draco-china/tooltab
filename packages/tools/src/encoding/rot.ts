export const MAX_CODEC_TEXT = 100_000;

export class RotCipherError extends Error {
  constructor(
    public readonly code: "too_large" | "invalid_unicode" | "invalid_option",
  ) {
    super(code);
  }
}

export type RotType = 13 | 5 | 18 | 47;

function validate(input: string) {
  if (input.length > MAX_CODEC_TEXT) throw new RotCipherError("too_large");
  for (const character of input) {
    // biome-ignore lint/style/noNonNullAssertion: validated fixed-width index or lookup invariant
    const codePoint = character.codePointAt(0)!;
    if (codePoint >= 0xd800 && codePoint <= 0xdfff) {
      throw new RotCipherError("invalid_unicode");
    }
  }
}

export function rotateText(input: string, type: RotType = 13) {
  validate(input);
  if (![13, 5, 18, 47].includes(type)) {
    throw new RotCipherError("invalid_option");
  }

  return Array.from(input, (character) => {
    const code = character.charCodeAt(0);
    if (type === 47 && code >= 33 && code <= 126) {
      return String.fromCharCode(33 + ((code - 33 + 47) % 94));
    }
    if ((type === 5 || type === 18) && code >= 48 && code <= 57) {
      return String.fromCharCode(48 + ((code - 48 + 5) % 10));
    }
    if (type === 13 || type === 18) {
      if (code >= 65 && code <= 90) {
        return String.fromCharCode(65 + ((code - 65 + 13) % 26));
      }
      if (code >= 97 && code <= 122) {
        return String.fromCharCode(97 + ((code - 97 + 13) % 26));
      }
    }
    return character;
  }).join("");
}
