import { Skeleton } from "@heroui/react";
export function PdfMergerSkeleton() {
  return (
    <div className="grid gap-6" aria-busy="true">
      <div className="grid items-start gap-6 xl:grid-cols-[minmax(0,1fr)_24rem]">
        <div className="grid gap-6">
          <PanelSkeleton body="h-24" />
          <PanelSkeleton body="h-128" />
        </div>
        <div className="grid gap-6">
          <PanelSkeleton body="h-40" />
          <PanelSkeleton body="h-56" />
        </div>
      </div>
      <Skeleton className="h-7 w-64" />
    </div>
  );
}

function PanelSkeleton({ body }: { body: string }) {
  return (
    <div className="grid gap-4 rounded-xl bg-surface p-4 shadow-surface">
      <div className="grid gap-2 border-b border-separator pb-4">
        <Skeleton className="h-5 w-40" />
        <Skeleton className="h-4 w-4/5" />
      </div>
      <Skeleton className={`${body} w-full rounded-xl`} />
    </div>
  );
}
