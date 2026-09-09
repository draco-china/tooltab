import { createFileRoute } from "@tanstack/react-router";
import GitignoreGeneratorPage from "@/features/tools/gitignore-generator/page";
import { gitignoreGeneratorHead } from "@/features/tools/gitignore-generator/head";

import { GitignoreGeneratorRouteSkeleton } from "@/features/tools/gitignore-generator/skeleton";

export const Route = createFileRoute("/{-$locale}/tools/gitignore-generator")({
  head: gitignoreGeneratorHead,
  pendingComponent: GitignoreGeneratorRouteSkeleton,
  component: GitignoreGeneratorPage,
});
