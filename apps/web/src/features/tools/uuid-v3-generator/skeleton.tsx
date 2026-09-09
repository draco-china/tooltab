import { Skeleton } from "@heroui/react";

const INPUT_FIELDS = ["namespace", "presets", "name"] as const;
const RESULT_FIELDS = ["result", "badges"] as const;

export function UuidV3GeneratorSkeleton() {
  return (
    <div role="status" aria-busy="true" className="grid gap-10">
      <span className="sr-only">Loading UUID v3 generator</span>
      <div className="grid items-start gap-6 xl:grid-cols-[minmax(0,0.95fr)_minmax(0,1.05fr)]">
        <PanelSkeleton fields={INPUT_FIELDS} />
        <PanelSkeleton fields={RESULT_FIELDS} />
      </div>
      <div className="grid gap-3">
        <Skeleton className="h-7 w-56" />
        <Skeleton className="h-4 w-full" />
        <Skeleton className="h-4 w-5/6" />
        <Skeleton className="h-6 w-40" />
        <Skeleton className="h-4 w-full" />
      </div>
    </div>
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
              className={field === "presets" ? "h-11 w-3/4" : "h-11 w-full"}
            />
          </div>
        ))}
      </div>
      <div className="flex justify-end border-t border-separator p-4">
        <Skeleton className="h-9 w-28" />
      </div>
    </div>
  );
}
