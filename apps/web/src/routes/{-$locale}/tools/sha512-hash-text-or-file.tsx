import { createFileRoute } from "@tanstack/react-router";
import { Sha512Tool } from "@/features/tools/hash-text-or-file/page";
import { sha512HashTextOrFileHead } from "@/features/tools/hash-text-or-file/head";

import { ShaSingleHashRouteSkeleton } from "@/features/tools/hash-text-or-file/sha2-skeleton";

export const Route = createFileRoute(
  "/{-$locale}/tools/sha512-hash-text-or-file",
)({
  head: sha512HashTextOrFileHead,
  pendingComponent: ShaSingleHashRouteSkeleton,
  component: Sha512Tool,
});
