import { Skeleton } from "@heroui/react";

export function ChineseUppercaseNumberConverterSkeleton() {
  return (
    <main className="flex flex-col gap-8 sm:gap-10" aria-busy="true">
      <div className="grid gap-3">
        <Skeleton className="h-9 w-96 max-w-3/4" />
        <Skeleton className="h-5 w-full max-w-3xl" />
      </div>
      <div className="grid gap-8">
        <div className="grid gap-4 rounded-xl bg-surface p-4 shadow-surface">
          <Skeleton className="h-5 w-40" />
          <Skeleton className="h-11 w-full rounded-xl" />
        </div>
        <div className="grid gap-6 lg:grid-cols-2">
          {[0, 1].map((panel) => (
            <div
              key={panel}
              className="grid min-h-72 gap-4 rounded-xl bg-surface p-4 shadow-surface"
            >
              <div className="grid gap-2 border-b border-separator pb-4">
                <Skeleton className="h-5 w-40" />
                <Skeleton className="h-4 w-4/5" />
              </div>
              <Skeleton className="h-32 w-full rounded-xl" />
              <div className="flex justify-end border-t border-separator pt-4">
                <Skeleton className="h-9 w-28" />
              </div>
            </div>
          ))}
        </div>
      </div>
    </main>
  );
}
