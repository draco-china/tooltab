import { Skeleton } from "@heroui/react";
import { m } from "@/paraglide/messages.js";

export function UuidConverterRouteSkeleton({
  label = m["common.processing"](),
}: {
  label?: string;
} = {}) {
  return (
    <main className="grid gap-8" aria-busy="true">
      <div className="grid gap-3">
        <Skeleton className="h-9 w-80" />
        <Skeleton className="h-5 w-full max-w-2xl" />
      </div>
      <div role="status" aria-label={label} className="grid gap-6">
        <span className="sr-only">{label}</span>
        <Skeleton className="ms-auto h-9 w-72 max-w-full rounded-lg" />
        <div className="grid gap-6 md:grid-cols-2 xl:grid-cols-3">
          {["uuid", "base64", "hex", "decimal", "octal", "binary"].map(
            (format) => (
              <Skeleton className="h-44 rounded-xl" key={format} />
            ),
          )}
        </div>
      </div>
    </main>
  );
}
