import { Skeleton } from "@heroui/react";
import { m } from "@/paraglide/messages.js";
export function RandomPasswordGeneratorRouteSkeleton({
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
      <div className="grid gap-6 xl:grid-cols-2">
        <Panel h="h-80" />
        <Panel h="h-80" result />
      </div>
      <Skeleton className="h-28 w-full" />
    </div>
  );
}
function Panel({ h, result = false }: { h: string; result?: boolean }) {
  return (
    <div className="overflow-hidden rounded-xl bg-surface shadow-surface">
      <div className="flex items-start justify-between gap-3 border-b border-separator p-4">
        <Skeleton className="h-5 w-32" />
        {result ? (
          <div className="flex gap-1">
            <Skeleton className="h-8 w-24 rounded-lg" />
            <Skeleton className="h-8 w-16 rounded-lg" />
          </div>
        ) : null}
      </div>
      <div className="p-4">
        <Skeleton className={`${h} w-full rounded-xl`} />
      </div>
    </div>
  );
}
