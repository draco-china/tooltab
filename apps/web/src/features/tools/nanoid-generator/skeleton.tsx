import { Skeleton } from "@heroui/react";

export function NanoidGeneratorSkeleton() {
  return (
    <main className="flex flex-col gap-8 sm:gap-10" aria-busy="true">
      <div className="grid gap-3">
        <Skeleton className="h-9 w-80 max-w-3/4" />
        <Skeleton className="h-5 w-full max-w-3xl" />
      </div>
      <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_minmax(0,1.05fr)]">
        <Skeleton className="h-136 rounded-xl" />
        <Skeleton className="h-136 rounded-xl" />
      </div>
      <Skeleton className="h-72 rounded-xl" />
    </main>
  );
}
