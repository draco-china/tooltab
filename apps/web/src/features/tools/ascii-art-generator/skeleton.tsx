import { Skeleton } from "@heroui/react";
import { m } from "@/paraglide/messages.js";

function PanelSkeleton({ className = "" }: { className?: string }) {
  return (
    <div
      className={`flex flex-col overflow-hidden rounded-xl bg-surface shadow-surface ${className}`}
    >
      <div className="grid gap-2 border-b border-separator p-4">
        <Skeleton className="h-5 w-28" />
        <Skeleton className="h-4 w-3/4" />
      </div>
      <div className="grid flex-1 gap-3 p-4">
        <Skeleton className="h-full min-h-24 w-full" />
      </div>
    </div>
  );
}

export function AsciiArtGeneratorRouteSkeleton({
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
      <div role="status" aria-label={label} className="grid gap-6">
        <span className="sr-only">{label}</span>
        <div className="grid items-start gap-6 xl:grid-cols-[minmax(0,1fr)_20rem]">
          <PanelSkeleton className="min-h-108" />
          <div className="grid gap-6">
            <PanelSkeleton className="min-h-36" />
            <PanelSkeleton className="min-h-64" />
          </div>
        </div>
        <PanelSkeleton className="min-h-108" />
      </div>
    </main>
  );
}
