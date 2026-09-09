import { createFileRoute } from "@tanstack/react-router";
import ReverseIpLookup from "@/features/tools/reverse-ip-lookup/page";
import { reverseIpLookupHead } from "@/features/tools/reverse-ip-lookup/head";

import { ReverseIpLookupSkeleton } from "@/features/tools/reverse-ip-lookup/skeleton";

export const Route = createFileRoute("/{-$locale}/tools/reverse-ip-lookup")({
  head: reverseIpLookupHead,
  pendingComponent: ReverseIpLookupSkeleton,
  component: ReverseIpLookup,
});
