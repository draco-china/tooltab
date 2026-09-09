import { Skeleton } from "@heroui/react";
import {
  ToolPanelSkeleton,
  ToolPanelSkeletonContent,
  ToolPanelSkeletonHeader,
} from "@/components/base/tool-panel-skeleton";

export function UuidV4BulkGeneratorSkeleton() {
  return (
    <div className="grid gap-8" aria-busy="true">
      <div className="grid items-stretch gap-6 xl:grid-cols-2" data-tool-panels>
        <ToolPanelSkeleton>
          <ToolPanelSkeletonHeader />
          <ToolPanelSkeletonContent className="min-h-32">
            <Skeleton className="h-10 rounded-lg" />
            <Skeleton className="h-4 w-3/4 rounded-md" />
          </ToolPanelSkeletonContent>
        </ToolPanelSkeleton>
        <ToolPanelSkeleton>
          <ToolPanelSkeletonHeader />
          <ToolPanelSkeletonContent className="min-h-80">
            <Skeleton className="min-h-72 flex-1 rounded-lg" />
          </ToolPanelSkeletonContent>
          <div className="flex shrink-0 justify-end gap-1">
            <Skeleton className="h-8 w-20 rounded-lg" />
            <Skeleton className="h-8 w-24 rounded-lg" />
            <Skeleton className="h-8 w-24 rounded-lg" />
          </div>
        </ToolPanelSkeleton>
      </div>
      <div className="grid gap-5">
        <Skeleton className="h-4 w-full rounded-lg" />
        <Skeleton className="h-7 w-64 rounded-lg" />
        <Skeleton className="h-16 w-full rounded-xl" />
      </div>
    </div>
  );
}
