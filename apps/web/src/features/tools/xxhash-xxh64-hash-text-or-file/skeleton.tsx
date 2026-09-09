import { Skeleton } from "@heroui/react";
export function Xxh64Skeleton() {
  return (
    <div className="grid gap-6" aria-busy="true">
      <div className="grid gap-6 lg:grid-cols-2">
        <Skeleton className="h-120 rounded-xl" />
        <Skeleton className="h-120 rounded-xl" />
      </div>
    </div>
  );
}
