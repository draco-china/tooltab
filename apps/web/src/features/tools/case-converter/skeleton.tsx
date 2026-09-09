import { Skeleton } from "@heroui/react";
import { m } from "@/paraglide/messages.js";

const RESULT_SKELETONS = ["one", "two", "three", "four", "five", "six"];

export function CaseConverterRouteSkeleton({
  label = m["common.processing"](),
}: {
  label?: string;
} = {}) {
  return (
    <main className="grid gap-8" aria-busy="true">
      <div className="grid gap-3">
        <Skeleton className="h-9 w-64" />
        <Skeleton className="h-5 w-full max-w-2xl" />
      </div>
      <div role="status" aria-label={label} className="grid gap-6">
        <span className="sr-only">{label}</span>
        <Skeleton className="h-64 rounded-xl" />
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {RESULT_SKELETONS.map((key) => (
            <Skeleton key={key} className="h-32 rounded-xl" />
          ))}
        </div>
      </div>
    </main>
  );
}
