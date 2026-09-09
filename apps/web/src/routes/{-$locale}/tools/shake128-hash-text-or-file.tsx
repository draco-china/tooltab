import { createFileRoute } from "@tanstack/react-router";
import { Shake128Tool } from "@/features/tools/hash-text-or-file/page";
import { shake128HashTextOrFileHead } from "@/features/tools/hash-text-or-file/head";

import { ShakeHashRouteSkeleton } from "@/features/tools/hash-text-or-file/shake-skeleton";

export const Route = createFileRoute(
  "/{-$locale}/tools/shake128-hash-text-or-file",
)({
  head: shake128HashTextOrFileHead,
  pendingComponent: ShakeHashRouteSkeleton,
  component: Shake128Tool,
});
