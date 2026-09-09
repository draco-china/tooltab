import { createFileRoute } from "@tanstack/react-router";
import { UuidNilGenerator } from "@/features/tools/uuid-generator/page";
import { uuidNilGeneratorHead } from "@/features/tools/uuid-generator/head";

import { UuidNilGeneratorSkeleton } from "@/features/tools/uuid-nil-generator/skeleton";

export const Route = createFileRoute("/{-$locale}/tools/uuid-nil-generator")({
  head: uuidNilGeneratorHead,
  pendingComponent: UuidNilGeneratorSkeleton,
  component: UuidNilGenerator,
});
