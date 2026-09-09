import { Skeleton } from "@heroui/react";
export function SvgOptimizerSkeleton() {
  return (
    <div
      className="grid items-start gap-6 xl:grid-cols-[minmax(18rem,0.8fr)_minmax(0,1.2fr)]"
      aria-busy="true"
    >
      <Skeleton className="h-152 rounded-xl xl:row-span-2" />
      <div className="grid gap-6">
        <div className="grid gap-4 rounded-2xl border border-border p-4">
          <Skeleton className="h-10 rounded-lg" />
          <Skeleton className="h-64 rounded-lg" />
        </div>
        <ResultPanelSkeleton />
      </div>
    </div>
  );
}

function ResultPanelSkeleton() {
  return (
    <div className="flex h-72 flex-col gap-4 rounded-xl bg-surface p-4 shadow-surface">
      <div className="grid gap-2 border-b border-separator pb-4 sm:grid-cols-[minmax(0,1fr)_auto]">
        <Skeleton className="h-5 w-40" />
        <Skeleton className="h-9 w-24" />
      </div>
      <Skeleton className="flex-1" />
    </div>
  );
}
