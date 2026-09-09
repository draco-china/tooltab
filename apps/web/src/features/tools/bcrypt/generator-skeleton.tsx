import { Skeleton } from "@heroui/react";
import { m } from "@/paraglide/messages.js";

export function BcryptHashPasswordRouteSkeleton({
  label = m["common.processing"](),
}: {
  label?: string;
} = {}) {
  return (
    <main className="flex flex-col gap-8 sm:gap-10" aria-busy="true">
      <div className="grid gap-3">
        <Skeleton className="h-9 w-80 max-w-3/4" />
        <Skeleton className="h-5 w-full max-w-2xl" />
      </div>
      <div
        role="status"
        aria-label={label}
        className="grid items-start gap-6 xl:grid-cols-[minmax(0,25rem)_minmax(0,1fr)]"
      >
        <span className="sr-only">{label}</span>
        <div className="grid min-h-128 content-start gap-4 rounded-xl bg-surface p-4 shadow-surface">
          <Skeleton className="h-5 w-40" />
          <Skeleton className="h-4 w-5/6" />
          <Skeleton className="h-10 w-full rounded-lg" />
          <Skeleton className="h-10 w-24 justify-self-end rounded-lg" />
          <Skeleton className="h-5 w-full rounded-full" />
          <Skeleton className="h-10 w-3/4" />
          <div className="mt-auto flex justify-between gap-3">
            <Skeleton className="h-9 w-24" />
            <Skeleton className="h-9 w-32" />
          </div>
        </div>
        <div className="grid min-h-128 content-start gap-4 rounded-xl bg-surface p-4 shadow-surface">
          <div className="grid gap-2">
            <Skeleton className="h-5 w-32" />
            <Skeleton className="h-4 w-4/5" />
          </div>
          <Skeleton className="ms-auto h-9 w-28" />
          <Skeleton className="h-80 w-full rounded-xl" />
        </div>
      </div>
    </main>
  );
}
