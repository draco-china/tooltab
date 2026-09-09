import { Skeleton } from "@heroui/react";
export function JmespathTesterSkeleton() {
  return (
    <div className="grid gap-6" aria-busy="true">
      <Skeleton className="h-28 rounded-xl" />
      <div className="grid gap-6 xl:grid-cols-2">
        <Skeleton className="h-128 rounded-xl" />
        <Skeleton className="h-128 rounded-xl" />
      </div>
    </div>
  );
}
