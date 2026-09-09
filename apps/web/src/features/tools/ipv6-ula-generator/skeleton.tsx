import { Skeleton } from "@heroui/react";

export function IPv6UlaGeneratorSkeleton() {
  return (
    <div
      className="grid items-start gap-6 xl:grid-cols-[minmax(18rem,0.72fr)_minmax(0,1.28fr)]"
      aria-busy="true"
    >
      <Skeleton className="h-96 rounded-xl" />
      <Skeleton className="h-96 rounded-xl" />
    </div>
  );
}
