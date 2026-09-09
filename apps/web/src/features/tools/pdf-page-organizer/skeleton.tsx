import { Skeleton } from "@heroui/react";

export function PdfPageOrganizerSkeleton() {
  return (
    <div
      className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_22rem]"
      aria-busy="true"
    >
      <div className="grid gap-6">
        <Panel className="h-56" />
        <div className="overflow-hidden rounded-xl bg-surface shadow-surface">
          <div className="flex items-start justify-between gap-3 border-b border-separator p-4">
            <div className="grid gap-2">
              <Skeleton className="h-5 w-28 rounded-md" />
              <Skeleton className="h-4 w-48 rounded-md" />
            </div>
            <div className="flex gap-2">
              <Skeleton className="h-10 w-24 rounded-xl" />
              <Skeleton className="h-10 w-28 rounded-xl" />
            </div>
          </div>
          <div className="grid min-h-52 place-items-center p-6">
            <div className="grid w-full max-w-sm justify-items-center gap-3">
              <Skeleton className="size-10 rounded-full" />
              <Skeleton className="h-5 w-36 rounded-md" />
              <Skeleton className="h-4 w-full rounded-md" />
            </div>
          </div>
        </div>
      </div>
      <div className="overflow-hidden rounded-xl bg-surface shadow-surface">
        <div className="flex items-start justify-between gap-3 border-b border-separator p-4">
          <div className="grid gap-2">
            <Skeleton className="h-5 w-32 rounded-md" />
            <Skeleton className="h-4 w-44 rounded-md" />
          </div>
          <Skeleton className="h-9 w-20 rounded-xl" />
        </div>
        <div className="grid gap-3 p-4 sm:grid-cols-2">
          {[0, 1, 2, 3].map((item) => (
            <div
              key={item}
              className="grid gap-3 rounded-xl border border-border p-3"
            >
              <Skeleton className="aspect-3/4 min-h-44 rounded-lg" />
              <Skeleton className="h-4 w-2/3 rounded-md" />
              <Skeleton className="h-9 rounded-lg" />
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function Panel({ className }: { className: string }) {
  return (
    <div
      className={`grid gap-4 overflow-hidden rounded-xl bg-surface p-4 shadow-surface ${className}`}
    >
      <Skeleton className="h-5 w-32 rounded-md" />
      <Skeleton className="h-12 rounded-xl" />
      <Skeleton className="h-7 w-40 rounded-full" />
    </div>
  );
}
