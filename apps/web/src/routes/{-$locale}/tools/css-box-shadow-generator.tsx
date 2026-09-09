import { createFileRoute } from "@tanstack/react-router";
import CssBoxShadowGeneratorPage from "@/features/tools/css-box-shadow-generator/page";
import { cssBoxShadowGeneratorHead } from "@/features/tools/css-box-shadow-generator/head";

import { CssBoxShadowGeneratorSkeleton } from "@/features/tools/css-box-shadow-generator/skeleton";

export const Route = createFileRoute(
  "/{-$locale}/tools/css-box-shadow-generator",
)({
  head: cssBoxShadowGeneratorHead,
  pendingComponent: CssBoxShadowGeneratorSkeleton,
  component: CssBoxShadowGeneratorPage,
});
