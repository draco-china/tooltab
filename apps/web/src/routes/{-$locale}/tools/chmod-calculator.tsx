import { createFileRoute } from "@tanstack/react-router";
import ChmodCalculator from "@/features/tools/chmod-calculator/page";
import { chmodCalculatorHead } from "@/features/tools/chmod-calculator/head";

import { ChmodCalculatorSkeleton } from "@/features/tools/chmod-calculator/skeleton";

export const Route = createFileRoute("/{-$locale}/tools/chmod-calculator")({
  head: chmodCalculatorHead,
  pendingComponent: ChmodCalculatorSkeleton,
  component: ChmodCalculator,
});
