import { createFileRoute } from "@tanstack/react-router";
import { Sha224Tool } from "@/features/tools/hash-text-or-file/page";
import { sha224HashTextOrFileHead } from "@/features/tools/hash-text-or-file/head";

import { Sha224HashSkeleton } from "@/features/tools/hash-text-or-file/sha224-skeleton";

export const Route = createFileRoute(
  "/{-$locale}/tools/sha224-hash-text-or-file",
)({
  head: sha224HashTextOrFileHead,
  pendingComponent: Sha224HashSkeleton,
  component: Sha224Tool,
});
