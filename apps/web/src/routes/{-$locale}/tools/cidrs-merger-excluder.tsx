import { createFileRoute } from "@tanstack/react-router";
import CidrsMergerExcluderPage from "@/features/tools/cidrs-merger-excluder/page";
import { cidrsMergerExcluderHead } from "@/features/tools/cidrs-merger-excluder/head";

import { CidrsMergerExcluderSkeleton } from "@/features/tools/cidrs-merger-excluder/skeleton";

export const Route = createFileRoute("/{-$locale}/tools/cidrs-merger-excluder")(
  {
    head: cidrsMergerExcluderHead,
    pendingComponent: CidrsMergerExcluderSkeleton,
    component: CidrsMergerExcluderPage,
  },
);
