import { createFileRoute } from "@tanstack/react-router";
import Xxh32Tool from "@/features/tools/xxhash-xxh32-hash-text-or-file/page";
import { xxhashXxh32HashTextOrFileHead } from "@/features/tools/xxhash-xxh32-hash-text-or-file/head";

import { Xxh32Skeleton } from "@/features/tools/xxhash-xxh32-hash-text-or-file/skeleton";

export const Route = createFileRoute(
  "/{-$locale}/tools/xxhash-xxh32-hash-text-or-file",
)({
  head: xxhashXxh32HashTextOrFileHead,
  pendingComponent: Xxh32Skeleton,
  component: Xxh32Tool,
});
