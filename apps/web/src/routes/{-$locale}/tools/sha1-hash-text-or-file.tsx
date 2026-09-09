import { createFileRoute } from "@tanstack/react-router";
import { Sha1Tool } from "@/features/tools/hash-text-or-file/page";
import { sha1HashTextOrFileHead } from "@/features/tools/hash-text-or-file/head";

import { Sha1HashRouteSkeleton } from "@/features/tools/hash-text-or-file/sha2-skeleton";

export const Route = createFileRoute(
  "/{-$locale}/tools/sha1-hash-text-or-file",
)({
  head: sha1HashTextOrFileHead,
  pendingComponent: Sha1HashRouteSkeleton,
  component: Sha1Tool,
});
