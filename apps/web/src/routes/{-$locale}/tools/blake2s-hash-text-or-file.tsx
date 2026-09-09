import { createFileRoute } from "@tanstack/react-router";
import Blake2sHashTextOrFilePage from "@/features/tools/blake2s-hash-text-or-file/page";
import { blake2sHashTextOrFileHead } from "@/features/tools/blake2s-hash-text-or-file/head";

import { Blake2sHashTextOrFileRouteSkeleton } from "@/features/tools/blake2s-hash-text-or-file/skeleton";

export const Route = createFileRoute(
  "/{-$locale}/tools/blake2s-hash-text-or-file",
)({
  head: blake2sHashTextOrFileHead,
  pendingComponent: Blake2sHashTextOrFileRouteSkeleton,
  component: Blake2sHashTextOrFilePage,
});
