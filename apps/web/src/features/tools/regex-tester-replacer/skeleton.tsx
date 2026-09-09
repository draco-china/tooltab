import { Skeleton } from "@heroui/react";

export function RegexTesterReplacerSkeleton() {
  return (
    <div className="grid gap-6" aria-busy="true">
      <div className="grid items-stretch gap-6 xl:grid-cols-[minmax(0,1fr)_20rem]">
        <div className="flex min-h-0 flex-col gap-4 rounded-xl border border-field-border bg-(--field-background) p-4 shadow-field">
          <div className="grid gap-2">
            <Skeleton className="h-5 w-2/5" />
            <Skeleton className="h-4 w-4/5" />
          </div>
          <Skeleton className="min-h-80 flex-1 rounded-xl" />
        </div>
        <div className="grid gap-4 rounded-xl border border-field-border bg-(--field-background) p-4 shadow-field">
          <div className="grid gap-2">
            <Skeleton className="h-5 w-3/5" />
            <Skeleton className="h-4 w-full" />
          </div>
          <Skeleton className="h-11 rounded-xl" />
          <Skeleton className="h-11 rounded-xl" />
          <div className="grid gap-2">
            <Skeleton className="h-4 w-1/3" />
            <Skeleton className="h-11 rounded-xl" />
          </div>
          <div className="grid gap-2">
            <Skeleton className="h-4 w-1/3" />
            <Skeleton className="h-11 rounded-xl" />
          </div>
        </div>
      </div>
      <Skeleton className="h-32 rounded-xl" />
      <Skeleton className="h-80 rounded-xl" />
    </div>
  );
}
