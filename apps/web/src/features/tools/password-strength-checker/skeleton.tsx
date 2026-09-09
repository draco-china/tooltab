import { Skeleton } from "@heroui/react";
import { m } from "@/paraglide/messages.js";
export function PasswordStrengthCheckerRouteSkeleton({
  label = m["common.processing"](),
}: {
  label?: string;
} = {}) {
  return (
    <div
      className="grid gap-8"
      role="status"
      aria-busy="true"
      aria-label={label}
    >
      <div className="grid gap-6 xl:grid-cols-[minmax(0,22rem)_minmax(0,1fr)]">
        <Panel h="h-48" />
        <Panel h="h-72" />
      </div>
      <Skeleton className="h-28 w-full" />
    </div>
  );
}
function Panel({ h }: { h: string }) {
  return (
    <div className="overflow-hidden rounded-xl bg-surface shadow-surface">
      <div className="border-b border-separator p-4">
        <Skeleton className="h-5 w-32" />
      </div>
      <div className="p-4">
        <Skeleton className={`${h} w-full rounded-xl`} />
      </div>
    </div>
  );
}
