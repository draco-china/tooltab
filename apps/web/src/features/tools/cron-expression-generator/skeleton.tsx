import { Skeleton } from "@heroui/react";
import { m } from "@/paraglide/messages.js";

export function CronExpressionGeneratorRouteSkeleton({
  label = m["common.processing"](),
}: {
  label?: string;
} = {}) {
  return (
    <div
      className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_minmax(22rem,0.85fr)]"
      role="status"
      aria-busy="true"
      aria-label={label}
    >
      <div className="grid gap-6">
        <PanelSkeleton height="h-64" />
        <PanelSkeleton height="h-36" />
        {["seconds", "minutes", "hours", "month", "weekday"].map((part) => (
          <PanelSkeleton key={part} height="h-44" />
        ))}
      </div>
      <PanelSkeleton height="h-96" />
    </div>
  );
}

function PanelSkeleton({ height }: { height: string }) {
  return (
    <div className="overflow-hidden rounded-xl bg-surface shadow-surface">
      <div className="grid gap-2 border-b border-separator p-4">
        <Skeleton className="h-5 w-40" />
        <Skeleton className="h-4 w-3/4" />
      </div>
      <div className="p-4">
        <Skeleton className={`${height} w-full rounded-xl`} />
      </div>
    </div>
  );
}
