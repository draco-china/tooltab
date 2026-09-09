import { Skeleton } from "@heroui/react";
import { m } from "@/paraglide/messages.js";

export function UnitConverterRouteSkeleton({
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
      <Skeleton className="h-92 w-full rounded-xl" />
      <Skeleton className="h-112 w-full rounded-xl" />
    </div>
  );
}
