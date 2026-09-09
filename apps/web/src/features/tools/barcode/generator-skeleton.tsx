import { Skeleton } from "@heroui/react";

const optionFields = [
  "format",
  "display",
  "alignment",
  "position",
  "line-color",
  "background",
  "bar-width",
  "bar-height",
  "margin",
  "font-size",
] as const;

export function BarcodeGeneratorSkeleton() {
  return (
    <main className="flex flex-col gap-8 sm:gap-10" aria-busy="true">
      <div className="grid gap-3">
        <Skeleton className="h-9 w-72 max-w-3/4" />
        <Skeleton className="h-5 w-full max-w-2xl" />
      </div>
      <div className="grid gap-6 xl:grid-cols-2">
        <div className="overflow-hidden rounded-xl bg-surface shadow-surface xl:order-1">
          <PanelHeaderSkeleton />
          <div className="grid gap-6 p-4 sm:grid-cols-2 xl:grid-cols-3">
            <Skeleton className="h-11 sm:col-span-2 xl:col-span-3" />
            {optionFields.map((field) => (
              <Skeleton key={field} className="h-11 w-full" />
            ))}
          </div>
        </div>
        <div className="overflow-hidden rounded-xl bg-surface shadow-surface xl:order-2">
          <PanelHeaderSkeleton />
          <div className="grid gap-4 p-4">
            <Skeleton className="h-72 w-full rounded-xl" />
          </div>
          <div className="flex flex-wrap gap-2 border-t border-separator p-4">
            {["png", "svg", "jpeg", "webp"].map((format) => (
              <Skeleton key={format} className="h-10 w-24" />
            ))}
          </div>
        </div>
      </div>
    </main>
  );
}

function PanelHeaderSkeleton() {
  return (
    <div className="grid gap-2 border-b border-separator p-4">
      <Skeleton className="h-5 w-28" />
      <Skeleton className="h-4 w-3/4" />
    </div>
  );
}
