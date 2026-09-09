import { createFileRoute } from "@tanstack/react-router";
import { UlidGenerator } from "@/features/tools/ulid-generator/page";
import { ulidGeneratorHead } from "@/features/tools/ulid-generator/head";

import { UlidGeneratorSkeleton } from "@/features/tools/ulid-generator/skeleton";

export const Route = createFileRoute("/{-$locale}/tools/ulid-generator")({
  head: ulidGeneratorHead,
  pendingComponent: UlidGeneratorSkeleton,
  component: UlidGenerator,
});
