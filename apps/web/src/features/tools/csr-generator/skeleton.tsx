import { Skeleton } from "@heroui/react";
export function CsrGeneratorSkeleton() {
  return (
    <main className="flex flex-col gap-8 sm:gap-10" aria-busy="true">
      <div className="grid gap-3">
        <Skeleton className="h-9 w-80 max-w-3/4" />
        <Skeleton className="h-5 w-full max-w-3xl" />
      </div>
      <div className="grid items-start gap-6 lg:grid-cols-2">
        <Skeleton className="h-216 w-full rounded-xl" />
        <Skeleton className="h-136 w-full rounded-xl" />
      </div>
    </main>
  );
}
