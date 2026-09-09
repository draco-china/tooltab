import { Skeleton } from "@heroui/react";

export function ScreenRecorderSkeleton() {
  return (
    <div className="grid gap-6" aria-busy="true">
      <div className="grid gap-6 lg:grid-cols-[minmax(0,1.2fr)_minmax(17.5rem,0.8fr)]">
        <Skeleton className="h-64 rounded-xl" />
        <Skeleton className="h-64 rounded-xl" />
      </div>
      <div className="overflow-hidden rounded-xl bg-surface shadow-surface">
        <div className="flex items-start justify-between gap-3 border-b border-separator p-4">
          <div className="grid gap-2">
            <Skeleton className="h-5 w-32 rounded-md" />
            <Skeleton className="h-4 w-56 rounded-md" />
          </div>
          <div className="flex gap-2">
            <Skeleton className="h-10 w-20 rounded-xl" />
            <Skeleton className="h-10 w-24 rounded-xl" />
          </div>
        </div>
        <Skeleton className="aspect-video w-full rounded-none" />
        <div className="grid gap-3 border-y border-separator px-4 py-3 sm:grid-cols-2">
          <Skeleton className="h-8 rounded-md" />
          <Skeleton className="h-8 rounded-md" />
        </div>
        <div className="grid gap-2 px-4 py-4">
          <Skeleton className="h-4 w-28 rounded-md" />
          <Skeleton className="h-11 rounded-xl" />
        </div>
      </div>
    </div>
  );
}
