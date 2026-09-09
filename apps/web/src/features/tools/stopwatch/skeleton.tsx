import { Skeleton } from "@heroui/react";

export function StopwatchSkeleton() {
  return (
    <div className="grid gap-6" data-tool-panels aria-busy="true">
      <Skeleton className="h-72 rounded-xl" />
      <div className="grid h-80 content-start gap-4 rounded-xl bg-surface p-4 shadow-surface">
        <div className="flex items-start justify-between gap-3">
          <div className="grid gap-2">
            <Skeleton className="h-5 w-32" />
            <Skeleton className="h-4 w-48" />
          </div>
          <Skeleton className="h-9 w-40" />
        </div>
        <Skeleton className="h-40 w-full" />
      </div>
    </div>
  );
}
