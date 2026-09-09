import { createFileRoute } from "@tanstack/react-router";
import { Adler32Tool } from "@/features/tools/adler32-hash-text-or-file/page";
import { adler32HashTextOrFileHead } from "@/features/tools/adler32-hash-text-or-file/head";

import { Adler32RouteSkeleton } from "@/features/tools/adler32-hash-text-or-file/skeleton";

export const Route = createFileRoute(
  "/{-$locale}/tools/adler32-hash-text-or-file",
)({
  head: adler32HashTextOrFileHead,
  pendingComponent: Adler32RouteSkeleton,
  component: Adler32Tool,
});
