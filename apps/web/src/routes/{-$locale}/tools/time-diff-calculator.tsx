import { createFileRoute } from "@tanstack/react-router";
import { TimeDiffCalculator } from "@/features/tools/time-diff-calculator/page";
import { timeDiffCalculatorHead } from "@/features/tools/time-diff-calculator/head";

import { TimeDiffCalculatorSkeleton } from "@/features/tools/time-diff-calculator/skeleton";

export const Route = createFileRoute("/{-$locale}/tools/time-diff-calculator")({
  head: timeDiffCalculatorHead,
  pendingComponent: TimeDiffCalculatorSkeleton,
  component: TimeDiffCalculator,
});
