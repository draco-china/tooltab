import { createFileRoute } from "@tanstack/react-router";
import { Sha3384Tool } from "@/features/tools/hash-text-or-file/page";
import { sha3384HashTextOrFileHead } from "@/features/tools/hash-text-or-file/head";

import { Sha3384HashSkeleton } from "@/features/tools/hash-text-or-file/sha3-384-skeleton";

export const Route = createFileRoute(
  "/{-$locale}/tools/sha3-384-hash-text-or-file",
)({
  head: sha3384HashTextOrFileHead,
  pendingComponent: Sha3384HashSkeleton,
  component: Sha3384Tool,
});
