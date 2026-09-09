import { Skeleton } from "@heroui/react";
export function PngOptimizerSkeleton() {
  return (
    <div className="grid gap-6 xl:grid-cols-2" aria-busy="true">
      <div className="grid h-144 content-start gap-4 rounded-xl bg-surface p-4 shadow-surface">
        <div className="flex items-start justify-between gap-3">
          <div className="grid gap-2">
            <Skeleton className="h-5 w-32" />
            <Skeleton className="h-4 w-48" />
          </div>
          <Skeleton className="h-9 w-36" />
        </div>
        <Skeleton className="h-96 w-full" />
      </div>
      <Skeleton className="h-144 rounded-xl" />
    </div>
  );
}
