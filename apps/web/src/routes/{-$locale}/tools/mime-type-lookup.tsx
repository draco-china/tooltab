import { createFileRoute } from "@tanstack/react-router";
import MimeTypeLookup from "@/features/tools/mime-type-lookup/page";
import { mimeTypeLookupHead } from "@/features/tools/mime-type-lookup/head";

import { MimeTypeLookupSkeleton } from "@/features/tools/mime-type-lookup/skeleton";

export const Route = createFileRoute("/{-$locale}/tools/mime-type-lookup")({
  head: mimeTypeLookupHead,
  pendingComponent: MimeTypeLookupSkeleton,
  component: MimeTypeLookup,
});
