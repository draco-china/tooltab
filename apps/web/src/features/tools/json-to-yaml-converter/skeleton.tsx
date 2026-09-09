import { Skeleton } from "@heroui/react";
import { m } from "@/paraglide/messages.js";

export function JsonToYamlConverterSkeleton({
  label = m["common.processing"](),
}: {
  label?: string;
} = {}) {
  return (
    <main className="grid min-w-0 gap-8" aria-busy="true">
      <div className="grid gap-3">
        <Skeleton className="h-9 w-80" />
        <Skeleton className="h-5 w-full max-w-2xl" />
      </div>
      <div
        role="status"
        aria-label={label}
        className="grid min-w-0 gap-6 xl:grid-cols-2"
      >
        <span className="sr-only">{label}</span>
        <div className="min-w-0 overflow-hidden rounded-xl border border-field-border bg-(--field-background) shadow-field">
          <div className="flex items-center justify-between gap-3 border-b border-separator bg-default/45 px-3 py-2">
            <div className="grid flex-1 gap-2">
              <Skeleton className="h-5 w-12" />
              <Skeleton className="h-5 w-4/5" />
            </div>
            <Skeleton className="size-8 rounded-lg" />
          </div>
          <div className="grid h-80 content-start gap-3 p-4">
            {["w-1/4", "w-2/3", "w-1/2", "w-3/4", "w-3/5", "w-1/3"].map(
              (width) => (
                <Skeleton key={width} className={`h-4 ${width}`} />
              ),
            )}
          </div>
          <div className="border-t border-separator p-3">
            <Skeleton className="h-28 rounded-2xl" />
          </div>
        </div>
        <div className="min-w-0 overflow-hidden rounded-xl border border-field-border bg-(--field-background) shadow-field">
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-separator bg-default/45 px-3 py-2">
            <div className="grid min-w-0 flex-1 gap-2">
              <Skeleton className="h-5 w-12" />
              <Skeleton className="h-5 w-4/5" />
            </div>
            <Skeleton className="size-8 rounded-lg" />
            <Skeleton className="h-8 w-24 rounded-lg" />
          </div>
          <div className="grid min-h-80 content-start gap-3 p-4">
            <Skeleton className="h-4 w-1/3" />
            <Skeleton className="h-4 w-2/3" />
            <Skeleton className="h-4 w-1/2" />
          </div>
        </div>
      </div>
      <Skeleton className="h-56 rounded-xl" />
    </main>
  );
}
