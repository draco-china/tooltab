import { Skeleton } from "@heroui/react";

export function MurmurHash3X8632Skeleton() {
  return (
    <div className="grid gap-6 lg:grid-cols-2" aria-busy="true">
      <Skeleton className="h-120 rounded-xl" />
      <Skeleton className="h-120 rounded-xl" />
    </div>
  );
}
