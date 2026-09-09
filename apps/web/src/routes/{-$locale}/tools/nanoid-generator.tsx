import { createFileRoute } from "@tanstack/react-router";
import NanoidGeneratorPage from "@/features/tools/nanoid-generator/page";
import { nanoidGeneratorHead } from "@/features/tools/nanoid-generator/head";

import { NanoidGeneratorSkeleton } from "@/features/tools/nanoid-generator/skeleton";

export const Route = createFileRoute("/{-$locale}/tools/nanoid-generator")({
  head: nanoidGeneratorHead,
  pendingComponent: NanoidGeneratorSkeleton,
  component: NanoidGeneratorPage,
});
