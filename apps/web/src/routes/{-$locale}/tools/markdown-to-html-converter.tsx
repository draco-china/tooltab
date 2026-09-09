import { createFileRoute } from "@tanstack/react-router";
import MarkdownToHtml from "@/features/tools/markdown-to-html-converter/page";
import { markdownToHtmlConverterHead } from "@/features/tools/markdown-to-html-converter/head";

import { MarkdownToHtmlSkeleton } from "@/features/tools/markdown-to-html-converter/skeleton";

export const Route = createFileRoute(
  "/{-$locale}/tools/markdown-to-html-converter",
)({
  head: markdownToHtmlConverterHead,
  pendingComponent: MarkdownToHtmlSkeleton,
  component: MarkdownToHtml,
});
