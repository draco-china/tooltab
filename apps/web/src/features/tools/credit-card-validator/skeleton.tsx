import { Skeleton } from "@heroui/react";
import { m } from "@/paraglide/messages.js";

export function CreditCardValidatorRouteSkeleton({
  label = m["common.processing"](),
}: {
  label?: string;
} = {}) {
  return (
    <main
      className="grid gap-8"
      role="status"
      aria-busy="true"
      aria-label={label}
    >
      <div className="grid gap-3">
        <Skeleton className="h-9 w-80 max-w-3/4" />
        <Skeleton className="h-5 w-full max-w-3xl" />
      </div>
      <div className="grid gap-6">
        <PanelSkeleton />
        <PanelSkeleton wide />
      </div>
      <div className="grid gap-3">
        <Skeleton className="h-7 w-64" />
        <Skeleton className="h-4 w-full" />
        <Skeleton className="h-4 w-5/6" />
      </div>
    </main>
  );
}

function PanelSkeleton({ wide = false }: { wide?: boolean }) {
  return (
    <div className="overflow-hidden rounded-xl bg-surface shadow-surface">
      <div className="grid gap-2 border-b border-separator p-4">
        <Skeleton className="h-5 w-36" />
        <Skeleton className="h-4 w-4/5" />
      </div>
      <div className="grid gap-4 p-4">
        <Skeleton className="h-10 w-full rounded-xl" />
        <Skeleton
          className={wide ? "h-44 w-full rounded-xl" : "h-24 w-full rounded-xl"}
        />
      </div>
    </div>
  );
}
