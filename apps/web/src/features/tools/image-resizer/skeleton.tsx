import { Skeleton } from "@heroui/react";
import { m } from "@/paraglide/messages.js";
export function ImageResizerRouteSkeleton({
  label = m["common.processing"](),
}: {
  label?: string;
} = {}) {
  return (
    <main className="grid gap-8" aria-busy="true">
      <div className="grid gap-3">
        <Skeleton className="h-9 w-80" />
        <Skeleton className="h-5 w-full max-w-2xl" />
      </div>
      <div
        role="status"
        aria-label={label}
        className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_24rem]"
      >
        <span className="sr-only">{label}</span>
        <PanelSkeleton />
        <PanelSkeleton result />
      </div>
    </main>
  );
}

function PanelSkeleton({ result = false }: { result?: boolean }) {
  return (
    <div className="flex h-160 flex-col gap-4 rounded-xl bg-surface p-4 shadow-surface">
      <div className="grid gap-2 border-b border-separator pb-4 sm:grid-cols-[minmax(0,1fr)_auto]">
        <div className="grid gap-2">
          <Skeleton className="h-5 w-40" />
          <Skeleton className="h-4 w-3/4" />
        </div>
        {result ? <Skeleton className="h-9 w-24" /> : null}
      </div>
      <Skeleton className="flex-1" />
    </div>
  );
}
