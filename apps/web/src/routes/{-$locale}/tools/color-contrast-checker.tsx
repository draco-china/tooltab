import { createFileRoute } from "@tanstack/react-router";
import { ColorContrastChecker } from "@/features/tools/color-contrast-checker/page";
import { colorContrastCheckerHead } from "@/features/tools/color-contrast-checker/head";

import { ColorContrastRouteSkeleton } from "@/features/tools/color-contrast-checker/skeleton";

export const Route = createFileRoute(
  "/{-$locale}/tools/color-contrast-checker",
)({
  head: colorContrastCheckerHead,
  pendingComponent: ColorContrastRouteSkeleton,
  component: ColorContrastChecker,
});
