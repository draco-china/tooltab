import { createFileRoute } from "@tanstack/react-router";
import { UuidMaxGenerator } from "@/features/tools/uuid-generator/page";
import { uuidMaxGeneratorHead } from "@/features/tools/uuid-generator/head";

import { UuidMaxGeneratorSkeleton } from "@/features/tools/uuid-max-generator/skeleton";

export const Route = createFileRoute("/{-$locale}/tools/uuid-max-generator")({
  head: uuidMaxGeneratorHead,
  pendingComponent: UuidMaxGeneratorSkeleton,
  component: UuidMaxGenerator,
});
