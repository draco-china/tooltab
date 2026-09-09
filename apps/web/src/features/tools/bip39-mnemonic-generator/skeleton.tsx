import { Skeleton } from "@heroui/react";
import { m } from "@/paraglide/messages.js";

export function Bip39MnemonicGeneratorRouteSkeleton({
  label = m["common.processing"](),
}: {
  label?: string;
} = {}) {
  return (
    <main className="flex flex-col gap-8" aria-busy="true">
      <div className="grid gap-3">
        <Skeleton className="h-9 w-80 max-w-3/4" />
        <Skeleton className="h-5 w-full max-w-2xl" />
      </div>
      <div
        role="status"
        aria-label={label}
        className="grid gap-6 xl:grid-cols-[minmax(0,0.95fr)_minmax(0,1.05fr)]"
      >
        <span className="sr-only">{label}</span>
        <div className="grid content-start gap-5 rounded-xl bg-surface p-4 shadow-surface">
          <Skeleton className="h-5 w-28" />
          <Skeleton className="h-4 w-5/6" />
          <Skeleton className="h-11 w-full" />
          <Skeleton className="h-11 w-full" />
          <Skeleton className="h-11 w-full" />
          <Skeleton className="h-24 w-full rounded-xl" />
        </div>
        <div className="grid content-start gap-5 rounded-xl bg-surface p-4 shadow-surface">
          <Skeleton className="h-5 w-28" />
          <Skeleton className="h-4 w-4/5" />
          <Skeleton className="h-40 w-full rounded-xl" />
          <Skeleton className="h-24 w-full rounded-xl" />
        </div>
      </div>
    </main>
  );
}
