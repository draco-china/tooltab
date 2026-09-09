import { createFileRoute } from "@tanstack/react-router";
import HtmlToMarkdown from "@/features/tools/html-to-markdown-converter/page";
import { htmlToMarkdownConverterHead } from "@/features/tools/html-to-markdown-converter/head";

import { HtmlToMarkdownConverterSkeleton } from "@/features/tools/html-to-markdown-converter/skeleton";

export const Route = createFileRoute(
  "/{-$locale}/tools/html-to-markdown-converter",
)({
  head: htmlToMarkdownConverterHead,
  pendingComponent: HtmlToMarkdownConverterSkeleton,
  component: HtmlToMarkdown,
});
