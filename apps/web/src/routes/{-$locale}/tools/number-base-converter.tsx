import { createFileRoute } from "@tanstack/react-router";
import NumberBaseConverter from "@/features/tools/number-base-converter/page";
import { numberBaseConverterHead } from "@/features/tools/number-base-converter/head";

import { NumberBaseConverterSkeleton } from "@/features/tools/number-base-converter/skeleton";

export const Route = createFileRoute("/{-$locale}/tools/number-base-converter")(
  {
    head: numberBaseConverterHead,
    pendingComponent: NumberBaseConverterSkeleton,
    component: NumberBaseConverter,
  },
);
