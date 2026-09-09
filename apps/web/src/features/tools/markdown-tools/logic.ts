import { htmlToMarkdown } from "@workspace/tools/text/html-markdown";
import hljs from "highlight.js/lib/core";
import markdown from "highlight.js/lib/languages/markdown";
import xml from "highlight.js/lib/languages/xml";
import {
  renderMarkdown,
  analyzeMarkdown,
} from "@workspace/tools/text/markdown";
import { EXPORT_BASE_STYLES, EXPORT_THEME_STYLES } from "./export-styles";
import { createExportHtmlDocument, outlineHtml } from "./markdown-preview";
import { sanitizeOutput, securePreviewDocument } from "./sanitize";
import {
  MAX_MARKDOWN_INPUT,
  MAX_MARKDOWN_OUTPUT,
  MarkdownError,
} from "@workspace/tools/text/markdown-contract";
import {
  MAX_PREVIEW_SOURCE,
  type MarkdownJob,
  type MarkdownResult,
} from "./types";

hljs.registerLanguage("xml", xml);
hljs.registerLanguage("markdown", markdown);
export function executeMarkdown(job: MarkdownJob): MarkdownResult {
  const inputBytes = new TextEncoder().encode(job.input).length;
  if (inputBytes > MAX_MARKDOWN_INPUT) throw new MarkdownError("too_large");
  let output: string,
    document: string | null = null;
  if (job.kind === "to-markdown") {
    output = htmlToMarkdown(job.input, {
      headingStyle: job.headingStyle,
      bulletListMarker: job.bulletListMarker,
      codeBlockStyle: job.codeBlockStyle,
    });
  } else {
    output =
      job.kind === "preview"
        ? analyzeMarkdown(job.input, "Untitled").html
        : renderMarkdown(job.input);
    if (job.sanitize) output = sanitizeOutput(output);
  }
  const source = job.kind === "to-markdown" ? output : job.input;
  const previewLimited = source.length > MAX_PREVIEW_SOURCE;
  const preview = analyzeMarkdown(
    source.slice(0, MAX_PREVIEW_SOURCE),
    "Untitled",
  );
  const full = previewLimited ? analyzeMarkdown(source, "Untitled") : preview;
  if (job.kind !== "to-markdown")
    document = createExportHtmlDocument({
      title: full.documentTitle,
      html: output,
      theme: job.theme,
      language: job.language,
      direction: job.direction,
    });
  const highlighted = hljs.highlight(output.slice(0, MAX_PREVIEW_SOURCE), {
    language: job.kind === "to-markdown" ? "markdown" : "xml",
    ignoreIllegals: true,
  }).value;
  const previewDocument = securePreviewDocument(
    preview.html,
    EXPORT_BASE_STYLES + EXPORT_THEME_STYLES[job.theme],
    job.language,
    job.direction,
  );
  const printDocument = previewLimited
    ? securePreviewDocument(
        full.html,
        EXPORT_BASE_STYLES + EXPORT_THEME_STYLES[job.theme],
        job.language,
        job.direction,
      )
    : previewDocument;
  const previewWithOutline = previewDocument.replace(
    "<article>",
    `<article>${outlineHtml(preview.toc)}`,
  );
  const printWithOutline = printDocument.replace(
    "<article>",
    `<article>${outlineHtml(full.toc)}`,
  );
  const result = {
    kind: job.kind,
    output,
    document,
    preview: previewDocument,
    previewWithOutline,
    printDocument,
    printWithOutline,
    highlighted,
    previewLimited,
    toc: [...full.toc],
    stats: full.stats,
  };
  const bytes =
    new TextEncoder().encode(output).length +
    new TextEncoder().encode(document ?? "").length +
    new TextEncoder().encode(previewDocument).length +
    new TextEncoder().encode(highlighted).length +
    new TextEncoder().encode(previewWithOutline).length +
    new TextEncoder().encode(printDocument).length +
    new TextEncoder().encode(printWithOutline).length;
  if (bytes > MAX_MARKDOWN_OUTPUT) throw new MarkdownError("too_large");
  return { ...result, bytes };
}
