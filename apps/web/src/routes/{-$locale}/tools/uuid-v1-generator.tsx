import { createFileRoute } from "@tanstack/react-router";
import UuidV1Generator from "@/features/tools/uuid-v1-generator/page";
import { uuidV1GeneratorHead } from "@/features/tools/uuid-v1-generator/head";

import { UuidV1GeneratorSkeleton } from "@/features/tools/uuid-v1-generator/skeleton";

export const Route = createFileRoute("/{-$locale}/tools/uuid-v1-generator")({
  head: uuidV1GeneratorHead,
  pendingComponent: UuidV1GeneratorSkeleton,
  component: UuidV1Generator,
});
