import { createFileRoute } from "@tanstack/react-router";
import PortNumberLookupPage from "@/features/tools/port-number-lookup/page";
import { portNumberLookupHead } from "@/features/tools/port-number-lookup/head";

import { PortNumberLookupSkeleton } from "@/features/tools/port-number-lookup/skeleton";

export const Route = createFileRoute("/{-$locale}/tools/port-number-lookup")({
  head: portNumberLookupHead,
  pendingComponent: PortNumberLookupSkeleton,
  component: PortNumberLookupPage,
});
