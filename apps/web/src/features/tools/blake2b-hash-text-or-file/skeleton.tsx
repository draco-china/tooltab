import { Skeleton } from "@heroui/react";
import { m } from "@/paraglide/messages.js";
export function Blake2bHashTextOrFileRouteSkeleton({
  label = m["common.processing"](),
}: {
  label?: string;
} = {}) {
  return (
    <main className="flex flex-col gap-8" aria-busy="true">
      <div className="grid gap-3">
        <Skeleton className="h-9 w-80 max-w-3/4" />
        <Skeleton className="h-5 w-full max-w-2xl" />
      </div>
      <div role="status" aria-label={label} className="grid gap-6">
        <span className="sr-only">{label}</span>
        <Skeleton className="h-56 rounded-xl" />
        <Skeleton className="h-96 rounded-xl" />
        <Skeleton className="h-136 rounded-xl" />
      </div>
    </main>
  );
}
