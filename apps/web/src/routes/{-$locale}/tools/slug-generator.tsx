import { createFileRoute } from "@tanstack/react-router";
import SlugGeneratorPage from "@/features/tools/slug-generator/page";
import { slugGeneratorHead } from "@/features/tools/slug-generator/head";

import { SlugGeneratorRouteSkeleton } from "@/features/tools/slug-generator/skeleton";

export const Route = createFileRoute("/{-$locale}/tools/slug-generator")({
  head: slugGeneratorHead,
  pendingComponent: SlugGeneratorRouteSkeleton,
  component: SlugGeneratorPage,
});
