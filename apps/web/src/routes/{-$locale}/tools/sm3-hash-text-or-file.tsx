import { createFileRoute } from "@tanstack/react-router";
import Sm3Hash from "@/features/tools/sm3-hash-text-or-file/page";
import { sm3HashTextOrFileHead } from "@/features/tools/sm3-hash-text-or-file/head";

import { Sm3HashRouteSkeleton } from "@/features/tools/sm3-hash-text-or-file/skeleton";

export const Route = createFileRoute("/{-$locale}/tools/sm3-hash-text-or-file")(
  {
    head: sm3HashTextOrFileHead,
    pendingComponent: Sm3HashRouteSkeleton,
    component: Sm3Hash,
  },
);
