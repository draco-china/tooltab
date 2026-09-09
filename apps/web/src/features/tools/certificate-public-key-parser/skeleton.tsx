import { Skeleton } from "@heroui/react";

export function CertificatePublicKeyParserSkeleton() {
  return (
    <main className="flex flex-col gap-8 sm:gap-10" aria-busy="true">
      <div className="grid gap-3">
        <Skeleton className="h-9 w-96 max-w-3/4" />
        <Skeleton className="h-5 w-full max-w-3xl" />
      </div>
      <div className="mx-auto grid w-full max-w-7xl gap-6">
        {[0, 1].map((panel) => (
          <div
            key={panel}
            className="grid gap-4 overflow-hidden rounded-xl bg-surface p-4 shadow-surface"
          >
            <div className="flex items-start justify-between gap-3 border-b border-separator pb-4">
              <div className="grid gap-2">
                <Skeleton className="h-5 w-48" />
                <Skeleton className="h-4 w-4/5" />
              </div>
              <Skeleton className={panel === 0 ? "h-9 w-40" : "h-9 w-24"} />
            </div>
            <Skeleton className="min-h-72 w-full rounded-xl" />
          </div>
        ))}
      </div>
    </main>
  );
}
