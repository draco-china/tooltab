import { Skeleton } from "@heroui/react";
import {
  ToolPanelSkeleton,
  ToolPanelSkeletonContent,
  ToolPanelSkeletonFooter,
  ToolPanelSkeletonHeader,
} from "@/components/base/tool-panel-skeleton";

export function SitemapXmlGeneratorSkeleton() {
  return (
    <div className="grid gap-6" aria-busy="true">
      <ToolPanelSkeleton>
        <ToolPanelSkeletonHeader />
        <ToolPanelSkeletonContent className="min-h-72">
          <Skeleton className="h-10 rounded-lg" />
          <div className="grid gap-4 sm:grid-cols-2">
            <Skeleton className="h-10 rounded-lg" />
            <Skeleton className="h-10 rounded-lg" />
          </div>
          <Skeleton className="h-16 rounded-lg" />
        </ToolPanelSkeletonContent>
        <ToolPanelSkeletonFooter>
          <Skeleton className="h-8 w-20 rounded-lg" />
        </ToolPanelSkeletonFooter>
      </ToolPanelSkeleton>
      <div className="grid items-start gap-6 xl:grid-cols-2">
        <ToolPanelSkeleton>
          <ToolPanelSkeletonHeader />
          <ToolPanelSkeletonContent className="min-h-168">
            <Skeleton className="min-h-40 flex-1 rounded-xl" />
            <Skeleton className="min-h-40 flex-1 rounded-xl" />
          </ToolPanelSkeletonContent>
          <ToolPanelSkeletonFooter className="justify-between">
            <Skeleton className="h-8 w-24 rounded-lg" />
            <Skeleton className="h-8 w-32 rounded-lg" />
          </ToolPanelSkeletonFooter>
        </ToolPanelSkeleton>
        <ToolPanelSkeleton className="xl:h-fit!">
          <ToolPanelSkeletonHeader />
          <ToolPanelSkeletonContent className="min-h-96">
            <Skeleton className="min-h-80 flex-1 rounded-xl" />
          </ToolPanelSkeletonContent>
        </ToolPanelSkeleton>
      </div>
    </div>
  );
}
