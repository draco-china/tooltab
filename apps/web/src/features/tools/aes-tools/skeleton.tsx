import { Skeleton } from "@heroui/react";
import { m } from "@/paraglide/messages.js";

export function AesToolSkeleton({
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
      <div className="grid gap-6 lg:grid-cols-2 lg:items-start">
        <div className="grid gap-6">
          <Skeleton className="h-112 rounded-xl" />
          <Skeleton className="h-64 rounded-xl" />
          <Skeleton className="h-112 rounded-xl" />
        </div>
        <Skeleton className="h-152 rounded-xl" />
      </div>
      <div className="grid gap-3">
        <Skeleton className="h-7 w-64" />
        <Skeleton className="h-4 w-full" />
        <Skeleton className="h-4 w-5/6" />
      </div>
    </div>
  );
}
