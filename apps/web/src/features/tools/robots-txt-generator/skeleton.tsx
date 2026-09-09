import { Skeleton } from "@heroui/react";

export function RobotsTxtGeneratorSkeleton() {
  return (
    <div className="grid gap-6 xl:grid-cols-2" aria-busy="true">
      <Skeleton className="h-176 rounded-xl" />
      <Skeleton className="h-176 rounded-xl" />
    </div>
  );
}
