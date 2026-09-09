import { createFileRoute } from "@tanstack/react-router";
import { UuidV5Generator } from "@/features/tools/uuid-name/page";
import { uuidV5GeneratorHead } from "@/features/tools/uuid-name/head";

import { UuidV5GeneratorSkeleton } from "@/features/tools/uuid-v5-generator/skeleton";

export const Route = createFileRoute("/{-$locale}/tools/uuid-v5-generator")({
  head: uuidV5GeneratorHead,
  pendingComponent: UuidV5GeneratorSkeleton,
  component: UuidV5Generator,
});
