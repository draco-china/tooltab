import { createFileRoute } from "@tanstack/react-router";
import ColorConverter from "@/features/tools/color-converter/page";
import { colorConverterHead } from "@/features/tools/color-converter/head";

import { ColorConverterRouteSkeleton } from "@/features/tools/color-converter/skeleton";

export const Route = createFileRoute("/{-$locale}/tools/color-converter")({
  head: colorConverterHead,
  pendingComponent: ColorConverterRouteSkeleton,
  component: ColorConverter,
});
