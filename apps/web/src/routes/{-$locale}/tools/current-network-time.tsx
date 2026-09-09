import { createFileRoute } from "@tanstack/react-router";
import CurrentNetworkTime from "@/features/tools/current-network-time/page";
import { currentNetworkTimeHead } from "@/features/tools/current-network-time/head";

import { CurrentNetworkTimeRouteSkeleton } from "@/features/tools/current-network-time/skeleton";

export const Route = createFileRoute("/{-$locale}/tools/current-network-time")({
  head: currentNetworkTimeHead,
  pendingComponent: CurrentNetworkTimeRouteSkeleton,
  component: CurrentNetworkTime,
});
