import { createFileRoute } from "@tanstack/react-router";
import { Sha512256Tool } from "@/features/tools/hash-text-or-file/page";
import { sha512256HashTextOrFileHead } from "@/features/tools/hash-text-or-file/head";

import { Sha512256HashSkeleton } from "@/features/tools/hash-text-or-file/sha512-256-skeleton";

export const Route = createFileRoute(
  "/{-$locale}/tools/sha512-256-hash-text-or-file",
)({
  head: sha512256HashTextOrFileHead,
  pendingComponent: Sha512256HashSkeleton,
  component: Sha512256Tool,
});
