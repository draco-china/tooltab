import { Skeleton } from "@heroui/react";
import { m } from "@/paraglide/messages.js";
export function CodeScreenshotRouteSkeleton({
  label = m["common.processing"](),
}: {
  label?: string;
} = {}) {
  return (
    <main className="grid gap-8" aria-busy="true">
      <Skeleton className="h-20 w-full" />
      <div
        role="status"
        aria-label={label}
        className="grid gap-6 xl:grid-cols-[minmax(0,1.2fr)_minmax(20rem,.8fr)]"
      >
        <span className="sr-only">{label}</span>
        <Skeleton className="h-168 rounded-xl" />
        <Skeleton className="h-144 rounded-xl" />
      </div>
    </main>
  );
}
