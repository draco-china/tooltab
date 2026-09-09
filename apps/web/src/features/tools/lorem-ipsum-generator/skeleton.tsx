import { Skeleton } from "@heroui/react";

export function LoremIpsumGeneratorSkeleton() {
  return (
    <div
      className="grid gap-6 xl:grid-cols-[minmax(0,0.88fr)_minmax(0,1.12fr)]"
      aria-busy="true"
    >
      <Skeleton className="h-120 rounded-xl" />
      <Skeleton className="h-120 rounded-xl" />
    </div>
  );
}
