import { createFileRoute } from "@tanstack/react-router";
import UuidV6Generator from "@/features/tools/uuid-v6-generator/page";
import { uuidV6GeneratorHead } from "@/features/tools/uuid-v6-generator/head";

import { UuidV6GeneratorSkeleton } from "@/features/tools/uuid-v6-generator/skeleton";

export const Route = createFileRoute("/{-$locale}/tools/uuid-v6-generator")({
  head: uuidV6GeneratorHead,
  pendingComponent: UuidV6GeneratorSkeleton,
  component: UuidV6Generator,
});
