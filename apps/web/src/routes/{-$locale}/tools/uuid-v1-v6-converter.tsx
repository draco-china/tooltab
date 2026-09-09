import { createFileRoute } from "@tanstack/react-router";
import { UuidTimeConverter } from "@/features/tools/uuid-v1-v6-converter/page";
import { uuidV1V6ConverterHead } from "@/features/tools/uuid-v1-v6-converter/head";

import { UuidTimeConverterSkeleton } from "@/features/tools/uuid-v1-v6-converter/skeleton";

export const Route = createFileRoute("/{-$locale}/tools/uuid-v1-v6-converter")({
  head: uuidV1V6ConverterHead,
  pendingComponent: UuidTimeConverterSkeleton,
  component: UuidTimeConverter,
});
