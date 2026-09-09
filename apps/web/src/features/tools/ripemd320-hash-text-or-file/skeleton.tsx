import { Skeleton } from "@heroui/react";
export function Ripemd320Skeleton() {
  return (
    <div className="grid gap-6 md:grid-cols-2" aria-busy="true">
      <Skeleton className="h-96 rounded-xl" />
      <Skeleton className="h-96 rounded-xl" />
    </div>
  );
}
