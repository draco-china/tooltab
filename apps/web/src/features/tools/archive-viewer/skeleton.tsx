import { Skeleton } from "@heroui/react";
import { m } from "@/paraglide/messages.js";

export function ArchiveViewerRouteSkeleton({
  label = m["common.processing"](),
}: {
  label?: string;
} = {}) {
  return (
    <div
      className="grid gap-6"
      role="status"
      aria-busy="true"
      aria-label={label}
    >
      <div className="grid gap-6">
        <div className="grid gap-4 rounded-xl bg-surface p-4 shadow-surface">
          <div className="grid gap-2 border-b border-separator pb-4 sm:grid-cols-[minmax(0,1fr)_auto]">
            <Skeleton className="h-5 w-40" />
            <Skeleton className="h-5 w-32 rounded-full" />
          </div>
          <Skeleton className="h-24 rounded-xl" />
        </div>
        <div className="grid gap-4 rounded-xl bg-surface p-4 shadow-surface">
          <div className="grid gap-2 border-b border-separator pb-4">
            <Skeleton className="h-5 w-48" />
            <Skeleton className="h-4 w-4/5" />
          </div>
          <div className="flex flex-wrap gap-3">
            <Skeleton className="h-11 w-40 rounded-xl" />
            <Skeleton className="h-11 w-64 rounded-xl" />
          </div>
          <Skeleton className="h-128 rounded-xl" />
        </div>
      </div>
      <div className="grid gap-3">
        <Skeleton className="h-7 w-64" />
        <Skeleton className="h-4 w-full" />
        <Skeleton className="h-4 w-5/6" />
      </div>
    </div>
  );
}
