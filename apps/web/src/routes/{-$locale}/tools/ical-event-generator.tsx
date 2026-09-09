import { createFileRoute } from "@tanstack/react-router";
import IcalEventGenerator from "@/features/tools/ical-event-generator/page";
import { icalEventGeneratorHead } from "@/features/tools/ical-event-generator/head";

import { IcalEventRouteSkeleton } from "@/features/tools/ical-event-generator/skeleton";

export const Route = createFileRoute("/{-$locale}/tools/ical-event-generator")({
  head: icalEventGeneratorHead,
  pendingComponent: IcalEventRouteSkeleton,
  component: IcalEventGenerator,
});
