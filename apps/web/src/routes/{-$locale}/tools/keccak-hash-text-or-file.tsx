import { createFileRoute } from "@tanstack/react-router";
import { KeccakHashTextOrFile } from "@/features/tools/keccak-hash-text-or-file/page";
import { keccakHashTextOrFileHead } from "@/features/tools/keccak-hash-text-or-file/head";

import { KeccakRouteSkeleton } from "@/features/tools/keccak-hash-text-or-file/skeleton";

export const Route = createFileRoute(
  "/{-$locale}/tools/keccak-hash-text-or-file",
)({
  head: keccakHashTextOrFileHead,
  pendingComponent: KeccakRouteSkeleton,
  component: KeccakHashTextOrFile,
});
