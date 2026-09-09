import { createFileRoute } from "@tanstack/react-router";
import { Sha2HashRouteSkeleton } from "@/features/tools/hash-text-or-file/sha2-skeleton";
import Sha384Tool from "@/features/tools/hash-text-or-file/sha384-page";
import { sha384HashTextOrFileHead } from "@/features/tools/hash-text-or-file/head";

export const Route = createFileRoute(
  "/{-$locale}/tools/sha384-hash-text-or-file",
)({
  head: sha384HashTextOrFileHead,
  pendingComponent: Sha2HashRouteSkeleton,
  component: Sha384Tool,
});
