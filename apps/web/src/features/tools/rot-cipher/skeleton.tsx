import { Skeleton } from "@heroui/react";

export function RotCipherSkeleton() {
  return (
    <main className="grid gap-8" aria-busy="true">
      <div className="grid gap-3">
        <Skeleton className="h-9 w-96 max-w-3/4" />
        <Skeleton className="h-5 w-full max-w-3xl" />
      </div>
      <Skeleton className="h-44 rounded-xl" />
      <div className="grid gap-6 lg:grid-cols-2">
        <Skeleton className="h-96 rounded-xl" />
        <Skeleton className="h-96 rounded-xl" />
      </div>
      <Skeleton className="h-40 rounded-xl" />
    </main>
  );
}
