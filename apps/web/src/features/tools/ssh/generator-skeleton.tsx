import { Skeleton } from "@heroui/react";
import { m } from "@/paraglide/messages.js";
export function SshKeyGeneratorRouteSkeleton({
  label = m["common.processing"](),
}: {
  label?: string;
} = {}) {
  return (
    <div
      className="grid gap-6"
      role="status"
      aria-busy="true"
      aria-label={label}
    >
      <Skeleton className="h-5 w-4/5" />
      <div className="grid gap-4 sm:grid-cols-2">
        <Skeleton className="h-11 rounded-xl" />
        <Skeleton className="h-11 rounded-xl" />
      </div>
      <Skeleton className="h-11 rounded-xl" />
      <div className="flex gap-2">
        <Skeleton className="h-11 w-40 rounded-xl" />
        <Skeleton className="h-11 w-28 rounded-xl" />
      </div>
      <Skeleton className="h-72 rounded-xl" />
    </div>
  );
}
