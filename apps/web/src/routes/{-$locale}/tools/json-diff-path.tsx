import { createFileRoute } from "@tanstack/react-router";
import { JsonDiffPathPage } from "@/features/tools/json-diff-path/page";
import { jsonDiffPathHead } from "@/features/tools/json-diff-path/head";

import { JsonDiffPathRouteSkeleton } from "@/features/tools/json-diff-path/skeleton";

export const Route = createFileRoute("/{-$locale}/tools/json-diff-path")({
  head: jsonDiffPathHead,
  pendingComponent: JsonDiffPathRouteSkeleton,
  component: JsonDiffPathPage,
});
