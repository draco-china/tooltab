import { Skeleton } from "@heroui/react";
import { m } from "@/paraglide/messages.js";

export function BasicAuthGeneratorRouteSkeleton({
  label = m["common.processing"](),
}: {
  label?: string;
} = {}) {
  return (
    <main className="grid gap-8 sm:gap-10" aria-busy="true">
      <div className="grid gap-3">
        <Skeleton className="h-9 w-72 max-w-3/4" />
        <Skeleton className="h-5 w-full max-w-2xl" />
      </div>
      <div role="status" aria-label={label} className="grid gap-6">
        <span className="sr-only">{label}</span>
        <Skeleton className="h-72 rounded-xl" />
        <div className="grid gap-6">
          <Skeleton className="h-56 rounded-xl" />
          <Skeleton className="h-60 rounded-xl" />
        </div>
      </div>
    </main>
  );
}
