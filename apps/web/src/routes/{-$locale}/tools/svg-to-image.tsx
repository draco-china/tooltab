import { createFileRoute } from "@tanstack/react-router";
import SvgToImagePage from "@/features/tools/svg-to-image/page";
import { svgToImageHead } from "@/features/tools/svg-to-image/head";

import { SvgToImageRouteSkeleton } from "@/features/tools/svg-to-image/skeleton";

export const Route = createFileRoute("/{-$locale}/tools/svg-to-image")({
  head: svgToImageHead,
  pendingComponent: SvgToImageRouteSkeleton,
  component: SvgToImagePage,
});
