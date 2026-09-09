import { createFileRoute } from "@tanstack/react-router";
import Cuid2GeneratorPage from "@/features/tools/cuid2-generator/page";
import { cuid2GeneratorHead } from "@/features/tools/cuid2-generator/head";

import { Cuid2GeneratorSkeleton } from "@/features/tools/cuid2-generator/skeleton";

export const Route = createFileRoute("/{-$locale}/tools/cuid2-generator")({
  head: cuid2GeneratorHead,
  pendingComponent: Cuid2GeneratorSkeleton,
  component: Cuid2GeneratorPage,
});
