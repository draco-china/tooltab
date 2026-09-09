import { Skeleton } from "@heroui/react";
export function TextStatisticsSkeleton() {
  return (
    <div className="grid gap-6" data-tool-panels aria-busy="true">
      <Skeleton className="h-112 rounded-xl" />
      <Skeleton className="h-64 rounded-xl" />
      <div className="grid gap-6 lg:grid-cols-2">
        <Skeleton className="h-64 rounded-xl" />
        <Skeleton className="h-64 rounded-xl" />
      </div>
      <Skeleton className="h-48 rounded-xl" />
    </div>
  );
}
