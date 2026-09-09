import { createFileRoute } from "@tanstack/react-router";
import { DurationCalculator } from "@/features/tools/duration-calculator/page";
import { durationCalculatorHead } from "@/features/tools/duration-calculator/head";

import { DurationRouteSkeleton } from "@/features/tools/duration-calculator/skeleton";

export const Route = createFileRoute("/{-$locale}/tools/duration-calculator")({
  head: durationCalculatorHead,
  pendingComponent: DurationRouteSkeleton,
  component: DurationCalculator,
});
