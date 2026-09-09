import { Skeleton } from "@heroui/react";

const FIELD_KEYS = ["field-1", "field-2", "field-3", "field-4"] as const;

export function Argon2HashPasswordSkeleton() {
  return (
    <div className="grid gap-10" aria-busy="true">
      <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_minmax(22rem,0.85fr)] xl:items-start">
        <div className="grid gap-6">
          <PanelSkeleton height="h-64" fields={3} />
          <PanelSkeleton height="h-72" fields={4} />
          <PanelSkeleton height="h-44" fields={1} />
        </div>
        <PanelSkeleton height="h-80" fields={1} actions />
      </div>
      <div className="grid gap-3">
        <Skeleton className="h-7 w-64" />
        <Skeleton className="h-4 w-full" />
        <Skeleton className="h-4 w-5/6" />
      </div>
    </div>
  );
}

function PanelSkeleton({
  actions = false,
  height,
  fields,
}: {
  actions?: boolean;
  height: string;
  fields: number;
}) {
  return (
    <div
      className={`overflow-hidden rounded-xl bg-surface shadow-surface ${height}`}
    >
      <div className="grid gap-2 border-b border-separator p-4 sm:grid-cols-[minmax(0,1fr)_auto]">
        <div className="grid gap-2">
          <Skeleton className="h-5 w-40" />
          <Skeleton className="h-4 w-3/4" />
        </div>
        {actions ? <Skeleton className="h-9 w-40" /> : null}
      </div>
      <div className="grid gap-4 p-4 sm:grid-cols-2">
        {FIELD_KEYS.slice(0, fields).map((fieldKey) => (
          <div key={fieldKey} className="grid gap-2">
            <Skeleton className="h-4 w-28" />
            <Skeleton className="h-11 w-full rounded-xl" />
          </div>
        ))}
      </div>
    </div>
  );
}
