import { Skeleton } from "@heroui/react";
import { m } from "@/paraglide/messages.js";

export function Base85DecoderSkeleton({
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
        <PanelSkeleton input />
        <PanelSkeleton />
      </div>
      <Skeleton className="h-44 rounded-xl" />
    </main>
  );
}

function PanelSkeleton({ input = false }: { input?: boolean }) {
  return (
    <div className="grid min-h-136 content-start gap-4 overflow-hidden rounded-xl bg-surface p-4 shadow-surface">
      <Skeleton className="h-5 w-32" />
      <Skeleton className="h-4 w-3/4" />
      {input ? <Skeleton className="h-16 w-full rounded-xl" /> : null}
      <Skeleton className="h-72 w-full rounded-xl" />
      <div className="mt-auto grid gap-3">
        {input ? <Skeleton className="h-28 w-full rounded-2xl" /> : null}
        <div className="flex justify-end gap-3">
          <Skeleton className="h-9 w-20" />
          <Skeleton className="h-9 w-28" />
        </div>
      </div>
    </div>
  );
}
