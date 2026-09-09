import { Skeleton } from "@heroui/react";
import { m } from "@/paraglide/messages.js";
import {
  ToolPanelSkeleton,
  ToolPanelSkeletonContent,
  ToolPanelSkeletonHeader,
} from "@/components/base/tool-panel-skeleton";

export function SvgToImageRouteSkeleton({
  label = m["common.processing"](),
}: {
  label?: string;
} = {}) {
  return (
    <div
      className="grid gap-6"
      data-tool-panels
      role="status"
      aria-busy="true"
      aria-label={label}
    >
      <ToolPanelSkeleton>
        <ToolPanelSkeletonHeader />
        <ToolPanelSkeletonContent className="min-h-120">
          <Skeleton className="h-10 rounded-lg" />
          <Skeleton className="min-h-80 flex-1 rounded-xl" />
        </ToolPanelSkeletonContent>
      </ToolPanelSkeleton>
      <ToolPanelSkeleton>
        <div className="grid gap-2 border-b border-separator p-4 sm:grid-cols-[minmax(0,1fr)_auto]">
          <div className="grid gap-2">
            <Skeleton className="h-5 w-40 rounded-md" />
            <Skeleton className="h-4 w-2/3 rounded-md" />
          </div>
          <Skeleton className="h-9 w-24 rounded-md" />
        </div>
        <ToolPanelSkeletonContent className="min-h-48">
          <Skeleton className="min-h-40 flex-1 rounded-xl" />
        </ToolPanelSkeletonContent>
      </ToolPanelSkeleton>
    </div>
  );
}
