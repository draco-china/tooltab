import { createFileRoute } from "@tanstack/react-router";
import { UuidV4BulkGenerator } from "@/features/tools/uuid-generator/page";
import { uuidV4BulkGeneratorHead } from "@/features/tools/uuid-generator/head";

import { UuidV4BulkGeneratorSkeleton } from "@/features/tools/uuid-v4-bulk-generator/skeleton";

export const Route = createFileRoute(
  "/{-$locale}/tools/uuid-v4-bulk-generator",
)({
  head: uuidV4BulkGeneratorHead,
  pendingComponent: UuidV4BulkGeneratorSkeleton,
  component: UuidV4BulkGenerator,
});
