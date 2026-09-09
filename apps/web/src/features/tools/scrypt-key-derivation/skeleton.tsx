import { Skeleton } from "@heroui/react";
import { m } from "@/paraglide/messages.js";
export function ScryptKeyDerivationRouteSkeleton({
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
      {["h-72", "h-48", "h-72"].map((height) => (
        <div
          key={height}
          className="overflow-hidden rounded-xl bg-surface shadow-surface"
        >
          <div className="border-b border-separator p-4">
            <Skeleton className="h-5 w-40" />
          </div>
          <div className="p-4">
            <Skeleton className={`${height} w-full rounded-xl`} />
          </div>
        </div>
      ))}
    </div>
  );
}
