export const FORMATTER_INPUT_LIMIT = 32 * 1024 * 1024;
export const FORMATTER_OUTPUT_LIMIT = 128 * 1024 * 1024;

export type FormatterErrorCode =
  | "invalid_input"
  | "invalid_options"
  | "too_large"
  | "parse_error"
  | "timeout"
  | "busy"
  | "unsupported"
  | "read_failed";
export class FormatterError extends Error {
  constructor(
    public readonly code: FormatterErrorCode,
    message: string = code,
    public readonly line?: number,
    public readonly column?: number,
  ) {
    super(message);
    this.name = "FormatterError";
  }
}
