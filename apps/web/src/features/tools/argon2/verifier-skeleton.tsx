import { Skeleton } from "@heroui/react";

const fieldIds = ["password", "hash", "secret"] as const;

export function Argon2HashPasswordVerifierSkeleton() {
  return (
    <main className="flex flex-col gap-8 sm:gap-10" aria-busy="true">
      <div className="grid gap-3">
        <Skeleton className="h-9 w-80 max-w-3/4" />
        <Skeleton className="h-5 w-full max-w-2xl" />
      </div>
      <div className="grid gap-6">
        <PanelSkeleton fields={3} />
        <PanelSkeleton fields={1} />
      </div>
    </main>
  );
}

function PanelSkeleton({ fields }: { fields: number }) {
  return (
    <div className="flex min-h-52 flex-col rounded-xl bg-surface shadow-surface">
      <div className="grid gap-2 border-b border-separator p-4">
        <Skeleton className="h-5 w-36" />
        <Skeleton className="h-4 w-3/4" />
      </div>
      <div className="grid gap-5 p-4">
        {fieldIds.slice(0, fields).map((field, index) => (
          <div key={field} className="grid gap-2">
            <Skeleton className="h-4 w-28" />
            <Skeleton className={index === 1 ? "h-32 w-full" : "h-11 w-full"} />
            <Skeleton className="h-4 w-2/3" />
          </div>
        ))}
      </div>
    </div>
  );
}
