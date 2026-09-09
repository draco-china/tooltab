import { createFileRoute } from "@tanstack/react-router";
import { TextDiff } from "@/features/tools/text-diff/page";
import { textDiffHead } from "@/features/tools/text-diff/head";

import { TextDiffSkeleton } from "@/features/tools/text-diff/skeleton";

export const Route = createFileRoute("/{-$locale}/tools/text-diff")({
  head: textDiffHead,
  pendingComponent: TextDiffSkeleton,
  component: TextDiff,
});
