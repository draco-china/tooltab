import * as z from "zod/v4";

const encoder = new TextEncoder();

const ASCII_ALIGNS = ["left", "center", "right"] as const;
const ASCII_INPUT_LIMIT = 16 * 1024;
const ASCII_OUTPUT_LIMIT = 1024 * 1024;
const ASCII_LINE_LIMIT = 128;
const ASCII_MIN_WIDTH = 40;
const ASCII_MAX_WIDTH = 160;

type AsciiAlign = (typeof ASCII_ALIGNS)[number];
type AsciiOptions = z.infer<typeof asciiOptionsSchema>;
type AsciiRender = (
  text: string,
  options: { font: string; width: number; whitespaceBreak: boolean },
) => string;
type AsciiResult = {
  output: string;
  filename: string;
  bytes: number;
  lines: number;
  font: string;
  align: AsciiAlign;
  width: number;
};
type AsciiJob = AsciiOptions;
type AsciiErrorCode =
  | "invalid_input"
  | "too_many_lines"
  | "font_not_found"
  | "output_too_large"
  | "artifact_required"
  | "busy"
  | "timeout"
  | "unsupported";

const asciiOptionsSchema = z.strictObject({
  text: z.string().max(ASCII_INPUT_LIMIT),
  font: z.string().trim().min(1).max(128).default("Standard"),
  align: z.enum(ASCII_ALIGNS).default("left"),
  width: z
    .number()
    .int()
    .min(ASCII_MIN_WIDTH)
    .max(ASCII_MAX_WIDTH)
    .default(100),
});

class AsciiError extends Error {
  constructor(readonly code: AsciiErrorCode) {
    super(code);
    this.name = "AsciiError";
  }
}

function alignLine(line: string, align: AsciiAlign, width: number) {
  const spaces = Math.max(0, width - line.length);
  if (align === "right") return `${" ".repeat(spaces)}${line}`;
  if (align === "center") return `${" ".repeat(Math.floor(spaces / 2))}${line}`;
  return line;
}

function generateAsciiArt(input: unknown, render: AsciiRender): AsciiResult {
  let options: AsciiOptions;
  try {
    options = asciiOptionsSchema.parse(input);
  } catch {
    throw new AsciiError("invalid_input");
  }
  const normalized = options.text.replace(/\r\n?/g, "\n");
  if (encoder.encode(normalized).length > ASCII_INPUT_LIMIT)
    throw new AsciiError("invalid_input");
  const sourceLines = normalized.split("\n");
  if (sourceLines.length > ASCII_LINE_LIMIT)
    throw new AsciiError("too_many_lines");
  let output: string;
  try {
    output = normalized.trim()
      ? sourceLines
          .map((line) =>
            line
              ? render(line, {
                  font: options.font,
                  width: options.width,
                  whitespaceBreak: true,
                })
                  .split("\n")
                  .map((row) => alignLine(row, options.align, options.width))
                  .join("\n")
              : "",
          )
          .join("\n")
      : "";
  } catch {
    throw new AsciiError("font_not_found");
  }
  const bytes = encoder.encode(output).length;
  if (bytes > ASCII_OUTPUT_LIMIT) throw new AsciiError("output_too_large");
  return {
    output,
    filename: `${options.font.toLowerCase().replace(/[^a-z0-9]+/g, "-")}-ascii-art.txt`,
    bytes,
    lines: output ? output.split("\n").length : 0,
    font: options.font,
    align: options.align,
    width: options.width,
  };
}

export {
  ASCII_ALIGNS,
  ASCII_INPUT_LIMIT,
  ASCII_LINE_LIMIT,
  ASCII_MAX_WIDTH,
  ASCII_MIN_WIDTH,
  ASCII_OUTPUT_LIMIT,
  AsciiError,
  asciiOptionsSchema,
  generateAsciiArt,
};
export type {
  AsciiAlign,
  AsciiErrorCode,
  AsciiJob,
  AsciiOptions,
  AsciiRender,
  AsciiResult,
};
