import { Skeleton } from "@heroui/react";
import { m } from "@/paraglide/messages.js";

const PANEL_KEYS = ["presets", "numeric", "symbolic", "command"] as const;

export function ChmodCalculatorSkeleton({
  label = m["common.processing"](),
}: {
  label?: string;
} = {}) {
  return (
    <div
      role="status"
      aria-label={label}
      aria-busy="true"
      className="grid gap-8"
    >
      <span className="sr-only">{label}</span>
      <div className="grid gap-6">
        <Skeleton className="h-72 w-full rounded-xl" />
        <div className="grid gap-6 lg:grid-cols-2">
          {PANEL_KEYS.map((panel) => (
            <Skeleton key={panel} className="h-48 w-full rounded-xl" />
          ))}
        </div>
      </div>
      <Skeleton className="h-64 rounded-xl" />
    </div>
  );
}
