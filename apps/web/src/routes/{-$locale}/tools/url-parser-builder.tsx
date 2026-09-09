import { createFileRoute } from "@tanstack/react-router";
import { UrlParserBuilder } from "@/features/tools/url-parser-builder/page";
import { urlParserBuilderHead } from "@/features/tools/url-parser-builder/head";

import { UrlParserBuilderSkeleton } from "@/features/tools/url-parser-builder/skeleton";

export const Route = createFileRoute("/{-$locale}/tools/url-parser-builder")({
  head: urlParserBuilderHead,
  pendingComponent: UrlParserBuilderSkeleton,
  component: UrlParserBuilder,
});
