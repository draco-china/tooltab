import { Skeleton } from "@heroui/react";
export function Pbkdf2KeyDerivationSkeleton() {
  return (
    <div className="grid gap-6" aria-busy="true">
      <Skeleton className="h-72 rounded-xl" />
      <Skeleton className="h-40 rounded-xl" />
      <Skeleton className="h-64 rounded-xl" />
    </div>
  );
}
