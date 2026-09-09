import { Skeleton } from "@heroui/react";
import { m } from "@/paraglide/messages.js";

export function UuidTimeConverterSkeleton({
  label = m["common.processing"](),
}: {
  label?: string;
} = {}) {
  return (
    <main className="flex flex-col gap-8 sm:gap-10" aria-busy="true">
      <div className="grid gap-3">
        <Skeleton className="h-9 w-80 max-w-3/4" />
        <Skeleton className="h-5 w-full max-w-2xl" />
      </div>
      <div
        role="status"
        aria-label={label}
        className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] lg:items-start"
      >
        <span className="sr-only">{label}</span>
        <PanelSkeleton />
        <Skeleton className="hidden size-12 rounded-lg lg:block" />
        <PanelSkeleton />
      </div>
      <div className="grid gap-3">
        <Skeleton className="h-4 w-full" />
        <Skeleton className="h-7 w-64" />
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
        <Skeleton className="h-5 w-24" />
        <Skeleton className="h-4 w-4/5" />
      </div>
      <div className="grid gap-2 p-4">
        <Skeleton className="h-4 w-28" />
        <Skeleton className="h-12 w-full" />
      </div>
      <div className="flex justify-end border-t border-separator p-4">
        <Skeleton className="h-9 w-32" />
      </div>
    </div>
  );
}
