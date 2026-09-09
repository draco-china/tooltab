import { Skeleton } from "@heroui/react";
import { m } from "@/paraglide/messages.js";

export function MurmurHash3RouteSkeleton({
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
      <Skeleton className="h-104 rounded-xl" />
      <Skeleton className="h-36 rounded-xl" />
      <Skeleton className="h-128 rounded-xl" />
      <Skeleton className="h-52 rounded-xl" />
    </div>
  );
}
