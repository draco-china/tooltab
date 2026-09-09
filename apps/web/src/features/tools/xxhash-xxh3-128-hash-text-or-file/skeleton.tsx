import { Skeleton } from "@heroui/react";
export function Xxh3128Skeleton() {
  return (
    <div className="grid gap-6" aria-busy="true">
      <Skeleton className="h-40 rounded-xl" />
      <div className="grid gap-6 lg:grid-cols-2">
        <Skeleton className="h-120 rounded-xl" />
        <Skeleton className="h-120 rounded-xl" />
      </div>
    </div>
  );
}
