import { Skeleton } from "@heroui/react";
import {
  ToolPanelSkeleton,
  ToolPanelSkeletonContent,
  ToolPanelSkeletonHeader,
} from "@/components/base/tool-panel-skeleton";

export function UuidV4GeneratorSkeleton() {
  return (
    <div className="grid gap-8" aria-busy="true">
      <ToolPanelSkeleton>
        <ToolPanelSkeletonHeader />
        <ToolPanelSkeletonContent>
          <Skeleton className="h-20 rounded-lg" />
          <Skeleton className="h-5 w-36 rounded-md" />
          <div className="grid gap-3">
            <Skeleton className="h-5 rounded-md" />
            <Skeleton className="h-5 rounded-md" />
            <Skeleton className="h-5 rounded-md" />
          </div>
        </ToolPanelSkeletonContent>
        <div className="flex shrink-0 justify-end gap-1">
          <Skeleton className="h-8 w-20 rounded-lg" />
          <Skeleton className="h-8 w-24 rounded-lg" />
        </div>
      </ToolPanelSkeleton>
      <div className="grid gap-5">
        <Skeleton className="h-4 w-full rounded-lg" />
        <Skeleton className="h-7 w-64 rounded-lg" />
        <Skeleton className="h-16 w-full rounded-xl" />
      </div>
    </div>
  );
}
