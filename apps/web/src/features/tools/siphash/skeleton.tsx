import { Skeleton } from "@heroui/react";
import { m } from "@/paraglide/messages.js";

export function SipHashRouteSkeleton({
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
      <Skeleton className="h-48 rounded-xl" />
      <div className="grid gap-6 lg:grid-cols-2">
        <Skeleton className="h-120 rounded-xl" />
        <Skeleton className="h-120 rounded-xl" />
      </div>
    </div>
  );
}
