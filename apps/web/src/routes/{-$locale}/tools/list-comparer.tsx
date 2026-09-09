import { createFileRoute } from "@tanstack/react-router";
import ListComparerPage from "@/features/tools/list-comparer/page";
import { listComparerHead } from "@/features/tools/list-comparer/head";

import { ListComparerRouteSkeleton } from "@/features/tools/list-comparer/skeleton";

export const Route = createFileRoute("/{-$locale}/tools/list-comparer")({
  head: listComparerHead,
  pendingComponent: ListComparerRouteSkeleton,
  component: ListComparerPage,
});
