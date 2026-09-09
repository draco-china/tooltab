import { Skeleton } from "@heroui/react";
export function PdfSplitterSkeleton() {
  return (
    <div className="grid gap-6" aria-busy="true">
      <div className="grid gap-4 rounded-xl bg-surface p-4 shadow-surface">
        <div className="grid gap-2 border-b border-separator pb-4">
          <Skeleton className="h-5 w-40" />
          <Skeleton className="h-4 w-4/5" />
        </div>
        <Skeleton className="h-24 rounded-xl" />
      </div>
      <div className="grid items-start gap-6 xl:grid-cols-[minmax(18rem,24rem)_minmax(0,1fr)]">
        <Skeleton className="h-128 rounded-xl" />
        <div className="grid gap-6">
          <Skeleton className="h-128 rounded-xl" />
          <Skeleton className="h-96 rounded-xl" />
        </div>
      </div>
    </div>
  );
}
