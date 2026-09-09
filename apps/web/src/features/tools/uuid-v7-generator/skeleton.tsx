import { Skeleton } from "@heroui/react";
import { m } from "@/paraglide/messages.js";
import {
  ToolPanelSkeleton,
  ToolPanelSkeletonContent,
  ToolPanelSkeletonFooter,
  ToolPanelSkeletonHeader,
} from "@/components/base/tool-panel-skeleton";

export function UuidV7RouteSkeleton({
  label = m["common.processing"](),
}: {
  label?: string;
} = {}) {
  return (
    <main className="grid gap-8" aria-busy="true">
      <div className="grid gap-3">
        <Skeleton className="h-9 w-80" />
        <Skeleton className="h-5 w-full max-w-2xl" />
      </div>
      <div
        role="status"
        aria-label={label}
        className="grid gap-6 xl:grid-cols-2"
      >
        <span className="sr-only">{label}</span>
        <ToolPanelSkeleton>
          <ToolPanelSkeletonHeader />
          <ToolPanelSkeletonContent className="min-h-80">
            <div className="grid gap-4 sm:grid-cols-2">
              <Skeleton className="h-10 rounded-lg" />
              <Skeleton className="h-10 rounded-lg" />
            </div>
            <Skeleton className="h-10 rounded-lg" />
            <Skeleton className="h-24 rounded-lg" />
          </ToolPanelSkeletonContent>
        </ToolPanelSkeleton>
        <ToolPanelSkeleton>
          <ToolPanelSkeletonHeader />
          <ToolPanelSkeletonContent className="min-h-80">
            <Skeleton className="min-h-56 flex-1 rounded-lg" />
            <Skeleton className="h-4 w-2/3 rounded-md" />
          </ToolPanelSkeletonContent>
          <ToolPanelSkeletonFooter>
            <Skeleton className="h-8 w-20 rounded-lg" />
            <Skeleton className="h-8 w-24 rounded-lg" />
            <Skeleton className="h-8 w-24 rounded-lg" />
          </ToolPanelSkeletonFooter>
        </ToolPanelSkeleton>
      </div>
    </main>
  );
}
