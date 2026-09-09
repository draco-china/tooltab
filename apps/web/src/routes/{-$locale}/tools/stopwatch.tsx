import { createFileRoute } from "@tanstack/react-router";
import Stopwatch from "@/features/tools/stopwatch/page";
import { stopwatchHead } from "@/features/tools/stopwatch/head";

import { StopwatchSkeleton } from "@/features/tools/stopwatch/skeleton";

export const Route = createFileRoute("/{-$locale}/tools/stopwatch")({
  head: stopwatchHead,
  pendingComponent: StopwatchSkeleton,
  component: Stopwatch,
});
