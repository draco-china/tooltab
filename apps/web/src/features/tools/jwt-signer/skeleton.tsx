import { Skeleton } from "@heroui/react";

export function JwtSignerSkeleton() {
  return (
    <div className="grid gap-6" aria-busy="true">
      <div className="grid gap-6 lg:grid-cols-2">
        <Skeleton className="h-80 rounded-2xl" />
        <Skeleton className="h-72 rounded-2xl" />
      </div>
      <Skeleton className="h-152 rounded-2xl" />
    </div>
  );
}
