import { Skeleton } from "@heroui/react";

export function SshPublicKeyFingerprintSkeleton() {
  return (
    <div className="grid gap-6" aria-busy="true" data-tool-panels>
      <Skeleton className="h-136 rounded-xl" />
      <Skeleton className="h-72 rounded-xl" />
    </div>
  );
}
