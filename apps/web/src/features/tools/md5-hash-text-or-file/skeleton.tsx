import { Skeleton } from "@heroui/react";
import { m } from "@/paraglide/messages.js";

export function Md5HashSkeleton({
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
      <div role="status" aria-label={label} className="grid gap-6">
        <span className="sr-only">{label}</span>
        <PanelSkeleton contentHeight="h-72" />
        <PanelSkeleton contentHeight="h-[28rem]" />
      </div>
      <div className="grid gap-3">
        <Skeleton className="h-7 w-48" />
        <Skeleton className="h-4 w-full" />
        <Skeleton className="h-4 w-11/12" />
      </div>
    </main>
  );
}

function PanelSkeleton({ contentHeight }: { contentHeight: string }) {
  return (
    <div className="overflow-hidden rounded-xl bg-surface shadow-surface">
      <div className="grid gap-2 border-b border-separator p-4">
        <Skeleton className="h-5 w-36" />
        <Skeleton className="h-4 w-4/5" />
      </div>
      <div className="p-4">
        <Skeleton className={`${contentHeight} w-full rounded-xl`} />
      </div>
    </div>
  );
}
