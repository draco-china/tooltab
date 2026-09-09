import { Skeleton } from "@heroui/react";
import { m } from "@/paraglide/messages.js";

export function ToolWorkspaceSkeleton({
  label = m["common.processing"](),
}: {
  label?: string;
} = {}) {
  return (
    <div
      role="status"
      aria-label={label}
      className="grid min-h-72 gap-6 lg:grid-cols-2"
    >
      <span className="sr-only">{label}</span>
      {[0, 1].map((panel) => (
        <div
          key={panel}
          className="flex min-h-72 flex-col gap-4 rounded-xl bg-surface p-4 shadow-surface"
        >
          <Skeleton className="h-5 w-28" />
          <Skeleton className="h-4 w-3/4" />
          <Skeleton className="mt-2 h-11 w-full" />
          <Skeleton className="h-11 w-full" />
          <Skeleton className="mt-auto h-10 w-32" />
        </div>
      ))}
    </div>
  );
}

export function ToolRouteSkeleton({
  label = m["common.processing"](),
}: {
  label?: string;
} = {}) {
  return (
    <main className="flex flex-col gap-8 sm:gap-10" aria-busy="true">
      <div className="grid gap-3">
        <Skeleton className="h-9 w-64 max-w-3/4" />
        <Skeleton className="h-5 w-full max-w-2xl" />
      </div>
      <ToolWorkspaceSkeleton label={label} />
    </main>
  );
}
