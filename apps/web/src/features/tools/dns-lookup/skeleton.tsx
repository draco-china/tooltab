import { Skeleton } from "@heroui/react";
import { m } from "@/paraglide/messages.js";

export function DnsLookupRouteSkeleton({
  label = m["common.processing"](),
}: {
  label?: string;
} = {}) {
  return (
    <main className="grid gap-8" aria-busy="true">
      <div className="grid gap-3">
        <Skeleton className="h-9 w-72" />
        <Skeleton className="h-5 w-full max-w-2xl" />
      </div>
      <div role="status" aria-label={label} className="grid gap-6">
        <span className="sr-only">{label}</span>
        <div className="overflow-hidden rounded-xl bg-surface shadow-surface">
          <div className="flex items-start justify-between gap-3 border-b border-separator p-4">
            <div className="grid gap-2">
              <Skeleton className="h-5 w-28 rounded-md" />
              <Skeleton className="h-4 w-56 rounded-md" />
            </div>
            <div className="flex gap-2">
              <Skeleton className="h-10 w-24 rounded-xl" />
              <Skeleton className="h-10 w-20 rounded-xl" />
            </div>
          </div>
          <div className="grid gap-6 p-4 lg:grid-cols-2">
            <Skeleton className="h-24 rounded-xl" />
            <Skeleton className="h-24 rounded-xl" />
            <Skeleton className="h-24 rounded-xl" />
            <Skeleton className="h-24 rounded-xl" />
          </div>
        </div>
        <div className="overflow-hidden rounded-xl bg-surface shadow-surface">
          <div className="grid gap-2 border-b border-separator p-4">
            <Skeleton className="h-5 w-24 rounded-md" />
            <Skeleton className="h-4 w-48 rounded-md" />
          </div>
          <div className="grid gap-4 p-4 sm:p-6">
            <div className="flex gap-2">
              <Skeleton className="h-6 w-28 rounded-full" />
              <Skeleton className="h-6 w-24 rounded-full" />
            </div>
            {[0, 1].map((item) => (
              <div
                key={item}
                className="grid gap-3 border-b border-separator py-4 last:border-b-0"
              >
                <Skeleton className="h-5 w-12 rounded-md" />
                <div className="grid gap-2 sm:grid-cols-2">
                  <Skeleton className="h-8 rounded-md" />
                  <Skeleton className="h-8 rounded-md" />
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </main>
  );
}
