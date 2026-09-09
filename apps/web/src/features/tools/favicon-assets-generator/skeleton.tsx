import { Skeleton } from "@heroui/react";
import { m } from "@/paraglide/messages.js";

export function FaviconAssetsGeneratorRouteSkeleton({
  label = m["common.processing"](),
}: {
  label?: string;
} = {}) {
  return (
    <div
      className="grid gap-8 xl:grid-cols-[minmax(0,1.15fr)_minmax(22rem,0.85fr)]"
      aria-busy="true"
      aria-label={label}
      role="status"
    >
      <div className="grid gap-6">
        <PanelSkeleton height="h-40" />
        <PanelSkeleton height="h-[42rem]" />
      </div>
      <div className="grid gap-6 self-start">
        <PanelSkeleton height="h-56" />
        <PanelSkeleton height="h-80" result />
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
      <div className="grid gap-2 border-b border-separator p-4 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-start">
        <div className="grid gap-2">
          <Skeleton className="h-5 w-40" />
          <Skeleton className="h-4 w-4/5" />
        </div>
        {result ? (
          <div className="flex flex-wrap justify-end gap-2">
            <Skeleton className="h-9 w-20 rounded-xl" />
            <Skeleton className="h-9 w-24 rounded-xl" />
            <Skeleton className="h-9 w-28 rounded-xl" />
          </div>
        ) : null}
      </div>
      <div className="p-4">
        <Skeleton className={`${height} w-full rounded-xl`} />
      </div>
    </div>
  );
}
