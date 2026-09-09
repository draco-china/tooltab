import { Skeleton } from "@heroui/react";
export function TimeDiffCalculatorSkeleton() {
  return (
    <div className="grid gap-6" aria-busy="true">
      <div className="grid gap-6 md:grid-cols-2">
        <Skeleton className="h-64 rounded-xl" />
        <Skeleton className="h-64 rounded-xl" />
      </div>
      <Skeleton className="h-52 rounded-xl" />
    </div>
  );
}
