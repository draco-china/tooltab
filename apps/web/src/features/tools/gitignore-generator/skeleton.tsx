import { Skeleton } from "@heroui/react";
import { m } from "@/paraglide/messages.js";

export function GitignoreGeneratorRouteSkeleton({
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
      <PanelSkeleton height="h-[34rem]" />
      <PanelSkeleton height="h-96" />
      <div className="grid gap-3">
        <Skeleton className="h-7 w-56" />
        <Skeleton className="h-4 w-full" />
      </div>
    </div>
  );
}
function PanelSkeleton({ height }: { height: string }) {
  return (
    <div className="overflow-hidden rounded-xl bg-surface shadow-surface">
      <div className="grid gap-2 border-b border-separator p-4">
        <Skeleton className="h-5 w-40" />
        <Skeleton className="h-4 w-4/5" />
      </div>
      <div className="p-4">
        <Skeleton className={`${height} w-full rounded-xl`} />
      </div>
    </div>
  );
}
