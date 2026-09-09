import { Skeleton } from "@heroui/react";

export function TextDiffSkeleton() {
  return (
    <div className="grid gap-6" aria-busy="true">
      <div className="grid gap-6 rounded-2xl border border-border p-4 sm:p-6">
        <div className="flex flex-col gap-3 border-b border-separator pb-4 sm:flex-row sm:items-start sm:justify-between">
          <div className="grid gap-2">
            <Skeleton className="h-6 w-40" />
            <Skeleton className="h-4 w-72 max-w-full" />
          </div>
          <div className="flex flex-wrap justify-end gap-2">
            <Skeleton className="h-9 w-24 rounded-xl" />
            <Skeleton className="h-9 w-24 rounded-xl" />
            <Skeleton className="h-9 w-24 rounded-xl" />
          </div>
        </div>
        <div className="grid gap-4 lg:grid-cols-2">
          <Skeleton className="h-80" />
          <Skeleton className="h-80" />
        </div>
        <div className="grid gap-4 border-t border-separator pt-5 lg:grid-cols-2">
          <Skeleton className="h-10 w-48" />
          <div className="grid gap-3 sm:grid-cols-3">
            <Skeleton className="h-8 w-full" />
            <Skeleton className="h-8 w-full" />
            <Skeleton className="h-8 w-full" />
          </div>
        </div>
      </div>
      <Skeleton className="h-32 rounded-2xl" />
      <Skeleton className="h-80 rounded-2xl" />
    </div>
  );
}
