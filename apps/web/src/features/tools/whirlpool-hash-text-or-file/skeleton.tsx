import { Skeleton } from "@heroui/react";
import { m } from "@/paraglide/messages.js";

export function WhirlpoolHashTextOrFileRouteSkeleton({
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
      <PanelSkeleton height="h-72" />
      <PanelSkeleton height="h-[28rem]" />
    </div>
  );
}
function PanelSkeleton({ height }: { height: string }) {
  return (
    <div className="overflow-hidden rounded-xl bg-surface shadow-surface">
      <div className="grid gap-2 border-b border-separator p-4">
        <Skeleton className="h-5 w-36" />
        <Skeleton className="h-4 w-4/5" />
      </div>
      <div className="p-4">
        <Skeleton className={`${height} w-full rounded-xl`} />
      </div>
    </div>
  );
}
