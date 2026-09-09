import { createFileRoute } from "@tanstack/react-router";
import CssGradientGeneratorPage from "@/features/tools/css-gradient-generator/page";
import { cssGradientGeneratorHead } from "@/features/tools/css-gradient-generator/head";

import { CssGradientGeneratorSkeleton } from "@/features/tools/css-gradient-generator/skeleton";

export const Route = createFileRoute(
  "/{-$locale}/tools/css-gradient-generator",
)({
  head: cssGradientGeneratorHead,
  pendingComponent: CssGradientGeneratorSkeleton,
  component: CssGradientGeneratorPage,
});
