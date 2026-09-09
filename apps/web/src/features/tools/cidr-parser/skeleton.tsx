import { Skeleton } from "@heroui/react";

export function CidrParserSkeleton() {
  return (
    <main className="flex flex-col gap-8 sm:gap-10" aria-busy="true">
      <div className="grid gap-3">
        <Skeleton className="h-9 w-80 max-w-3/4" />
        <Skeleton className="h-5 w-full max-w-3xl" />
      </div>
      <div className="grid items-start gap-6 xl:grid-cols-[minmax(18rem,0.8fr)_minmax(0,1.2fr)]">
        <Skeleton className="h-80 w-full rounded-xl" />
        <div className="grid gap-6">
          <Skeleton className="h-80 w-full rounded-xl" />
          <div className="grid gap-6 xl:grid-cols-2">
            <Skeleton className="h-96 w-full rounded-xl" />
            <Skeleton className="h-96 w-full rounded-xl" />
          </div>
        </div>
      </div>
      <Skeleton className="h-64 w-full rounded-xl" />
    </main>
  );
}
