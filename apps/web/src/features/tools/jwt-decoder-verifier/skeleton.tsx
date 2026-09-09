import { Skeleton } from "@heroui/react";

export function JwtDecoderVerifierSkeleton() {
  return (
    <div className="grid gap-6" aria-busy="true">
      <div className="grid gap-4 rounded-2xl border border-border p-4 sm:p-6">
        <div className="flex justify-between gap-3">
          <Skeleton className="h-6 w-40" />
          <Skeleton className="h-9 w-24 rounded-xl" />
        </div>
        <Skeleton className="h-64" />
        <div className="grid gap-4 border-t border-separator pt-5 lg:grid-cols-2">
          <Skeleton className="h-12" />
          <Skeleton className="h-32" />
        </div>
      </div>
      <div className="grid gap-6 lg:grid-cols-2">
        <Skeleton className="h-80 rounded-2xl" />
        <Skeleton className="h-80 rounded-2xl" />
      </div>
    </div>
  );
}
