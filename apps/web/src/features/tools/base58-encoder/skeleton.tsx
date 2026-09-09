import { Skeleton } from "@heroui/react";
import { m } from "@/paraglide/messages.js";

export function Base58EncoderSkeleton({
  label = m["common.processing"](),
}: {
  label?: string;
} = {}) {
  return (
    <main className="flex flex-col gap-8 sm:gap-10" aria-busy="true">
      <div className="grid gap-3">
        <Skeleton className="h-9 w-72 max-w-3/4" />
        <Skeleton className="h-5 w-full max-w-2xl" />
      </div>
      <div
        role="status"
        aria-label={label}
        className="grid gap-6 xl:grid-cols-[minmax(0,24rem)_minmax(0,1fr)]"
      >
        <span className="sr-only">{label}</span>
        {[0, 1].map((panel) => (
          <div
            key={panel}
            className="grid min-h-124 content-start gap-4 overflow-hidden rounded-xl bg-surface p-4 shadow-surface"
          >
            <div className="grid gap-2 border-b border-separator pb-4">
              <Skeleton className="h-5 w-28" />
              <Skeleton className="h-4 w-4/5" />
            </div>
            <Skeleton className="h-11 w-full" />
            <Skeleton className="min-h-64 w-full rounded-lg" />
            <div className="mt-auto flex justify-end gap-3 border-t border-separator pt-4">
              <Skeleton className="h-9 w-24" />
              <Skeleton className="h-9 w-28" />
            </div>
          </div>
        ))}
      </div>
      <div className="grid gap-3">
        <Skeleton className="h-7 w-64" />
        <Skeleton className="h-4 w-full" />
        <Skeleton className="h-4 w-5/6" />
      </div>
    </main>
  );
}
