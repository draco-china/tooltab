import { Skeleton } from "@heroui/react";
export function CssBoxShadowGeneratorSkeleton() {
  return (
    <main className="flex flex-col gap-8 sm:gap-10" aria-busy="true">
      <div className="grid gap-3">
        <Skeleton className="h-9 w-96 max-w-3/4" />
        <Skeleton className="h-5 w-full max-w-3xl" />
      </div>
      <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_23rem]">
        <Skeleton className="h-184 w-full rounded-xl" />
        <Skeleton className="h-120 w-full rounded-xl" />
      </div>
    </main>
  );
}
