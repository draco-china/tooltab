import { Skeleton } from "@heroui/react";

export function ImageToPdfConverterSkeleton() {
  return (
    <div
      className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_22rem]"
      aria-busy="true"
    >
      <Skeleton className="h-152 rounded-xl" />
      <Skeleton className="h-152 rounded-xl" />
    </div>
  );
}
