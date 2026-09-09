import { Skeleton } from "@heroui/react";
import { m } from "@/paraglide/messages.js";

export function UnixTimestampRouteSkeleton({
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
      <div
        role="status"
        aria-label={label}
        className="grid gap-6 xl:grid-cols-2"
      >
        <span className="sr-only">{label}</span>
        <div className="overflow-hidden rounded-xl bg-surface shadow-surface">
          <div className="grid gap-2 border-b border-separator p-4">
            <Skeleton className="h-5 w-40 rounded-md" />
            <Skeleton className="h-4 w-3/4 rounded-md" />
          </div>
          <div className="grid gap-6 p-4">
            <Skeleton className="h-11 rounded-xl" />
            <div className="grid gap-3">
              <Skeleton className="h-4 w-16 rounded-md" />
              <Skeleton className="h-10 w-full rounded-xl" />
              <Skeleton className="h-4 w-32 rounded-md" />
            </div>
            <div className="grid gap-2">
              <Skeleton className="h-4 w-28 rounded-md" />
              <Skeleton className="h-11 rounded-xl" />
            </div>
          </div>
        </div>
        <div className="overflow-hidden rounded-xl bg-surface shadow-surface">
          <div className="grid gap-2 border-b border-separator p-4">
            <Skeleton className="h-5 w-24 rounded-md" />
            <Skeleton className="h-4 w-32 rounded-md" />
          </div>
          <div className="grid gap-5 p-4">
            {["one", "two", "three", "four", "five"].map((key) => (
              <div
                key={key}
                className="grid gap-2 border-b border-separator pb-4 last:border-b-0 last:pb-0"
              >
                <Skeleton className="h-4 w-24 rounded-md" />
                <Skeleton className="h-5 w-4/5 rounded-md" />
              </div>
            ))}
          </div>
        </div>
      </div>
    </main>
  );
}
