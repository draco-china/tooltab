import { Skeleton } from "@heroui/react";
import { m } from "@/paraglide/messages.js";

export function HtmlEntityEncoderDecoderSkeleton({
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
        <div className="overflow-hidden rounded-xl bg-surface shadow-surface">
          <div className="border-b border-separator p-4">
            <Skeleton className="h-5 w-28" />
          </div>
          <div className="grid gap-4 p-4 sm:grid-cols-2">
            <Skeleton className="h-16 rounded-xl" />
            <Skeleton className="h-16 rounded-xl" />
          </div>
        </div>
        <div className="grid gap-6 lg:grid-cols-2">
          <Skeleton className="h-96 rounded-xl" />
          <Skeleton className="h-96 rounded-xl" />
        </div>
      </div>
      <Skeleton className="h-40 rounded-xl" />
    </main>
  );
}
