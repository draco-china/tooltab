export const MAX_UTILITY_INPUT = 16 * 1024 * 1024;
export const MAX_UTILITY_OUTPUT = 128 * 1024 * 1024;
export class TextUtilityError extends Error {
  constructor(
    public code:
      | "invalid_input"
      | "invalid_options"
      | "invalid_morse"
      | "too_large"
      | "audio_too_long"
      | "unsupported"
      | "timeout"
      | "busy"
      | "read_failed"
      | "artifact_required",
  ) {
    super(code);
  }
}
const encoder = new TextEncoder();
export function validateText(input: string) {
  if (typeof input !== "string") throw new TextUtilityError("invalid_input");
  if (
    input.length > MAX_UTILITY_INPUT ||
    encoder.encode(input).length > MAX_UTILITY_INPUT
  )
    throw new TextUtilityError("too_large");
  if (
    /[\uD800-\uDBFF](?![\uDC00-\uDFFF])|(?<![\uD800-\uDBFF])[\uDC00-\uDFFF]/.test(
      input,
    )
  )
    throw new TextUtilityError("invalid_input");
}
export function textBuilder() {
  let pending = "",
    bytes = 0;
  const chunks: string[] = [];
  const flush = () => {
    if (pending) {
      bytes += encoder.encode(pending).length;
      if (bytes > MAX_UTILITY_OUTPUT) throw new TextUtilityError("too_large");
      chunks.push(pending);
      pending = "";
    }
  };
  return {
    append(text: string) {
      pending += text;
      if (pending.length >= 65536) flush();
    },
    finish() {
      flush();
      return chunks.join("");
    },
  };
}
