import { Skeleton } from "@heroui/react";

export function McpPageSkeleton() {
  return (
    <main className="grid min-w-0 gap-14 pb-12" aria-busy="true">
      <section className="grid max-w-3xl gap-4 pt-4 sm:pt-8 lg:pt-14">
        <Skeleton className="h-4 w-40 rounded-md" />
        <Skeleton className="h-12 w-4/5 max-w-xl rounded-xl sm:h-14" />
        <Skeleton className="h-5 w-full max-w-2xl rounded-lg" />
        <Skeleton className="h-5 w-3/4 max-w-xl rounded-lg" />
      </section>
      <section className="grid gap-4 rounded-2xl border border-border p-5 sm:p-7 lg:grid-cols-[0.7fr_1.3fr]">
        <div className="grid content-start gap-4">
          <Skeleton className="h-7 w-48 rounded-lg" />
          <Skeleton className="h-4 w-full max-w-xs rounded-md" />
          <Skeleton className="h-12 w-full max-w-md rounded-md" />
        </div>
        <Skeleton className="h-48 w-full rounded-xl" />
      </section>
      <section className="grid gap-5">
        <div className="flex items-end justify-between gap-4">
          <Skeleton className="h-8 w-48 rounded-lg" />
          <Skeleton className="h-4 w-20 rounded-md" />
        </div>
        <Skeleton className="h-11 w-full max-w-xl rounded-xl" />
        <div className="grid gap-8 sm:grid-cols-2 lg:grid-cols-3">
          {[
            "one",
            "two",
            "three",
            "four",
            "five",
            "six",
            "seven",
            "eight",
            "nine",
          ].map((key) => (
            <div
              key={key}
              className="grid gap-2 border-b border-border/70 py-4"
            >
              <Skeleton className="h-4 w-2/3 rounded-md" />
              <Skeleton className="h-3 w-full rounded-md" />
              <Skeleton className="h-3 w-4/5 rounded-md" />
            </div>
          ))}
        </div>
      </section>
    </main>
  );
}
