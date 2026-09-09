import { Skeleton } from "@heroui/react";

export function OpenapiToTypescriptConverterSkeleton() {
  return (
    <div className="grid gap-6" aria-busy="true">
      <div className="grid gap-6 lg:grid-cols-2">
        <div className="grid gap-4 rounded-xl bg-surface p-4 shadow-surface">
          <Skeleton className="h-5 w-2/5" />
          <Skeleton className="h-80 rounded-xl" />
          <Skeleton className="h-11 rounded-xl" />
        </div>
        <div className="grid gap-4 rounded-xl bg-surface p-4 shadow-surface">
          <Skeleton className="h-5 w-2/5" />
          <Skeleton className="h-4 w-4/5" />
          <Skeleton className="h-64" />
          <Skeleton className="h-11 w-40 rounded-xl" />
        </div>
      </div>
      <Skeleton className="h-48 rounded-xl" />
    </div>
  );
}
