import { createFileRoute } from "@tanstack/react-router";
import TextStatisticsTool from "@/features/tools/text-statistics/page";
import { textStatisticsHead } from "@/features/tools/text-statistics/head";

import { TextStatisticsSkeleton } from "@/features/tools/text-statistics/skeleton";

export const Route = createFileRoute("/{-$locale}/tools/text-statistics")({
  head: textStatisticsHead,
  pendingComponent: TextStatisticsSkeleton,
  component: TextStatisticsTool,
});
