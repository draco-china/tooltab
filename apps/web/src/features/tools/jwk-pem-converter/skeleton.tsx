import { Skeleton } from "@heroui/react";

export function JwkPemConverterSkeleton() {
  return (
    <div className="grid gap-6" aria-busy="true">
      <div className="grid gap-6 rounded-2xl border border-border p-4 sm:p-6">
        <div className="flex justify-between gap-3">
          <Skeleton className="h-6 w-40" />
          <Skeleton className="h-9 w-24 rounded-xl" />
        </div>
        <div className="grid gap-4 lg:grid-cols-2">
          <Skeleton className="h-96" />
          <Skeleton className="h-96" />
        </div>
      </div>
      <div className="grid gap-4 rounded-2xl border border-border p-4 sm:p-6">
        <Skeleton className="h-6 w-40" />
        <Skeleton className="h-80" />
      </div>
    </div>
  );
}
