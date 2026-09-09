import { Skeleton } from "@heroui/react";

export function Sha3384HashSkeleton() {
  return (
    <div className="grid gap-6 lg:grid-cols-2" aria-busy="true">
      <Skeleton className="h-120 rounded-xl" />
      <Skeleton className="h-120 rounded-xl" />
    </div>
  );
}
