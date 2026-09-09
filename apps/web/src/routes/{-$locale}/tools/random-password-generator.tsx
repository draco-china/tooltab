import { createFileRoute } from "@tanstack/react-router";
import RandomPasswordGeneratorPage from "@/features/tools/random-password-generator/page";
import { randomPasswordGeneratorHead } from "@/features/tools/random-password-generator/head";

import { RandomPasswordGeneratorRouteSkeleton } from "@/features/tools/random-password-generator/skeleton";

export const Route = createFileRoute(
  "/{-$locale}/tools/random-password-generator",
)({
  head: randomPasswordGeneratorHead,
  pendingComponent: RandomPasswordGeneratorRouteSkeleton,
  component: RandomPasswordGeneratorPage,
});
