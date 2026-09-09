import { Skeleton } from "@heroui/react";
export function UuidMaxGeneratorSkeleton() {
  return (
    <div className="grid gap-6" aria-busy="true">
      <Skeleton className="h-56 rounded-xl" />
      <Skeleton className="h-40 rounded-xl" />
    </div>
  );
}
