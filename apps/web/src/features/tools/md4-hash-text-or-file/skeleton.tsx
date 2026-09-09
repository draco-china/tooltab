import { Skeleton } from "@heroui/react";
import { m } from "@/paraglide/messages.js";

export function Md4HashRouteSkeleton({
  label = m["common.processing"](),
}: {
  label?: string;
} = {}) {
  return (
    <main className="grid gap-8" aria-busy="true">
      <div className="grid gap-3">
        <Skeleton className="h-9 w-80" />
        <Skeleton className="h-5 w-full max-w-2xl" />
      </div>
      <div role="status" aria-label={label} className="grid gap-6">
        <span className="sr-only">{label}</span>
        <Skeleton className="h-100 rounded-xl" />
        <Skeleton className="h-112 rounded-xl" />
      </div>
    </main>
  );
}
