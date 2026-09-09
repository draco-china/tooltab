import { createFileRoute } from "@tanstack/react-router";
import Blake2bHashTextOrFilePage from "@/features/tools/blake2b-hash-text-or-file/page";
import { blake2bHashTextOrFileHead } from "@/features/tools/blake2b-hash-text-or-file/head";

import { Blake2bHashTextOrFileRouteSkeleton } from "@/features/tools/blake2b-hash-text-or-file/skeleton";

export const Route = createFileRoute(
  "/{-$locale}/tools/blake2b-hash-text-or-file",
)({
  head: blake2bHashTextOrFileHead,
  pendingComponent: Blake2bHashTextOrFileRouteSkeleton,
  component: Blake2bHashTextOrFilePage,
});
