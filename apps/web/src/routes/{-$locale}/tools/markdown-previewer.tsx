import { createFileRoute } from "@tanstack/react-router";
import MarkdownPreviewerPage from "@/features/tools/markdown-previewer/page";
import { markdownPreviewerHead } from "@/features/tools/markdown-previewer/head";

import { MarkdownPreviewerSkeleton } from "@/features/tools/markdown-previewer/skeleton";

export const Route = createFileRoute("/{-$locale}/tools/markdown-previewer")({
  head: markdownPreviewerHead,
  pendingComponent: MarkdownPreviewerSkeleton,
  component: MarkdownPreviewerPage,
});
