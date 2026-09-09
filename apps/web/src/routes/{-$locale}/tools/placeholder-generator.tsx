import { createFileRoute } from "@tanstack/react-router";
import PlaceholderGeneratorPage from "@/features/tools/placeholder-generator/page";
import { placeholderGeneratorHead } from "@/features/tools/placeholder-generator/head";

import { PlaceholderGeneratorRouteSkeleton } from "@/features/tools/placeholder-generator/skeleton";

export const Route = createFileRoute("/{-$locale}/tools/placeholder-generator")(
  {
    head: placeholderGeneratorHead,
    pendingComponent: PlaceholderGeneratorRouteSkeleton,
    component: PlaceholderGeneratorPage,
  },
);
