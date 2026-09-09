import { createFileRoute } from "@tanstack/react-router";
import Timer from "@/features/tools/timer/page";
import { timerHead } from "@/features/tools/timer/head";

import { TimerSkeleton } from "@/features/tools/timer/skeleton";

export const Route = createFileRoute("/{-$locale}/tools/timer")({
  head: timerHead,
  pendingComponent: TimerSkeleton,
  component: Timer,
});
