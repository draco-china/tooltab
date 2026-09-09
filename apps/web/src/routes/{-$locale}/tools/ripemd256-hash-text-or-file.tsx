import { createFileRoute } from "@tanstack/react-router";
import Ripemd256Tool from "@/features/tools/ripemd256-hash-text-or-file/page";
import { ripemd256HashTextOrFileHead } from "@/features/tools/ripemd256-hash-text-or-file/head";

import { Ripemd256Skeleton } from "@/features/tools/ripemd256-hash-text-or-file/skeleton";

export const Route = createFileRoute(
  "/{-$locale}/tools/ripemd256-hash-text-or-file",
)({
  head: ripemd256HashTextOrFileHead,
  pendingComponent: Ripemd256Skeleton,
  component: Ripemd256Tool,
});
