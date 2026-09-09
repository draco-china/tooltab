import { Skeleton } from "@heroui/react";
export function QrCodeReaderSkeleton() {
  return (
    <div className="grid gap-6 xl:grid-cols-2" aria-busy="true">
      <Skeleton className="h-136 rounded-xl" />
      <Skeleton className="h-136 rounded-xl" />
    </div>
  );
}
