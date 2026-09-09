import { Skeleton } from "@heroui/react";

export function MarkdownPreviewerSkeleton() {
  return (
    <div className="grid gap-6 lg:grid-cols-2" aria-busy="true">
      <Skeleton className="h-176 rounded-xl" />
      <Skeleton className="h-176 rounded-xl" />
    </div>
  );
}
