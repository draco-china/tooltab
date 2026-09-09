import { Skeleton } from "@heroui/react";
import { m } from "@/paraglide/messages.js";

export function IsbnValidatorRouteSkeleton({
  label = m["common.processing"](),
}: {
  label?: string;
} = {}) {
  return <ValidatorSkeleton label={label} />;
}
export function ValidatorSkeleton({
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
        <Skeleton className="h-64 rounded-xl" />
        <Skeleton className="h-64 rounded-xl" />
      </div>
      <div className="grid gap-3">
        <Skeleton className="h-7 w-56" />
        <Skeleton className="h-4 w-full" />
        <Skeleton className="h-4 w-5/6" />
      </div>
    </div>
  );
}
