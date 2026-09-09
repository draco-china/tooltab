import { createFileRoute } from "@tanstack/react-router";
import IpInfoLookup from "@/features/tools/ip-info-lookup/page";
import { ipInfoLookupHead } from "@/features/tools/ip-info-lookup/head";

import { IpInfoLookupSkeleton } from "@/features/tools/ip-info-lookup/skeleton";

export const Route = createFileRoute("/{-$locale}/tools/ip-info-lookup")({
  head: ipInfoLookupHead,
  pendingComponent: IpInfoLookupSkeleton,
  component: IpInfoLookup,
});
