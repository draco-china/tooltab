import { createFileRoute } from "@tanstack/react-router";
import Xxh64Tool from "@/features/tools/xxhash-xxh64-hash-text-or-file/page";
import { xxhashXxh64HashTextOrFileHead } from "@/features/tools/xxhash-xxh64-hash-text-or-file/head";

import { Xxh64Skeleton } from "@/features/tools/xxhash-xxh64-hash-text-or-file/skeleton";

export const Route = createFileRoute(
  "/{-$locale}/tools/xxhash-xxh64-hash-text-or-file",
)({
  head: xxhashXxh64HashTextOrFileHead,
  pendingComponent: Xxh64Skeleton,
  component: Xxh64Tool,
});
