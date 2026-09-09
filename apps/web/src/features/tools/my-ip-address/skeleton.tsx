import { Skeleton } from "@heroui/react";
export function MyIpAddressSkeleton() {
  return (
    <div className="grid gap-6 md:grid-cols-2" aria-busy="true">
      <Skeleton className="h-72 rounded-xl" />
      <Skeleton className="h-72 rounded-xl" />
    </div>
  );
}
