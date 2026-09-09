import { Skeleton } from "@heroui/react";
import { m } from "@/paraglide/messages.js";
export function ColorPickerRouteSkeleton({
  label = m["common.processing"](),
}: {
  label?: string;
} = {}) {
  return (
    <main className="grid gap-8" aria-busy="true">
      <Skeleton className="h-20" />
      <div
        role="status"
        aria-label={label}
        className="grid min-w-0 gap-6 xl:grid-cols-[minmax(0,24rem)_minmax(0,1fr)]"
      >
        <span className="sr-only">{label}</span>
        <div className="grid gap-6">
          <div className="grid gap-4 rounded-xl border border-field-border bg-(--field-background) p-4 shadow-field">
            <div className="grid gap-2">
              <Skeleton className="h-5 w-2/5" />
              <Skeleton className="h-4 w-4/5" />
            </div>
            <Skeleton className="h-11 w-40 rounded-xl" />
          </div>
          <div className="grid gap-4 rounded-xl border border-field-border bg-(--field-background) p-4 shadow-field">
            <div className="grid gap-2">
              <Skeleton className="h-5 w-2/5" />
              <Skeleton className="h-4 w-4/5" />
            </div>
            <Skeleton className="h-28 rounded-2xl" />
            <Skeleton className="h-48 rounded-xl" />
          </div>
        </div>
        <div className="grid gap-5 rounded-xl border border-field-border bg-(--field-background) p-4 shadow-field">
          <div className="grid gap-2 border-b border-separator pb-4">
            <Skeleton className="h-5 w-2/5" />
            <Skeleton className="h-4 w-4/5" />
          </div>
          <div className="flex items-center justify-between gap-4 rounded-xl border border-border bg-default/30 p-4">
            <div className="flex items-center gap-4">
              <Skeleton className="size-16 rounded-2xl" />
              <div className="grid gap-2">
                <Skeleton className="h-4 w-24" />
                <Skeleton className="h-4 w-36" />
              </div>
            </div>
            <Skeleton className="h-11 w-28 rounded-xl" />
          </div>
          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
            {[0, 1, 2, 3, 4, 5].map((field) => (
              <div
                key={field}
                className="grid gap-2 rounded-xl border border-border bg-default/30 p-3"
              >
                <Skeleton className="h-4 w-16" />
                <Skeleton className="h-5 w-full" />
              </div>
            ))}
          </div>
        </div>
      </div>
    </main>
  );
}
