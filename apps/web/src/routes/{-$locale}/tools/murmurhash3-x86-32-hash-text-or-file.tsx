import { createFileRoute } from "@tanstack/react-router";
import MurmurHash3X8632 from "@/features/tools/murmurhash3-x86-32-hash-text-or-file/page";
import { murmurhash3X8632HashTextOrFileHead } from "@/features/tools/murmurhash3-x86-32-hash-text-or-file/head";

import { MurmurHash3X8632Skeleton } from "@/features/tools/murmurhash3-x86-32-hash-text-or-file/skeleton";

export const Route = createFileRoute(
  "/{-$locale}/tools/murmurhash3-x86-32-hash-text-or-file",
)({
  head: murmurhash3X8632HashTextOrFileHead,
  pendingComponent: MurmurHash3X8632Skeleton,
  component: MurmurHash3X8632,
});
