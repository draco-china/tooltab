import { createFileRoute } from "@tanstack/react-router";
import Md5Hash from "@/features/tools/md5-hash-text-or-file/page";
import { md5HashTextOrFileHead } from "@/features/tools/md5-hash-text-or-file/head";

import { Md5HashSkeleton } from "@/features/tools/md5-hash-text-or-file/skeleton";

export const Route = createFileRoute("/{-$locale}/tools/md5-hash-text-or-file")(
  {
    head: md5HashTextOrFileHead,
    pendingComponent: Md5HashSkeleton,
    component: Md5Hash,
  },
);
