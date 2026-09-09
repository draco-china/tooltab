import { Skeleton } from "@heroui/react";

export function PdfPageNumberAdderSkeleton() {
  return (
    <div
      className="grid gap-6 lg:grid-cols-[24rem_minmax(0,1fr)]"
      aria-busy="true"
    >
      <div className="grid gap-4 rounded-xl bg-surface p-4 shadow-surface">
        <Skeleton className="h-5 w-40" />
        <Skeleton className="h-11 rounded-xl" />
        <Skeleton className="h-11 rounded-xl" />
        <Skeleton className="h-40 rounded-xl" />
      </div>
      <div className="grid gap-6">
        <Skeleton className="h-96 rounded-xl" />
        <Skeleton className="h-56 rounded-xl" />
      </div>
    </div>
  );
}
