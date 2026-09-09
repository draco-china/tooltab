import { Skeleton } from "@heroui/react";
import { m } from "@/paraglide/messages.js";
export function MorseCodeConverterRouteSkeleton({
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
      <div className="overflow-hidden rounded-xl bg-surface shadow-surface">
        <div className="border-b border-separator p-4">
          <Skeleton className="h-5 w-48" />
        </div>
        <div className="grid gap-5 p-4">
          <Skeleton className="h-52 w-full rounded-xl" />
          <Skeleton className="h-52 w-full rounded-xl" />
          <Skeleton className="h-16 w-full" />
        </div>
      </div>
      <Skeleton className="h-32 w-full" />
    </div>
  );
}
