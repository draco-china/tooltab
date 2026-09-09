import { Skeleton } from "@heroui/react";

export function UserAgentParserSkeleton() {
  return (
    <div
      className="grid items-start gap-6 xl:grid-cols-[minmax(0,0.8fr)_minmax(0,1.2fr)]"
      data-tool-panels
      aria-busy="true"
    >
      <Skeleton className="h-96 rounded-xl" />
      <Skeleton className="h-136 rounded-xl" />
    </div>
  );
}
