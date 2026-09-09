import { createFileRoute } from "@tanstack/react-router";
import { Shake256Tool } from "@/features/tools/hash-text-or-file/page";
import { shake256HashTextOrFileHead } from "@/features/tools/hash-text-or-file/head";

import { ShakeHashRouteSkeleton } from "@/features/tools/hash-text-or-file/shake-skeleton";

export const Route = createFileRoute(
  "/{-$locale}/tools/shake256-hash-text-or-file",
)({
  head: shake256HashTextOrFileHead,
  pendingComponent: ShakeHashRouteSkeleton,
  component: Shake256Tool,
});
