import { createFileRoute } from "@tanstack/react-router";
import CronExpressionParserPage from "@/features/tools/cron-expression-parser/page";
import { cronExpressionParserHead } from "@/features/tools/cron-expression-parser/head";

import { CronExpressionParserRouteSkeleton } from "@/features/tools/cron-expression-parser/skeleton";

export const Route = createFileRoute(
  "/{-$locale}/tools/cron-expression-parser",
)({
  head: cronExpressionParserHead,
  pendingComponent: CronExpressionParserRouteSkeleton,
  component: CronExpressionParserPage,
});
