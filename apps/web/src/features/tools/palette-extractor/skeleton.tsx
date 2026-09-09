import { Skeleton } from "@heroui/react";
import { m } from "@/paraglide/messages.js";

export function PaletteExtractorRouteSkeleton({
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
      <div className="grid items-start gap-6 xl:grid-cols-[minmax(0,1fr)_22rem]">
        <Skeleton className="h-128 rounded-xl" />
        <Skeleton className="h-128 rounded-xl" />
      </div>
      <Skeleton className="h-72 rounded-xl" />
      <div className="grid gap-3">
        <Skeleton className="h-7 w-64" />
        <Skeleton className="h-4 w-full" />
        <Skeleton className="h-4 w-5/6" />
      </div>
    </div>
  );
}
