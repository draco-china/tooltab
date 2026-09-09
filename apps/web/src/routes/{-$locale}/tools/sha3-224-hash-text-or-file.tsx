import { createFileRoute } from "@tanstack/react-router";
import { Sha3224Tool } from "@/features/tools/hash-text-or-file/page";
import { sha3224HashTextOrFileHead } from "@/features/tools/hash-text-or-file/head";

import { Sha3224HashSkeleton } from "@/features/tools/hash-text-or-file/sha3-224-skeleton";

export const Route = createFileRoute(
  "/{-$locale}/tools/sha3-224-hash-text-or-file",
)({
  head: sha3224HashTextOrFileHead,
  pendingComponent: Sha3224HashSkeleton,
  component: Sha3224Tool,
});
