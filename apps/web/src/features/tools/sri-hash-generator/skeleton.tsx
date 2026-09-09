import { Skeleton } from "@heroui/react";
import { m } from "@/paraglide/messages.js";

export function SriHashGeneratorSkeleton({
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
      <div className="grid gap-6">
        <Skeleton className="h-112 rounded-xl" />
        <Skeleton className="h-96 rounded-xl" />
      </div>
      <Skeleton className="h-64 rounded-xl" />
    </div>
  );
}
