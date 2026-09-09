import { Skeleton } from "@heroui/react";

export function UrlComponentEncoderDecoderSkeleton() {
  return (
    <div className="grid gap-6 lg:grid-cols-2" aria-busy="true">
      <Skeleton className="h-112 rounded-xl" />
      <Skeleton className="h-112 rounded-xl" />
    </div>
  );
}
