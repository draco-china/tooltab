import { createFileRoute } from "@tanstack/react-router";
import Ripemd128Tool from "@/features/tools/ripemd128-hash-text-or-file/page";
import { ripemd128HashTextOrFileHead } from "@/features/tools/ripemd128-hash-text-or-file/head";

import { Ripemd128Skeleton } from "@/features/tools/ripemd128-hash-text-or-file/skeleton";

export const Route = createFileRoute(
  "/{-$locale}/tools/ripemd128-hash-text-or-file",
)({
  head: ripemd128HashTextOrFileHead,
  pendingComponent: Ripemd128Skeleton,
  component: Ripemd128Tool,
});
