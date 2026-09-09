import { Skeleton } from "@heroui/react";

export function SqlFormatterSkeleton() {
  return (
    <div className="grid gap-6" aria-busy="true" data-tool-panels>
      <div className="grid gap-6 xl:grid-cols-2">
        <div className="grid gap-4 rounded-2xl border border-border p-4 sm:p-6">
          <Skeleton className="h-6 w-40" />
          <Skeleton className="h-112" />
        </div>
        <div className="grid gap-4 rounded-2xl border border-border p-4 sm:p-6">
          <Skeleton className="h-6 w-40" />
          <Skeleton className="h-112" />
        </div>
      </div>
      <div className="grid gap-6 xl:grid-cols-2">
        <Skeleton className="h-152 rounded-xl" />
        <Skeleton className="h-152 rounded-xl" />
      </div>
    </div>
  );
}
