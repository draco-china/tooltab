import { createFileRoute } from "@tanstack/react-router";
import UnitConverterPage from "@/features/tools/unit-converter/page";
import { unitConverterHead } from "@/features/tools/unit-converter/head";

import { UnitConverterRouteSkeleton } from "@/features/tools/unit-converter/skeleton";

export const Route = createFileRoute("/{-$locale}/tools/unit-converter")({
  head: unitConverterHead,
  pendingComponent: UnitConverterRouteSkeleton,
  component: UnitConverterPage,
});
