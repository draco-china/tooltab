import { Skeleton } from "@heroui/react";

const FONT_SKELETONS = ["one", "two", "three", "four", "five", "six"];

export function LocalFontBookSkeleton() {
  return (
    <div className="grid gap-6" aria-busy="true">
      <Skeleton className="h-40 rounded-xl" />
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
        {FONT_SKELETONS.map((key) => (
          <Skeleton key={key} className="h-48 rounded-xl" />
        ))}
      </div>
    </div>
  );
}
