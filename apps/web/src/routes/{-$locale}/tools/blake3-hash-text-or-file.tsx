import { createFileRoute } from "@tanstack/react-router";
import Blake3HashTextOrFilePage from "@/features/tools/blake3-hash-text-or-file/page";
import { blake3HashTextOrFileHead } from "@/features/tools/blake3-hash-text-or-file/head";

import { Blake3HashTextOrFileRouteSkeleton } from "@/features/tools/blake3-hash-text-or-file/skeleton";

export const Route = createFileRoute(
  "/{-$locale}/tools/blake3-hash-text-or-file",
)({
  head: blake3HashTextOrFileHead,
  pendingComponent: Blake3HashTextOrFileRouteSkeleton,
  component: Blake3HashTextOrFilePage,
});
