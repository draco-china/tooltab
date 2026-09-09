import { createFileRoute } from "@tanstack/react-router";
import UnixTimestampConverter from "@/features/tools/unix-timestamp-converter/page";
import { unixTimestampConverterHead } from "@/features/tools/unix-timestamp-converter/head";

import { UnixTimestampRouteSkeleton } from "@/features/tools/unix-timestamp-converter/skeleton";

export const Route = createFileRoute(
  "/{-$locale}/tools/unix-timestamp-converter",
)({
  head: unixTimestampConverterHead,
  pendingComponent: UnixTimestampRouteSkeleton,
  component: UnixTimestampConverter,
});
