import { createFileRoute } from "@tanstack/react-router";
import { BusinessDaysCalculator } from "@/features/tools/business-days-calculator/page";
import { businessDaysCalculatorHead } from "@/features/tools/business-days-calculator/head";

import { BusinessDaysCalculatorRouteSkeleton } from "@/features/tools/business-days-calculator/skeleton";

export const Route = createFileRoute(
  "/{-$locale}/tools/business-days-calculator",
)({
  head: businessDaysCalculatorHead,
  pendingComponent: BusinessDaysCalculatorRouteSkeleton,
  component: BusinessDaysCalculator,
});
