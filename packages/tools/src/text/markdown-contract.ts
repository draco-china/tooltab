import { z } from "zod";
export const MAX_MARKDOWN_INPUT = 32 * 1024 * 1024;
export const MAX_MARKDOWN_OUTPUT = 128 * 1024 * 1024;
export class MarkdownError extends Error {
  constructor(
    public code:
      | "too_large"
      | "too_deep"
      | "invalid_input"
      | "invalid_options"
      | "unsupported"
      | "timeout"
      | "busy"
      | "read_failed",
  ) {
    super(code);
  }
}

export const htmlToMarkdownOptionsSchema = z.strictObject({
  headingStyle: z.enum(["atx", "setext"]).default("atx"),
  bulletListMarker: z.enum(["-", "*", "+"]).default("-"),
  codeBlockStyle: z.enum(["fenced", "indented"]).default("fenced"),
});

export type HtmlToMarkdownOptions = z.output<
  typeof htmlToMarkdownOptionsSchema
>;
