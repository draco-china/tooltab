import { Skeleton } from "@heroui/react";
import { m } from "@/paraglide/messages.js";

export function Sha2HashRouteSkeleton({
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
      <div className="grid items-stretch gap-6 lg:grid-cols-2">
        <div className="flex min-h-0 flex-col gap-4 rounded-xl border border-field-border bg-(--field-background) p-4 shadow-field">
          <div className="grid gap-2 border-b border-separator pb-4">
            <Skeleton className="h-5 w-2/5" />
            <Skeleton className="h-4 w-4/5" />
          </div>
          <Skeleton className="min-h-64 flex-1 rounded-xl" />
          <Skeleton className="h-28 rounded-2xl" />
        </div>
        <div className="grid gap-4 rounded-xl border border-field-border bg-(--field-background) p-4 shadow-field">
          <div className="grid gap-2 border-b border-separator pb-4">
            <Skeleton className="h-5 w-2/5" />
            <Skeleton className="h-4 w-4/5" />
          </div>
          <div className="grid gap-3">
            {[0, 1, 2, 3].map((row) => (
              <div
                key={row}
                className="grid gap-3 border-b border-separator py-3 first:pt-0 last:border-b-0 last:pb-0"
              >
                <div className="flex items-center justify-between gap-3">
                  <Skeleton className="h-4 w-20" />
                  <Skeleton className="size-8 rounded-lg" />
                </div>
                <Skeleton className="h-5 w-full" />
              </div>
            ))}
          </div>
        </div>
      </div>
      <div className="grid gap-3">
        <Skeleton className="h-7 w-64" />
        <Skeleton className="h-4 w-full" />
        <Skeleton className="h-4 w-5/6" />
      </div>
    </div>
  );
}

export function Sha1HashRouteSkeleton() {
  return <Sha2HashRouteSkeleton label="SHA-1" />;
}

export function ShaSingleHashRouteSkeleton({
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
      <div className="grid items-stretch gap-6 lg:grid-cols-2">
        <div className="flex min-h-0 flex-col gap-4 rounded-xl border border-field-border bg-(--field-background) p-4 shadow-field">
          <div className="grid gap-2 border-b border-separator pb-4">
            <Skeleton className="h-5 w-2/5" />
            <Skeleton className="h-4 w-4/5" />
          </div>
          <Skeleton className="h-8 w-44 rounded-lg" />
          <Skeleton className="min-h-48 flex-1 rounded-xl" />
          <Skeleton className="h-11 rounded-2xl" />
          <div className="flex gap-2 border-t border-separator pt-4">
            <Skeleton className="h-10 w-32 rounded-lg" />
            <Skeleton className="h-10 w-24 rounded-lg" />
          </div>
        </div>
        <div className="flex min-h-0 flex-col gap-4 rounded-xl border border-field-border bg-(--field-background) p-4 shadow-field">
          <div className="grid gap-2 border-b border-separator pb-4">
            <Skeleton className="h-5 w-2/5" />
            <Skeleton className="h-4 w-4/5" />
          </div>
          <Skeleton className="h-11 rounded-xl" />
          <Skeleton className="min-h-48 flex-1 rounded-xl" />
          <div className="flex justify-end border-t border-separator pt-4">
            <Skeleton className="size-8 rounded-lg" />
          </div>
        </div>
      </div>
      <div className="grid gap-3">
        <Skeleton className="h-7 w-64" />
        <Skeleton className="h-4 w-full" />
        <Skeleton className="h-4 w-5/6" />
      </div>
    </div>
  );
}
