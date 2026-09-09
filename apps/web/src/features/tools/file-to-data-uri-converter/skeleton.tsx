import { Skeleton } from "@heroui/react";
import { m } from "@/paraglide/messages.js";

export function FileToDataUriConverterRouteSkeleton({
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
      <div className="grid gap-6 xl:grid-cols-[minmax(0,22rem)_minmax(0,1fr)]">
        <PanelSkeleton />
        <PanelSkeleton result />
      </div>
      <div className="grid gap-3">
        <Skeleton className="h-7 w-64" />
        <Skeleton className="h-4 w-full" />
        <Skeleton className="h-4 w-5/6" />
      </div>
    </div>
  );
}
function PanelSkeleton({ result = false }: { result?: boolean }) {
  return (
    <div className="overflow-hidden rounded-xl bg-surface shadow-surface">
      <div className="grid gap-2 border-b border-separator p-4">
        <Skeleton className="h-5 w-32" />
        <Skeleton className="h-4 w-4/5" />
      </div>
      <div className="p-4">
        <Skeleton className={`${result ? "h-72" : "h-44"} w-full rounded-xl`} />
      </div>
    </div>
  );
}
