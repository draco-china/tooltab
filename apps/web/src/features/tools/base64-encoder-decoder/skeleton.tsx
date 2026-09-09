import { Skeleton } from "@heroui/react";

export function Base64EncoderDecoderSkeleton() {
  return (
    <main className="flex flex-col gap-8 sm:gap-10" aria-busy="true">
      <div className="grid gap-3">
        <Skeleton className="h-9 w-96 max-w-3/4" />
        <Skeleton className="h-5 w-full max-w-2xl" />
      </div>
      <div className="grid gap-6 lg:grid-cols-2">
        <PanelSkeleton />
        <PanelSkeleton />
      </div>
      <div className="grid gap-3">
        <Skeleton className="h-7 w-56" />
        <Skeleton className="h-4 w-full" />
        <Skeleton className="h-4 w-5/6" />
      </div>
    </main>
  );
}

function PanelSkeleton() {
  return (
    <div className="overflow-hidden rounded-xl bg-surface shadow-surface">
      <div className="grid gap-2 border-b border-separator p-4">
        <Skeleton className="h-5 w-32" />
        <Skeleton className="h-4 w-3/4" />
      </div>
      <div className="p-4">
        <Skeleton className="h-64 w-full rounded-xl" />
      </div>
      <div className="flex justify-end gap-3 border-t border-separator p-4">
        <Skeleton className="h-9 w-28" />
      </div>
    </div>
  );
}
