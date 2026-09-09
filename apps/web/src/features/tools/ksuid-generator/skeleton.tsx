import { Skeleton } from "@heroui/react";
export function KsuidGeneratorSkeleton() {
  return (
    <div className="grid gap-6" aria-busy="true">
      <Skeleton className="h-72 rounded-xl" />
      <Skeleton className="h-80 rounded-xl" />
    </div>
  );
}
