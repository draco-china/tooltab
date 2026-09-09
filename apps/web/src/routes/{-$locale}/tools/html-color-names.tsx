import { createFileRoute } from "@tanstack/react-router";
import HtmlColorNames from "@/features/tools/html-color-names/page";
import { htmlColorNamesHead } from "@/features/tools/html-color-names/head";

import { HtmlColorNamesSkeleton } from "@/features/tools/html-color-names/skeleton";

export const Route = createFileRoute("/{-$locale}/tools/html-color-names")({
  head: htmlColorNamesHead,
  pendingComponent: HtmlColorNamesSkeleton,
  component: HtmlColorNames,
});
