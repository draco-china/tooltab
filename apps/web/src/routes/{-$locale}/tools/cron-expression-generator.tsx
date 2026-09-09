import { createFileRoute } from "@tanstack/react-router";
import CronExpressionGeneratorPage from "@/features/tools/cron-expression-generator/page";
import { cronExpressionGeneratorHead } from "@/features/tools/cron-expression-generator/head";

import { CronExpressionGeneratorRouteSkeleton } from "@/features/tools/cron-expression-generator/skeleton";

export const Route = createFileRoute(
  "/{-$locale}/tools/cron-expression-generator",
)({
  head: cronExpressionGeneratorHead,
  pendingComponent: CronExpressionGeneratorRouteSkeleton,
  component: CronExpressionGeneratorPage,
});
