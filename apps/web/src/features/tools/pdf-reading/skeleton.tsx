import { Skeleton } from "@heroui/react";
import { m } from "@/paraglide/messages.js";
export function PdfReadingRouteSkeleton({
  label = m["common.processing"](),
  preview = false,
}: {
  label?: string;
  preview?: boolean;
} = {}) {
  return (
    <div
      className="grid gap-8"
      role="status"
      aria-busy="true"
      aria-label={label}
    >
      <div className="grid items-stretch gap-6 xl:grid-cols-[minmax(0,22rem)_minmax(0,1fr)]">
        <Skeleton className="h-120 rounded-xl" />
        {preview ? (
          <div className="grid gap-4">
            <Skeleton className="h-168 rounded-xl" />
            <div className="flex justify-center">
              <Skeleton className="h-9 w-48 rounded-lg" />
            </div>
          </div>
        ) : (
          <Skeleton className="h-120 rounded-xl" />
        )}
      </div>
      <div className="grid gap-3">
        <Skeleton className="h-7 w-64" />
        <Skeleton className="h-4 w-full" />
        <Skeleton className="h-4 w-5/6" />
      </div>
    </div>
  );
}

export function PdfReadingPreviewRouteSkeleton() {
  return <PdfReadingRouteSkeleton preview />;
}
