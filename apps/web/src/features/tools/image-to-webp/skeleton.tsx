import { Skeleton } from "@heroui/react";
import { m } from "@/paraglide/messages.js";

export function ImageToWebpRouteSkeleton({
  label = m["common.processing"](),
}: {
  label?: string;
} = {}) {
  return (
    <div
      className="grid gap-8"
      role="status"
      aria-busy="true"
      aria-label={label}
    >
      <div className="grid items-start gap-6 xl:grid-cols-[minmax(0,1fr)_22rem]">
        <Skeleton className="h-96 rounded-xl" />
        <Skeleton className="h-80 rounded-xl" />
      </div>
      <ResultSkeleton />
      <ArticleSkeleton />
    </div>
  );
}

function ResultSkeleton() {
  return (
    <div className="flex h-64 flex-col gap-4 rounded-xl bg-surface p-4 shadow-surface">
      <div className="grid gap-2 border-b border-separator pb-4 sm:grid-cols-[minmax(0,1fr)_auto]">
        <div className="grid gap-2">
          <Skeleton className="h-5 w-40" />
          <Skeleton className="h-4 w-3/4" />
        </div>
        <Skeleton className="h-9 w-24" />
      </div>
      <Skeleton className="flex-1" />
    </div>
  );
}

function ArticleSkeleton() {
  return (
    <div className="grid gap-3">
      <Skeleton className="h-7 w-64" />
      <Skeleton className="h-4 w-full" />
      <Skeleton className="h-4 w-5/6" />
    </div>
  );
}
