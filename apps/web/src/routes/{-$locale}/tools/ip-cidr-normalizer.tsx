import { createFileRoute } from "@tanstack/react-router";
import { IpCidrNormalizerPage } from "@/features/tools/ip-cidr-normalizer/page";
import { ipCidrNormalizerHead } from "@/features/tools/ip-cidr-normalizer/head";

import { IpCidrNormalizerSkeleton } from "@/features/tools/ip-cidr-normalizer/skeleton";

export const Route = createFileRoute("/{-$locale}/tools/ip-cidr-normalizer")({
  head: ipCidrNormalizerHead,
  pendingComponent: IpCidrNormalizerSkeleton,
  component: IpCidrNormalizerPage,
});
