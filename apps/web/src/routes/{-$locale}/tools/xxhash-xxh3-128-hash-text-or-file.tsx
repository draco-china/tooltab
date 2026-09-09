import { createFileRoute } from "@tanstack/react-router";
import Xxh3128Tool from "@/features/tools/xxhash-xxh3-128-hash-text-or-file/page";
import { xxhashXxh3128HashTextOrFileHead } from "@/features/tools/xxhash-xxh3-128-hash-text-or-file/head";

import { Xxh3128Skeleton } from "@/features/tools/xxhash-xxh3-128-hash-text-or-file/skeleton";

export const Route = createFileRoute(
  "/{-$locale}/tools/xxhash-xxh3-128-hash-text-or-file",
)({
  head: xxhashXxh3128HashTextOrFileHead,
  pendingComponent: Xxh3128Skeleton,
  component: Xxh3128Tool,
});
