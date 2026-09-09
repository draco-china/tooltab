import { htmlToMarkdown } from "@workspace/tools/text/html-markdown";
import hljs from "highlight.js/lib/core";
import markdown from "highlight.js/lib/languages/markdown";
import {
  MAX_MARKDOWN_INPUT,
  MAX_MARKDOWN_OUTPUT,
  MarkdownError,
} from "@workspace/tools/text/markdown-contract";
import {
  MAX_PREVIEW_SOURCE,
  type MarkdownJob,
  type MarkdownResult,
} from "../markdown-tools/types";

hljs.registerLanguage("markdown", markdown);

export function executeMarkdown(job: MarkdownJob): MarkdownResult {
  if (job.kind !== "to-markdown") throw new MarkdownError("unsupported");
  if (new TextEncoder().encode(job.input).length > MAX_MARKDOWN_INPUT)
    throw new MarkdownError("too_large");
  const output = htmlToMarkdown(job.input, {
    headingStyle: job.headingStyle,
    bulletListMarker: job.bulletListMarker,
    codeBlockStyle: job.codeBlockStyle,
  });
  const highlighted = hljs.highlight(output.slice(0, MAX_PREVIEW_SOURCE), {
    language: "markdown",
    ignoreIllegals: true,
  }).value;
  const bytes =
    new TextEncoder().encode(output).length +
    new TextEncoder().encode(highlighted).length;
  if (bytes > MAX_MARKDOWN_OUTPUT) throw new MarkdownError("too_large");
  return {
    kind: "to-markdown",
    output,
    document: null,
    preview: "",
    previewWithOutline: "",
    printDocument: "",
    printWithOutline: "",
    highlighted,
    previewLimited: output.length > MAX_PREVIEW_SOURCE,
    toc: [],
    stats: {
      words: 0,
      characters: output.length,
      headings: 0,
      links: 0,
      images: 0,
      readTimeMinutes: 0,
    },
    bytes,
  };
}
