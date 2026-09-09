import { createFileRoute } from "@tanstack/react-router";
import Xxh364Tool from "@/features/tools/xxhash-xxh3-64-hash-text-or-file/page";
import { xxhashXxh364HashTextOrFileHead } from "@/features/tools/xxhash-xxh3-64-hash-text-or-file/head";

import { Xxh364Skeleton } from "@/features/tools/xxhash-xxh3-64-hash-text-or-file/skeleton";

export const Route = createFileRoute(
  "/{-$locale}/tools/xxhash-xxh3-64-hash-text-or-file",
)({
  head: xxhashXxh364HashTextOrFileHead,
  pendingComponent: Xxh364Skeleton,
  component: Xxh364Tool,
});
