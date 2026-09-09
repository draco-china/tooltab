import { createFileRoute } from "@tanstack/react-router";
import { SvgOptimizer } from "@/features/tools/svg-optimizer/page";
import { svgOptimizerHead } from "@/features/tools/svg-optimizer/head";

import { SvgOptimizerSkeleton } from "@/features/tools/svg-optimizer/skeleton";

export const Route = createFileRoute("/{-$locale}/tools/svg-optimizer")({
  head: svgOptimizerHead,
  pendingComponent: SvgOptimizerSkeleton,
  component: SvgOptimizer,
});
