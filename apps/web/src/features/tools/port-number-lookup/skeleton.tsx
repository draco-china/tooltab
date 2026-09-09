import { Skeleton } from "@heroui/react";
export function PortNumberLookupSkeleton() {
  return (
    <div
      className="grid gap-6 xl:grid-cols-[minmax(0,20rem)_minmax(0,1fr)]"
      aria-busy="true"
    >
      <Skeleton className="h-64 rounded-xl" />
      <Skeleton className="h-152 rounded-xl" />
    </div>
  );
}
