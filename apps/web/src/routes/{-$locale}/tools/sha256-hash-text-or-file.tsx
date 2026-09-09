import { createFileRoute } from "@tanstack/react-router";
import { Sha2HashRouteSkeleton } from "@/features/tools/hash-text-or-file/sha2-skeleton";
import Sha256Tool from "@/features/tools/hash-text-or-file/sha256-page";
import { sha256HashTextOrFileHead } from "@/features/tools/hash-text-or-file/head";

export const Route = createFileRoute(
  "/{-$locale}/tools/sha256-hash-text-or-file",
)({
  head: sha256HashTextOrFileHead,
  pendingComponent: Sha2HashRouteSkeleton,
  component: Sha256Tool,
});
