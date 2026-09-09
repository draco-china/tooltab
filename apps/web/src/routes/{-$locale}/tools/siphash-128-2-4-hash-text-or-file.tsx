import { createFileRoute } from "@tanstack/react-router";
import { SipHash128Tool } from "@/features/tools/siphash/page";
import { siphash12824HashTextOrFileHead } from "@/features/tools/siphash/head";

import { SipHashRouteSkeleton } from "@/features/tools/siphash/skeleton";

export const Route = createFileRoute(
  "/{-$locale}/tools/siphash-128-2-4-hash-text-or-file",
)({
  head: siphash12824HashTextOrFileHead,
  pendingComponent: SipHashRouteSkeleton,
  component: SipHash128Tool,
});
