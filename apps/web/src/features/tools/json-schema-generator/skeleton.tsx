import { Skeleton } from "@heroui/react";
import { m } from "@/paraglide/messages.js";

export function JsonSchemaGeneratorRouteSkeleton({
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
        <div className="grid gap-4 rounded-2xl border border-border p-4 sm:p-6">
          <Skeleton className="h-6 w-40" />
          <Skeleton className="h-4 w-72 max-w-full" />
          <Skeleton className="h-120" />
        </div>
        <div className="grid gap-4 rounded-2xl border border-border p-4 sm:p-6">
          <Skeleton className="h-6 w-40" />
          <Skeleton className="h-4 w-72 max-w-full" />
          <Skeleton className="h-120" />
        </div>
      </div>
    </main>
  );
}
