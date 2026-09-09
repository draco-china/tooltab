import { createFileRoute } from "@tanstack/react-router";
import TimeZoneConverter from "@/features/tools/time-zone-converter/page";
import { timeZoneConverterHead } from "@/features/tools/time-zone-converter/head";

import { TimeZoneConverterSkeleton } from "@/features/tools/time-zone-converter/skeleton";

export const Route = createFileRoute("/{-$locale}/tools/time-zone-converter")({
  head: timeZoneConverterHead,
  pendingComponent: TimeZoneConverterSkeleton,
  component: TimeZoneConverter,
});
