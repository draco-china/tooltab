import { Skeleton } from "@heroui/react";

export function HighwayHashTextOrFileSkeleton() {
  return (
    <div className="grid gap-6" aria-busy="true">
      {["configuration", "input", "result"].map((panel) => (
        <div
          key={panel}
          className="overflow-hidden rounded-xl bg-surface shadow-surface"
        >
          <div className="grid gap-2 border-b border-separator p-4">
            <Skeleton className="h-5 w-40" />
            <Skeleton className="h-4 w-3/4" />
          </div>
          <div className="grid gap-4 p-4">
            <Skeleton className="h-11 w-full rounded-xl" />
            <Skeleton className="h-40 w-full rounded-xl" />
          </div>
        </div>
      ))}
    </div>
  );
}
