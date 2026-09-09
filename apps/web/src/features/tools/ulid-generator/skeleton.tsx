import { Skeleton } from "@heroui/react";
import { m } from "@/paraglide/messages.js";

export function UlidGeneratorSkeleton({
  label = m["common.processing"](),
}: {
  label?: string;
} = {}) {
  return (
    <div
      role="status"
      aria-label={label}
      aria-busy="true"
      className="grid gap-8"
    >
      <span className="sr-only">{label}</span>
      <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_minmax(0,1.05fr)]">
        <Skeleton className="h-136 rounded-xl" />
        <Skeleton className="h-136 rounded-xl" />
      </div>
      <Skeleton className="h-64 rounded-xl" />
    </div>
  );
}
