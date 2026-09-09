import { createFileRoute } from "@tanstack/react-router";
import PngOptimizer from "@/features/tools/png-optimizer/page";
import { pngOptimizerHead } from "@/features/tools/png-optimizer/head";

import { PngOptimizerSkeleton } from "@/features/tools/png-optimizer/skeleton";

export const Route = createFileRoute("/{-$locale}/tools/png-optimizer")({
  head: pngOptimizerHead,
  pendingComponent: PngOptimizerSkeleton,
  component: PngOptimizer,
});
