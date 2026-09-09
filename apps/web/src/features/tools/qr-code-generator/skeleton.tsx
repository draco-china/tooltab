import { Skeleton } from "@heroui/react";
export function QrCodeGeneratorSkeleton() {
  return (
    <div
      className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_minmax(20rem,28rem)]"
      aria-busy="true"
    >
      <Skeleton className="h-160 rounded-xl" />
      <Skeleton className="h-160 rounded-xl" />
    </div>
  );
}
