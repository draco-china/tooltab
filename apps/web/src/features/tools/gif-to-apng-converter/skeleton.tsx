import { Skeleton } from "@heroui/react";
import { m } from "@/paraglide/messages.js";

export function GifToApngConverterRouteSkeleton({
  label = m["common.processing"](),
}: {
  label?: string;
} = {}) {
  return (
    <div
      className="grid gap-8"
      aria-busy="true"
      aria-label={label}
      role="status"
    >
      <div className="grid gap-6 xl:grid-cols-2">
        <PanelSkeleton height="h-64" />
        <PanelSkeleton height="h-64" />
      </div>
      <PanelSkeleton height="h-72" result />
      <div className="grid gap-3">
        <Skeleton className="h-7 w-56" />
        <Skeleton className="h-4 w-full" />
      </div>
    </div>
  );
}
function PanelSkeleton({
  height,
  result = false,
}: {
  height: string;
  result?: boolean;
}) {
  return (
    <div className="overflow-hidden rounded-xl bg-surface shadow-surface">
      <div className="grid gap-2 border-b border-separator p-4">
        <Skeleton className="h-5 w-40" />
        <div className="grid gap-2 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-start">
          <Skeleton className="h-4 w-4/5" />
          {result ? <Skeleton className="h-9 w-24" /> : null}
        </div>
      </div>
      <div className="p-4">
        <Skeleton className={`${height} w-full rounded-xl`} />
      </div>
    </div>
  );
}
