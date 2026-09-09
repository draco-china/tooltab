import { createFileRoute } from "@tanstack/react-router";
import UuidV3Generator from "@/features/tools/uuid-v3-generator/page";
import { uuidV3GeneratorHead } from "@/features/tools/uuid-v3-generator/head";

import { UuidV3GeneratorSkeleton } from "@/features/tools/uuid-v3-generator/skeleton";

export const Route = createFileRoute("/{-$locale}/tools/uuid-v3-generator")({
  head: uuidV3GeneratorHead,
  pendingComponent: UuidV3GeneratorSkeleton,
  component: UuidV3Generator,
});
