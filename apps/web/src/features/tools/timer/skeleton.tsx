import { Skeleton } from "@heroui/react";

export function TimerSkeleton() {
  return (
    <div className="grid gap-6" aria-busy="true" data-tool-panels>
      <Skeleton className="h-72 rounded-xl" />
      <Skeleton className="h-56 rounded-xl" />
      <Skeleton className="h-64 rounded-xl" />
    </div>
  );
}
