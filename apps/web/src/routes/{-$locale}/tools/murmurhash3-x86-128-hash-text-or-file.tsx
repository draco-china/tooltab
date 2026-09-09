import { createFileRoute } from "@tanstack/react-router";
import { MurmurHash3RouteSkeleton } from "@/features/tools/murmurhash3-128/skeleton";
import MurmurHash3X86128 from "@/features/tools/murmurhash3-128/x86-128-page";
import { murmurhash3X86128HashTextOrFileHead } from "@/features/tools/murmurhash3-128/head";

export const Route = createFileRoute(
  "/{-$locale}/tools/murmurhash3-x86-128-hash-text-or-file",
)({
  head: murmurhash3X86128HashTextOrFileHead,
  pendingComponent: MurmurHash3RouteSkeleton,
  component: MurmurHash3X86128,
});
