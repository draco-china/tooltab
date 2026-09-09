import { Skeleton } from "@heroui/react";
import { m } from "@/paraglide/messages.js";
export function CityHash64RouteSkeleton({
  label = m["common.processing"](),
}: {
  label?: string;
} = {}) {
  return (
    <main className="grid gap-8" aria-busy="true">
      <Skeleton className="h-20 w-full" />
      <div
        role="status"
        aria-label={label}
        className="grid gap-6 xl:grid-cols-2"
      >
        <span className="sr-only">{label}</span>
        <Skeleton className="h-128 rounded-xl" />
        <Skeleton className="h-128 rounded-xl" />
      </div>
    </main>
  );
}
