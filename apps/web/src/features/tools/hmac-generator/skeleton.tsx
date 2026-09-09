import { Skeleton } from "@heroui/react";

export function HmacGeneratorSkeleton() {
  return (
    <main className="flex flex-col gap-8 sm:gap-10" aria-busy="true">
      <div className="grid gap-3">
        <Skeleton className="h-9 w-80 max-w-3/4" />
        <Skeleton className="h-5 w-full max-w-3xl" />
      </div>
      <div className="grid gap-6">
        {[0, 1, 2].map((panel) => (
          <div
            key={panel}
            className="overflow-hidden rounded-xl bg-surface shadow-surface"
          >
            <div className="grid gap-2 border-b border-separator p-4">
              <Skeleton className="h-5 w-36" />
              <Skeleton className="h-4 w-3/4" />
            </div>
            <div className="grid gap-4 p-4">
              <Skeleton className="h-11 w-full rounded-xl" />
              <Skeleton className="h-40 w-full rounded-xl" />
            </div>
          </div>
        ))}
      </div>
      <Skeleton className="h-64 w-full rounded-xl" />
    </main>
  );
}
