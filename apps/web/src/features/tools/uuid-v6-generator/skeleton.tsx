import { Skeleton } from "@heroui/react";
import { m } from "@/paraglide/messages.js";

const OPTION_FIELDS = ["count", "timestamp", "node", "sequence"] as const;
const RESULT_FIELDS = ["output", "timestamp"] as const;

export function UuidV6GeneratorSkeleton({
  label = m["common.processing"](),
}: {
  label?: string;
} = {}) {
  return (
    <main className="flex flex-col gap-8 sm:gap-10" aria-busy="true">
      <div className="grid gap-3">
        <Skeleton className="h-9 w-72 max-w-3/4" />
        <Skeleton className="h-5 w-full max-w-2xl" />
      </div>
      <div
        role="status"
        aria-label={label}
        className="grid items-start gap-6 xl:grid-cols-[minmax(0,0.98fr)_minmax(0,1.02fr)]"
      >
        <span className="sr-only">{label}</span>
        <PanelSkeleton fields={OPTION_FIELDS} />
        <PanelSkeleton fields={RESULT_FIELDS} />
      </div>
      <div className="grid gap-3">
        <Skeleton className="h-5 w-full" />
        <Skeleton className="h-7 w-64" />
        <Skeleton className="h-4 w-full" />
        <Skeleton className="h-4 w-5/6" />
      </div>
    </main>
  );
}

function PanelSkeleton({ fields }: { fields: readonly string[] }) {
  return (
    <div className="overflow-hidden rounded-xl bg-surface shadow-surface">
      <div className="grid gap-2 border-b border-separator p-4">
        <Skeleton className="h-5 w-32" />
        <Skeleton className="h-4 w-4/5" />
      </div>
      <div className="grid gap-5 p-4">
        {fields.map((field) => (
          <div className="grid gap-2" key={field}>
            <Skeleton className="h-4 w-28" />
            <Skeleton
              className={field === "output" ? "h-80 w-full" : "h-11 w-full"}
            />
          </div>
        ))}
      </div>
      <div className="flex justify-end gap-3 border-t border-separator p-4">
        <Skeleton className="h-9 w-28" />
        <Skeleton className="h-9 w-28" />
      </div>
    </div>
  );
}
