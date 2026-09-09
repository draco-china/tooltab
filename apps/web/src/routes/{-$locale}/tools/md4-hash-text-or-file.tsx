import { createFileRoute } from "@tanstack/react-router";
import Md4Hash from "@/features/tools/md4-hash-text-or-file/page";
import { md4HashTextOrFileHead } from "@/features/tools/md4-hash-text-or-file/head";

import { Md4HashRouteSkeleton } from "@/features/tools/md4-hash-text-or-file/skeleton";

export const Route = createFileRoute("/{-$locale}/tools/md4-hash-text-or-file")(
  {
    head: md4HashTextOrFileHead,
    pendingComponent: Md4HashRouteSkeleton,
    component: Md4Hash,
  },
);
