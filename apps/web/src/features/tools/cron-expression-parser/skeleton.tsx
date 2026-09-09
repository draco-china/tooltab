import { Skeleton } from "@heroui/react";
import { m } from "@/paraglide/messages.js";

export function CronExpressionParserRouteSkeleton({
  label = m["common.processing"](),
}: {
  label?: string;
} = {}) {
  return (
    <div
      className="grid gap-8"
      role="status"
      aria-busy="true"
      aria-label={label}
    >
      <div className="grid gap-6 xl:grid-cols-[minmax(0,22rem)_minmax(0,1fr)]">
        <PanelSkeleton compact />
        <PanelSkeleton />
      </div>
      <div className="grid gap-3">
        <Skeleton className="h-7 w-64" />
        <Skeleton className="h-4 w-full" />
        <Skeleton className="h-4 w-5/6" />
      </div>
    </div>
  );
}

function PanelSkeleton({ compact = false }: { compact?: boolean }) {
  return (
    <div className="overflow-hidden rounded-xl bg-surface shadow-surface">
      <div className="grid gap-2 border-b border-separator p-4">
        <Skeleton className="h-5 w-40" />
        <Skeleton className="h-4 w-4/5" />
      </div>
      <div className="grid gap-4 p-4">
        <Skeleton className="h-11 w-full rounded-xl" />
        <Skeleton
          className={`${compact ? "h-72" : "h-96"} w-full rounded-xl`}
        />
      </div>
    </div>
  );
}
