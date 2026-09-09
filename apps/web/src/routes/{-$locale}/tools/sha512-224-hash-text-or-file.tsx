import { createFileRoute } from "@tanstack/react-router";
import { Sha512224Tool } from "@/features/tools/hash-text-or-file/page";
import { sha512224HashTextOrFileHead } from "@/features/tools/hash-text-or-file/head";

import { Sha512224HashSkeleton } from "@/features/tools/hash-text-or-file/sha512-224-skeleton";

export const Route = createFileRoute(
  "/{-$locale}/tools/sha512-224-hash-text-or-file",
)({
  head: sha512224HashTextOrFileHead,
  pendingComponent: Sha512224HashSkeleton,
  component: Sha512224Tool,
});
