import { Skeleton } from "@heroui/react";

export function Sha3512HashSkeleton() {
  return (
    <div className="grid gap-8" aria-busy="true">
      <div className="grid gap-6">
        <Skeleton className="h-120 rounded-xl" />
        <Skeleton className="h-120 rounded-xl" />
      </div>
      <div className="grid gap-3">
        <Skeleton className="h-7 w-64" />
        <Skeleton className="h-4 w-full" />
        <Skeleton className="h-4 w-5/6" />
      </div>
    </div>
  );
}
