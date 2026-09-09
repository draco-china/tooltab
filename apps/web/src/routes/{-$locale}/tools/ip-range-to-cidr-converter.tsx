import { createFileRoute } from "@tanstack/react-router";
import { IpRangeToCidrPage } from "@/features/tools/ip-range-to-cidr-converter/page";
import { ipRangeToCidrConverterHead } from "@/features/tools/ip-range-to-cidr-converter/head";

import { IpRangeToCidrConverterSkeleton } from "@/features/tools/ip-range-to-cidr-converter/skeleton";

export const Route = createFileRoute(
  "/{-$locale}/tools/ip-range-to-cidr-converter",
)({
  head: ipRangeToCidrConverterHead,
  pendingComponent: IpRangeToCidrConverterSkeleton,
  component: IpRangeToCidrPage,
});
