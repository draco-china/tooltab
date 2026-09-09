import { Skeleton } from "@heroui/react";

export function HomePageSkeleton({ label }: { label: string }) {
  return (
    <main
      className="flex flex-col gap-8 sm:gap-10"
      aria-busy="true"
      aria-label={label}
    >
      <section className="flex max-w-208 flex-col gap-4">
        <Skeleton className="h-12 w-4/5 max-w-xl rounded-xl sm:h-14" />
        <div className="space-y-2">
          <Skeleton className="h-5 w-full max-w-2xl rounded-lg" />
          <Skeleton className="h-5 w-3/4 max-w-xl rounded-lg" />
        </div>
        <div className="mt-1 flex flex-col gap-3 sm:flex-row">
          <Skeleton className="h-12 w-full rounded-xl sm:max-w-130" />
          <Skeleton className="h-12 w-full rounded-xl sm:w-40" />
        </div>
        <Skeleton className="h-4 w-3/5 max-w-md rounded-lg" />
      </section>

      <section className="grid divide-y divide-border border-y border-border sm:grid-cols-3 sm:divide-x sm:divide-y-0">
        {["privacy", "server", "offline"].map((item) => (
          <div
            key={item}
            className="flex items-start gap-3 px-4 py-6 sm:px-6 sm:first:ps-0 sm:last:pe-0"
          >
            <Skeleton className="size-4.5 shrink-0 rounded-md" />
            <div className="w-full flex-1 space-y-2">
              <Skeleton className="h-4 w-28 rounded-md" />
              <Skeleton className="h-4 w-full rounded-md" />
            </div>
          </div>
        ))}
      </section>

      {[
        { id: "categories", count: 8 },
        { id: "popular", count: 6 },
      ].map(({ id, count }) => (
        <section key={id} className="flex flex-col gap-4">
          <div className="flex items-end justify-between gap-4">
            <Skeleton className="h-8 w-40 rounded-lg" />
            <Skeleton className="h-5 w-28 rounded-md" />
          </div>
          <div
            className={
              id === "categories"
                ? "grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4"
                : "grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3"
            }
          >
            {Array.from(
              { length: count },
              (_, index) => `${id}-${index + 1}`,
            ).map((item) => (
              <div
                key={item}
                className={
                  id === "categories"
                    ? "flex min-h-18 items-center gap-3 rounded-[1.25rem] border border-border px-4 py-4"
                    : "flex min-h-32 flex-col gap-2 rounded-[1.25rem] border border-border bg-surface p-6"
                }
              >
                <Skeleton className="size-4.5 shrink-0 rounded-md" />
                <div className="w-full flex-1 space-y-2">
                  <Skeleton className="h-4 w-2/5 rounded-md" />
                  <Skeleton className="h-3 w-4/5 rounded-md" />
                </div>
              </div>
            ))}
          </div>
        </section>
      ))}
    </main>
  );
}
