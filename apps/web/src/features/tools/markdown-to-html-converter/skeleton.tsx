import { Skeleton } from "@heroui/react";

export function MarkdownToHtmlSkeleton() {
  return (
    <div className="grid gap-6" aria-busy="true">
      <div className="grid gap-6 lg:grid-cols-2">
        <div className="grid gap-4 rounded-xl bg-surface p-4 shadow-surface">
          <Skeleton className="h-5 w-2/5" />
          <Skeleton className="h-112 rounded-xl" />
          <Skeleton className="h-11 rounded-xl" />
        </div>
        <div className="grid gap-4 rounded-xl bg-surface p-4 shadow-surface">
          <Skeleton className="h-8 w-3/5" />
          <Skeleton className="h-112" />
          <Skeleton className="h-11 w-40 rounded-xl" />
        </div>
      </div>
      <div className="grid gap-4 rounded-xl bg-surface p-4 shadow-surface">
        <Skeleton className="h-5 w-2/5" />
        <Skeleton className="h-88" />
        <Skeleton className="h-11 w-32 rounded-xl" />
      </div>
    </div>
  );
}
