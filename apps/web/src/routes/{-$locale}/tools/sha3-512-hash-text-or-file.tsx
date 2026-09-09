import { createFileRoute } from "@tanstack/react-router";
import { Sha3512Tool } from "@/features/tools/hash-text-or-file/page";
import { sha3512HashTextOrFileHead } from "@/features/tools/hash-text-or-file/head";

import { Sha3512HashSkeleton } from "@/features/tools/hash-text-or-file/sha3-512-skeleton";

export const Route = createFileRoute(
  "/{-$locale}/tools/sha3-512-hash-text-or-file",
)({
  head: sha3512HashTextOrFileHead,
  pendingComponent: Sha3512HashSkeleton,
  component: Sha3512Tool,
});
