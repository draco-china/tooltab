import { Skeleton } from "@heroui/react";
import { m } from "@/paraglide/messages.js";

export function YamlToJsonRouteSkeleton({
  label = m["common.processing"](),
}: {
  label?: string;
} = {}) {
  return (
    <main className="grid gap-8" aria-busy="true">
      <div className="grid gap-3">
        <Skeleton className="h-9 w-80" />
        <Skeleton className="h-5 w-full max-w-2xl" />
      </div>
      <div
        role="status"
        aria-label={label}
        className="grid gap-6 xl:grid-cols-2"
      >
        <span className="sr-only">{label}</span>
        <PanelSkeleton />
        <PanelSkeleton output />
      </div>
      <Skeleton className="h-56 rounded-xl" />
    </main>
  );
}

function PanelSkeleton({ output = false }: { output?: boolean }) {
  return (
    <div className="flex h-136 flex-col gap-4 rounded-xl bg-surface p-4 shadow-surface">
      <div className="grid gap-2 border-b border-separator pb-4">
        <Skeleton className="h-5 w-40" />
        <Skeleton className="h-4 w-3/4" />
      </div>
      <Skeleton className={`flex-1 ${output ? "min-h-80" : "min-h-64"}`} />
    </div>
  );
}
