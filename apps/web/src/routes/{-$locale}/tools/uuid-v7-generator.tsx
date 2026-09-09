import { createFileRoute } from "@tanstack/react-router";
import UuidV7Generator from "@/features/tools/uuid-v7-generator/page";
import { uuidV7GeneratorHead } from "@/features/tools/uuid-v7-generator/head";

import { UuidV7RouteSkeleton } from "@/features/tools/uuid-v7-generator/skeleton";

export const Route = createFileRoute("/{-$locale}/tools/uuid-v7-generator")({
  head: uuidV7GeneratorHead,
  pendingComponent: UuidV7RouteSkeleton,
  component: UuidV7Generator,
});
