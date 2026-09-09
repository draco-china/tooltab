import { Skeleton } from "@heroui/react";
import { m } from "@/paraglide/messages.js";

const colorSkeletonKeys = [
  "color-one",
  "color-two",
  "color-three",
  "color-four",
  "color-five",
  "color-six",
  "color-seven",
  "color-eight",
  "color-nine",
];

export function HtmlColorNamesSkeleton({
  label = m["common.processing"](),
}: {
  label?: string;
} = {}) {
  return (
    <div
      className="overflow-hidden rounded-xl bg-surface shadow-surface"
      role="status"
      aria-busy="true"
      aria-label={label}
    >
      <div className="grid gap-2 border-b border-separator p-4">
        <Skeleton className="h-5 w-48" />
        <Skeleton className="h-4 w-3/4" />
      </div>
      <div className="grid gap-5 p-4">
        <Skeleton className="h-11 w-full rounded-xl" />
        <Skeleton className="h-9 w-full rounded-xl" />
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {colorSkeletonKeys.map((key) => (
            <Skeleton key={key} className="h-44 rounded-xl" />
          ))}
        </div>
      </div>
    </div>
  );
}
