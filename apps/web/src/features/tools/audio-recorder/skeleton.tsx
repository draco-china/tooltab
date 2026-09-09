import { Skeleton } from "@heroui/react";
import { m } from "@/paraglide/messages.js";

export function AudioRecorderRouteSkeleton({
  label = m["common.processing"](),
}: {
  label?: string;
} = {}) {
  return (
    <main className="flex flex-col gap-8 sm:gap-10" aria-busy="true">
      <div className="grid gap-3">
        <Skeleton className="h-9 w-64 max-w-3/4" />
        <Skeleton className="h-5 w-full max-w-2xl" />
      </div>
      <div
        role="status"
        aria-label={label}
        className="grid gap-6 xl:grid-cols-[minmax(0,24rem)_minmax(0,1fr)]"
      >
        <span className="sr-only">{label}</span>
        <div className="grid min-h-108 gap-5 rounded-xl bg-surface p-4 shadow-surface">
          <div className="grid gap-2 border-b border-separator pb-4">
            <Skeleton className="h-5 w-24" />
            <Skeleton className="h-4 w-full" />
          </div>
          <Skeleton className="min-h-52 w-full rounded-lg" />
          <Skeleton className="h-4 w-5/6" />
          <Skeleton className="h-4 w-3/4" />
        </div>
        <div className="grid min-h-108 content-start gap-5 rounded-xl bg-surface p-4 shadow-surface">
          <div className="border-b border-separator pb-4">
            <Skeleton className="h-5 w-24" />
          </div>
          <Skeleton className="min-h-80 w-full rounded-lg" />
        </div>
      </div>
    </main>
  );
}
