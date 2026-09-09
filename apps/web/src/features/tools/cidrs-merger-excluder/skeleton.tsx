import { Skeleton } from "@heroui/react";

export function CidrsMergerExcluderSkeleton() {
  return (
    <main className="flex flex-col gap-8 sm:gap-10" aria-busy="true">
      <div className="grid gap-3">
        <Skeleton className="h-9 w-96 max-w-3/4" />
        <Skeleton className="h-5 w-full max-w-3xl" />
      </div>
      <div className="grid gap-6 xl:grid-cols-[minmax(0,24rem)_minmax(0,1fr)]">
        <Skeleton className="h-152 w-full rounded-xl" />
        <Skeleton className="h-152 w-full rounded-xl" />
      </div>
    </main>
  );
}
