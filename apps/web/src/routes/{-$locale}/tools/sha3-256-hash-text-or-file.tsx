import { createFileRoute } from "@tanstack/react-router";
import { Sha3256Tool } from "@/features/tools/hash-text-or-file/page";
import { sha3256HashTextOrFileHead } from "@/features/tools/hash-text-or-file/head";

import { Sha3256HashSkeleton } from "@/features/tools/hash-text-or-file/sha3-256-skeleton";

export const Route = createFileRoute(
  "/{-$locale}/tools/sha3-256-hash-text-or-file",
)({
  head: sha3256HashTextOrFileHead,
  pendingComponent: Sha3256HashSkeleton,
  component: Sha3256Tool,
});
