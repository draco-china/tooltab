import { createFileRoute } from "@tanstack/react-router";
import UuidV4Generator from "@/features/tools/uuid-generator/page";
import { uuidV4GeneratorHead } from "@/features/tools/uuid-generator/head";

import { UuidV4GeneratorSkeleton } from "@/features/tools/uuid-v4-generator/skeleton";

export const Route = createFileRoute("/{-$locale}/tools/uuid-v4-generator")({
  head: uuidV4GeneratorHead,
  pendingComponent: UuidV4GeneratorSkeleton,
  component: UuidV4Generator,
});
