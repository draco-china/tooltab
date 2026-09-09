import { Skeleton } from "@heroui/react";
import {
  ToolPanelSkeleton,
  ToolPanelSkeletonContent,
  ToolPanelSkeletonFooter,
  ToolPanelSkeletonHeader,
} from "@/components/base/tool-panel-skeleton";

export function UuidV5GeneratorSkeleton() {
  return (
    <div className="grid gap-8" aria-busy="true">
      <div className="grid items-start gap-6 xl:grid-cols-2" data-tool-panels>
        <ToolPanelSkeleton>
          <ToolPanelSkeletonHeader />
          <ToolPanelSkeletonContent className="min-h-52">
            <Skeleton className="h-10 rounded-lg" />
            <Skeleton className="h-10 rounded-lg" />
            <Skeleton className="h-10 rounded-lg" />
          </ToolPanelSkeletonContent>
        </ToolPanelSkeleton>
        <ToolPanelSkeleton>
          <ToolPanelSkeletonHeader />
          <ToolPanelSkeletonContent className="min-h-36">
            <Skeleton className="h-10 rounded-lg" />
            <Skeleton className="h-6 w-36 rounded-lg" />
          </ToolPanelSkeletonContent>
          <ToolPanelSkeletonFooter className="justify-end">
            <Skeleton className="h-8 w-20 rounded-lg" />
          </ToolPanelSkeletonFooter>
        </ToolPanelSkeleton>
      </div>
      <div className="grid gap-5">
        <Skeleton className="h-7 w-64 rounded-lg" />
        <Skeleton className="h-16 w-full rounded-xl" />
      </div>
    </div>
  );
}
