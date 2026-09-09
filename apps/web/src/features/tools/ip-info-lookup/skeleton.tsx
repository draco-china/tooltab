import { Skeleton } from "@heroui/react";
export function IpInfoLookupSkeleton() {
  return (
    <div className="grid gap-6" aria-busy="true">
      <Skeleton className="h-44 rounded-xl" />
      <Skeleton className="h-96 rounded-xl" />
    </div>
  );
}
