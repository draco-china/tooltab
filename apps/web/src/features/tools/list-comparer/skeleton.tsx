import { Skeleton } from "@heroui/react";
import { m } from "@/paraglide/messages.js";

export function ListComparerRouteSkeleton({
  label = m["common.processing"](),
}: {
  label?: string;
} = {}) {
  return (
    <main
      className="flex flex-col gap-8 sm:gap-10"
      role="status"
      aria-busy="true"
      aria-label={label}
    >
      <div className="grid gap-3">
        <Skeleton className="h-9 w-80 max-w-3/4" />
        <Skeleton className="h-5 w-full max-w-3xl" />
      </div>
      <div className="grid gap-6">
        <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_20rem]">
          <Panel className="h-80" />
          <Panel className="h-80" />
        </div>
        <Panel className="h-36" />
        <Panel className="h-72" />
      </div>
      <Article />
    </main>
  );
}
function Panel({ className }: { className: string }) {
  return <Skeleton className={`w-full rounded-xl ${className}`} />;
}
function Article() {
  return (
    <div className="grid gap-3">
      <Skeleton className="h-7 w-64" />
      <Skeleton className="h-4 w-full" />
      <Skeleton className="h-4 w-5/6" />
    </div>
  );
}
