import { createFileRoute } from "@tanstack/react-router";
import KsuidTool from "@/features/tools/ksuid-generator/page";
import { ksuidGeneratorHead } from "@/features/tools/ksuid-generator/head";

import { KsuidGeneratorSkeleton } from "@/features/tools/ksuid-generator/skeleton";

export const Route = createFileRoute("/{-$locale}/tools/ksuid-generator")({
  head: ksuidGeneratorHead,
  pendingComponent: KsuidGeneratorSkeleton,
  component: KsuidTool,
});
