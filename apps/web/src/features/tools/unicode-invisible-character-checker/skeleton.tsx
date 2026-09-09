import { Skeleton } from "@heroui/react";
import { m } from "@/paraglide/messages.js";
export function UnicodeInvisibleCharacterCheckerRouteSkeleton({
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
      data-tool-panels
    >
      <div className="grid gap-6 lg:grid-cols-[minmax(0,2fr)_minmax(18rem,1fr)]">
        <Skeleton className="h-128 w-full rounded-xl" />
        <Skeleton className="h-128 w-full rounded-xl" />
      </div>
      <Skeleton className="h-72 w-full rounded-xl" />
    </div>
  );
}
