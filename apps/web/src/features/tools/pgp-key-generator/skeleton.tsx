import { Skeleton } from "@heroui/react";
export function PgpKeyGeneratorSkeleton() {
  return (
    <div
      className="grid gap-6 xl:grid-cols-[minmax(0,24rem)_minmax(0,1fr)]"
      aria-busy="true"
    >
      <Skeleton className="h-152 rounded-xl" />
      <div className="grid h-152 content-start gap-4 rounded-xl bg-surface p-4 shadow-surface">
        <div className="flex items-start justify-between gap-3">
          <div className="grid gap-2">
            <Skeleton className="h-5 w-40" />
            <Skeleton className="h-4 w-48" />
          </div>
          <Skeleton className="h-9 w-32" />
        </div>
        <Skeleton className="h-128 w-full" />
      </div>
    </div>
  );
}
