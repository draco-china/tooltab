import { Skeleton } from "@heroui/react";
export function RandomNumberGeneratorSkeleton() {
  return (
    <div
      className="grid gap-6 xl:grid-cols-[minmax(0,22rem)_minmax(0,1fr)]"
      aria-busy="true"
    >
      <Skeleton className="h-136 rounded-xl" />
      <div className="grid gap-6">
        <Skeleton className="h-72 rounded-xl" />
        <Skeleton className="h-56 rounded-xl" />
      </div>
    </div>
  );
}
