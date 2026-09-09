import { Skeleton } from "@heroui/react";
import { m } from "@/paraglide/messages.js";
export function CookieParserRouteSkeleton({
  label = m["common.processing"](),
}: {
  label?: string;
} = {}) {
  return (
    <main className="flex flex-col gap-8" aria-busy="true">
      <div className="grid gap-3">
        <Skeleton className="h-9 w-72" />
        <Skeleton className="h-5 w-full max-w-2xl" />
      </div>
      <div role="status" aria-label={label} className="grid gap-6">
        <span className="sr-only">{label}</span>
        <Skeleton className="h-32 rounded-xl" />
        <div className="grid gap-6 xl:grid-cols-[minmax(0,24rem)_minmax(0,1fr)]">
          <div className="grid gap-4 rounded-xl bg-surface p-4 shadow-surface">
            <Skeleton className="h-5 w-2/5" />
            <Skeleton className="h-72 rounded-xl" />
            <Skeleton className="h-11 rounded-xl" />
          </div>
          <div className="grid gap-4 rounded-xl bg-surface p-4 shadow-surface">
            <Skeleton className="h-5 w-2/5" />
            <Skeleton className="h-4 w-4/5" />
            <Skeleton className="h-80" />
            <Skeleton className="h-11 w-32 rounded-xl" />
          </div>
        </div>
        <Skeleton className="h-72 rounded-xl" />
      </div>
    </main>
  );
}
